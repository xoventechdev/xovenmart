import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { Prisma } from "@prisma/client";
import { JwtAudience, TokenService } from "../../shared/jwt/token.service";
import { SmsService } from "../../shared/sms/sms.service";
import { AdminLoginDto, CustomerLoginDto, ForgotPasswordDto, RegisterDto, ResetPasswordDto, RiderLoginDto, VerifyOtpDto } from "./dto";

const OTP_TTL_MINUTES = 5;
const BCRYPT_ROUNDS = 12;

/**
 * Whether the API should expose the raw OTP in responses (as `devCode`)
 * and in server logs. Default: yes, for ease of testing. Production
 * deployments should explicitly set `OTP_HIDE_DEV_CODE=1` to keep the
 * code out of HTTP responses.
 */
const DEV_CODE_ENABLED = process.env.OTP_HIDE_DEV_CODE !== "1";

interface IssueContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly token: TokenService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Read the `enableReferrals` admin toggle. Cached at module scope
   * because the feature-toggles public endpoint reads the same row and
   * is itself cached for 60s on the front-end. Defaults to TRUE — the
   * first-time install behavior should match the seeded default.
   *
   * Note: this is read every call. If traffic grows we can move it to
   * an in-memory TTL cache. For now (≤1000 RPS auth) a single `findUnique`
   * per registration is negligible.
   */
  private async isReferralsEnabled(): Promise<boolean> {
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: "feature.enableReferrals" },
      });
      if (!row) return true;
      try {
        const v = JSON.parse(row.value);
        return typeof v === "boolean" ? v : true;
      } catch {
        return true;
      }
    } catch (e) {
      // Fail open — if the settings table is unreachable, don't break
      // registration. The toggle is a soft gate.
      this.logger.warn(
        `isReferralsEnabled: settings read failed, defaulting to true: ${(e as Error).message}`,
      );
      return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Customer — Password login / forgot / reset
  // ═══════════════════════════════════════════════════════════════

  /**
   * Phone + password login for returning users.
   * Errors are returned as machine-readable codes so the frontend can
   * route the user to the right next step:
   *   - USER_NOT_FOUND       → suggest registration
   *   - PASSWORD_NOT_SET     → existing OTP-only user must set a password
   *   - INVALID_CREDENTIALS  → wrong password
   */
  async customerLogin(dto: CustomerLoginDto, req: Request) {
    const phone = dto.phone;
    const user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      this.logger.warn(`login.failed: USER_NOT_FOUND phone=${phone} ip=${req.ip ?? "-"}`);
      throw new UnauthorizedException("USER_NOT_FOUND");
    }

    if (!user.passwordHash) {
      this.logger.warn(
        `login.failed: PASSWORD_NOT_SET phone=${phone} userId=${user.id} ip=${req.ip ?? "-"}`,
      );
      throw new UnauthorizedException("PASSWORD_NOT_SET");
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      this.logger.warn(
        `login.failed: INVALID_CREDENTIALS phone=${phone} userId=${user.id} ip=${req.ip ?? "-"}`,
      );
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    this.logger.log(`login.success: phone=${phone} userId=${user.id} ip=${req.ip ?? "-"}`);

    const tokens = await this.token.issueTokens({
      subject: user.id,
      audience: JwtAudience.CUSTOMER,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    return {
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
      },
      ...tokens,
    };
  }

  /**
   * Forgot password — always returns 200 to prevent phone enumeration.
   * If the user exists, a fresh reset-password OTP is generated and
   * sent via SMS. Otherwise we silently no-op.
   */
  async forgotPassword(dto: ForgotPasswordDto, req: Request) {
    const phone = dto.phone;
    const user = await this.prisma.user.findUnique({ where: { phone } });

    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Always return an expiresAt + (in dev) a code. If user doesn't
    // exist, we fabricate the expiresAt but never send an SMS and never
    // generate a real OTP row.
    if (!user) {
      this.logger.warn(`forgot-password requested for unknown phone ${phone}`);
      return {
        ok: true,
        message: "If that phone is registered, an OTP has been sent.",
        expiresAt: expiresAt.toISOString(),
      };
    }

    // Rate limit: max 3 reset OTPs per phone per hour (same as register).
    const recentCount = await this.prisma.otpCode.count({
      where: {
        phone,
        purpose: "reset_password",
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 3) {
      throw new BadRequestException(
        "Too many password reset requests. Please try again later.",
      );
    }

    const code = this.token.generateOtp();
    const codeHash = this.token.hashOtp(code);

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        expiresAt,
        ip: req.ip ?? null,
        purpose: "reset_password",
      },
    });

    await this.sms.sendOtp(phone, code);
    if (DEV_CODE_ENABLED) {
      this.logger.log(`[DEV OTP] reset_password phone=${phone} code=${code}`);
    }

    return {
      ok: true,
      message: "If that phone is registered, an OTP has been sent.",
      expiresAt: expiresAt.toISOString(),
      ...(DEV_CODE_ENABLED ? { devCode: code } : {}),
    };
  }

  /**
   * Reset password with a previously-sent OTP and issue fresh tokens
   * so the user is logged in immediately.
   */
  async resetPassword(dto: ResetPasswordDto, req: Request) {
    const { phone, otpCode, newPassword } = dto;

    const candidates = await this.prisma.otpCode.findMany({
      where: {
        phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        purpose: "reset_password",
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    if (candidates.length === 0) {
      throw new BadRequestException(
        "No valid OTP. Please request a new password reset code.",
      );
    }

    const codeHash = this.token.hashOtp(otpCode);
    const match = candidates.find((c) => c.codeHash === codeHash);

    if (!match) {
      await this.prisma.otpCode.update({
        where: { id: candidates[0].id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Invalid OTP code");
    }

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new BadRequestException(
        "Account not found. Please register first.",
      );
    }

    await this.prisma.otpCode.update({
      where: { id: match.id },
      data: { consumedAt: new Date() },
    });

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    this.logger.log(`password.reset: phone=${phone} userId=${user.id}`);

    const tokens = await this.token.issueTokens({
      subject: user.id,
      audience: JwtAudience.CUSTOMER,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    return {
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
      },
      ...tokens,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CUSTOMER — Phone OTP
  // ═══════════════════════════════════════════════════════════════

  async requestOtp(phone: string, req: Request) {
    // Pre-check: if a fully-registered user (has passwordHash) already
    // exists for this phone, do NOT send an OTP — the user should log
    // in instead. Returning 409 here lets the front-end route to /login
    // without making the user go through the OTP form first.
    //
    // Legacy OTP-only users (registered before password login shipped,
    // no passwordHash yet) still receive an OTP — they'll be routed
    // through the password-setup step on verify.
    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: { passwordHash: true },
    });
    if (existing?.passwordHash) {
      throw new ConflictException(
        "An account with this phone already exists. Please log in instead.",
      );
    }

    // Rate limit: max 3 OTPs per phone per hour
    const recentCount = await this.prisma.otpCode.count({
      where: {
        phone,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 3) {
      throw new BadRequestException("Too many OTP requests. Please try again later.");
    }

    const code = this.token.generateOtp();
    const codeHash = this.token.hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        expiresAt,
        ip: req.ip ?? null,
        purpose: "register",
      },
    });

    await this.sms.sendOtp(phone, code);
    if (DEV_CODE_ENABLED) {
      this.logger.log(`[DEV OTP] register phone=${phone} code=${code}`);
    }

    return {
      ok: true,
      message: "OTP sent",
      expiresAt: expiresAt.toISOString(),
      // Expose the raw code (and log it server-side) for easy testing.
      // Set OTP_HIDE_DEV_CODE=1 in production to hide.
      ...(DEV_CODE_ENABLED ? { devCode: code } : {}),
    };
  }

  /**
   * Verify OTP and issue tokens.
   * If a User row already exists with this phone → issue tokens directly.
   * If not → return `registrationRequired: true` so the app can prompt
   * the user to complete registration.
   */
  async verifyOtp(dto: VerifyOtpDto, req: Request) {
    const { phone, code } = dto;

    // Find latest un-consumed registration OTP for this phone
    const candidates = await this.prisma.otpCode.findMany({
      where: {
        phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        purpose: "register",
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    if (candidates.length === 0) {
      throw new BadRequestException("No valid OTP. Please request a new one.");
    }

    const codeHash = this.token.hashOtp(code);
    const match = candidates.find((c) => c.codeHash === codeHash);

    if (!match) {
      // Increment attempts on the most recent one for monitoring
      await this.prisma.otpCode.update({
        where: { id: candidates[0].id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Invalid OTP code");
    }

    // Find or check user existence BEFORE consuming the OTP, because
    // registrationRequired / firstTimeSetupRequired flow will need to
    // re-validate the same OTP via /auth/customer/register in the next
    // request. Only consume after a definitive terminal action.
    const user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      return {
        ok: true,
        phoneVerified: true,
        registrationRequired: true,
        message: "Phone verified. Please complete registration.",
      };
    }

    // Existing user without a password → must complete first-time setup
    // before we issue tokens. Frontend routes to /register?phone=...&setup=1.
    if (!user.passwordHash) {
      return {
        ok: true,
        phoneVerified: true,
        firstTimeSetupRequired: true,
        phone: user.phone,
        message: "Phone verified. Please set a password to complete your account.",
      };
    }

    // Returning user with a password set — issue tokens for one-tap OTP login.
    // Consume the OTP here because this branch is terminal (no follow-up
    // call will need to re-validate it).
    await this.prisma.otpCode.update({
      where: { id: match.id },
      data: { consumedAt: new Date() },
    });

    const tokens = await this.token.issueTokens({
      subject: user.id,
      audience: JwtAudience.CUSTOMER,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    return {
      ok: true,
      phoneVerified: true,
      registrationRequired: false,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        referralCode: user.referralCode,
      },
      ...tokens,
    };
  }

  async registerCustomer(dto: RegisterDto, req: Request) {
    const { phone, name, email, otpCode, referralCode, password } = dto;

    // If otpCode provided, verify it. Otherwise, only allow registration
    // if the user just verified a phone in this session (no time-gap check
    // Day 1; we lean on the 5-min TTL of the OTP row itself).
    if (otpCode) {
      const candidates = await this.prisma.otpCode.findMany({
        where: {
          phone,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          purpose: "register",
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      const codeHash = this.token.hashOtp(otpCode);
      const match = candidates.find((c) => c.codeHash === codeHash);
      if (!match) {
        throw new BadRequestException("OTP invalid or expired. Please verify your phone first.");
      }
    }

    // Block if user already exists
    const existing = await this.prisma.user.findUnique({ where: { phone } });

    // ─── First-time password setup ────────────────────────────────
    // Legacy OTP-only users (registered via the old flow with no
    // passwordHash) come through here when verifyOtp returned
    // `firstTimeSetupRequired`. We just need to set the password and
    // issue tokens — their name / email / referral were never collected
    // so we leave them alone unless the payload provides them.
    if (existing && !existing.passwordHash) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Honor the `enableReferrals` toggle on legacy-setup path too.
      const referralsOn = await this.isReferralsEnabled();
      const referredById =
        referralsOn && referralCode
          ? await this.resolveReferrerId(referralCode, phone)
          : undefined;

      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          // Allow the user to (optionally) fill these in during setup.
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(referredById ? { referredById } : {}),
        },
      });

      this.logger.log(
        `register.setup: phone=${phone} userId=${updated.id} (first-time password)`,
      );

      const tokens = await this.token.issueTokens({
        subject: updated.id,
        audience: JwtAudience.CUSTOMER,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });

      return {
        ok: true,
        user: {
          id: updated.id,
          phone: updated.phone,
          name: updated.name,
          email: updated.email,
          referralCode: updated.referralCode,
        },
        ...tokens,
      };
    }

    if (existing) {
      throw new ConflictException("User already registered. Please login.");
    }

    // Email uniqueness pre-check — `User.email` has a DB-level unique
    // index, so the create below would also fail with P2002, but the
    // pre-check lets us surface a precise `{ field: "email" }` payload
    // up front so the FE can keep the user on the details step instead
    // of bouncing them to /login like the phone case. Skipped when no
    // email was provided (the field is optional).
    if (email) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (emailOwner) {
        throw new ConflictException({
          message: "This email is already in use by another account",
          field: "email",
        });
      }
    }

    // Find referrer — only if the admin hasn't turned referrals off.
    let referrerId: string | null = null;
    const referralsEnabled = await this.isReferralsEnabled();
    if (referralsEnabled && referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: referralCode.toUpperCase() },
      });
      if (!referrer) throw new BadRequestException("Invalid referral code");
      if (referrer.phone === phone) {
        throw new BadRequestException("You cannot refer yourself");
      }
      referrerId = referrer.id;
    } else if (referralCode && !referralsEnabled) {
      // Toggle off — silently drop the referral code. Don't throw; the
      // field is optional and the front-end should already be hiding it.
      this.logger.debug(
        `register: referrals toggle off, dropping referralCode for phone=${phone}`,
      );
    }

    // Hash the password (12 rounds) before creating the user
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate unique referral code for this new user
    const newReferralCode = await this.generateUniqueReferralCode();

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          phone,
          name,
          email,
          passwordHash,
          referralCode: newReferralCode,
          referredById: referrerId,
          registeredAt: new Date(),
        },
      });
    } catch (e) {
      // Race-condition guard: another tab/request may have created the
      // user between our pre-check and the create. Surface as a clean
      // 409 instead of leaking the underlying 500. Email is also unique
      // in the schema, so a P2002 on `email` is reported separately so
      // the FE can keep the user on the details step (instead of
      // redirecting to /login like the phone case does).
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const target = (e.meta?.target as string[] | string | undefined) ?? [];
        const fields = Array.isArray(target) ? target : [String(target)];
        if (fields.includes("email")) {
          throw new ConflictException({
            message: "This email is already in use by another account",
            field: "email",
          });
        }
        throw new ConflictException({
          message: "An account with this phone already exists. Please log in instead.",
          field: "phone",
        });
      }
      throw e;
    }

    // If referred, create the Referral row in PENDING
    if (referrerId) {
      try {
        await this.prisma.referral.create({
          data: {
            referrerId,
            refereeId: user.id,
            status: "PENDING",
          },
        });
      } catch (e) {
        // Unique constraint — already has a Referral row. OK to ignore.
        this.logger.warn(`Referral already exists for ${referrerId} → ${user.id}`);
      }
    }

    this.logger.log(
      `register.success: phone=${phone} userId=${user.id} hasReferrer=${Boolean(referrerId)}`,
    );

    const tokens = await this.token.issueTokens({
      subject: user.id,
      audience: JwtAudience.CUSTOMER,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    return {
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
      },
      ...tokens,
    };
  }

  /**
   * Resolve a referral code to a user id for the first-time-setup path
   * (kept separate so we don't repeat the validation logic).
   */
  private async resolveReferrerId(
    referralCode: string,
    selfPhone: string,
  ): Promise<string | null> {
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: referralCode.toUpperCase() },
    });
    if (!referrer) throw new BadRequestException("Invalid referral code");
    if (referrer.phone === selfPhone) {
      throw new BadRequestException("You cannot refer yourself");
    }
    return referrer.id;
  }

  async refresh(refreshToken: string, audience: JwtAudience, req: Request) {
    if (!refreshToken) throw new UnauthorizedException("Missing refresh token");
    try {
      return await this.token.rotateRefreshToken(refreshToken, {
        audience,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid refresh token";
      throw new UnauthorizedException(msg);
    }
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    await this.token.revokeRefreshToken(refreshToken);
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN — Email + password
  // ═══════════════════════════════════════════════════════════════

  async adminLogin(dto: AdminLoginDto, req: Request) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.token.issueTokens({
      subject: admin.id,
      audience: JwtAudience.ADMIN,
      role: admin.role as any, // "ADMIN" or "MANAGER"
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    return {
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      ...tokens,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RIDER — Email + password
  // ═══════════════════════════════════════════════════════════════

  async riderLogin(dto: RiderLoginDto, req: Request) {
    const rider = await this.prisma.rider.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!rider || !rider.isActive) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(dto.password, rider.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    const tokens = await this.token.issueTokens({
      subject: rider.id,
      audience: JwtAudience.RIDER,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    return {
      ok: true,
      rider: {
        id: rider.id,
        email: rider.email,
        name: rider.name,
        phone: rider.phone,
      },
      ...tokens,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Profile
  // ═══════════════════════════════════════════════════════════════

  async me(req: Request) {
    const role = (req as any).role;
    const id = (req as any).userId;

    if (role === "CUSTOMER") {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          referralCode: true,
          referredById: true,
          registeredAt: true,
          createdAt: true,
          _count: {
            select: {
              orders: true,
              addresses: true,
              referralsMade: { where: { status: "REWARDED" } },
              rewards: true,
            },
          },
        },
      });
      if (!user) throw new NotFoundException("User not found");
      return { role: "CUSTOMER", user };
    }

    if (role === "ADMIN" || role === "MANAGER") {
      const admin = await this.prisma.adminUser.findUnique({
        where: { id },
        select: {
          id: true, email: true, name: true, phone: true,
          role: true, isActive: true, lastLoginAt: true,
          permissions: true,
        },
      });
      if (!admin) throw new NotFoundException("Admin not found");
      return {
        role: admin.role,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          phone: admin.phone,
          role: admin.role,
          isActive: admin.isActive,
          lastLoginAt: admin.lastLoginAt,
          permissions: admin.permissions ?? {},
        },
      };
    }

    if (role === "RIDER") {
      const rider = await this.prisma.rider.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, phone: true, currentFloat: true },
      });
      if (!rider) throw new NotFoundException("Rider not found");
      return { role: "RIDER", rider };
    }

    throw new UnauthorizedException("Unknown role");
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate a unique referral code, retrying on collision.
   * Codes are 8 chars, alphanumeric (no ambiguous chars).
   */
  private async generateUniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = this.token.generateReferralCode();
      const exists = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new Error("Failed to generate unique referral code");
  }
}
