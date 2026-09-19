import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, createHash, randomInt } from "crypto";
import { PrismaService } from "../prisma/prisma.module";

export enum JwtAudience {
  CUSTOMER = "customer",
  ADMIN = "admin",
  RIDER = "rider",
  /**
   * Bot — internal service-to-service token for n8n (and any future
   * automation orchestrator) to call /api/v1/bot/* endpoints. Issued
   * via POST /api/v1/bot/auth/rotate (admin-only) and shared with n8n
   * through the `N8N_BOT_SERVICE_TOKEN` env var. TTL 1 year. Same
   * `AuthGuard` + `@Audience(JwtAudience.BOT)` pattern as the other
   * audiences; n8n's request is rejected with 401 if any other
   * audience (or no token) is presented to a bot-only route.
   */
  BOT = "bot",
}

export interface JwtPayload {
  sub: string;          // userId / adminUserId / riderId / "n8n"
  role: "CUSTOMER" | "ADMIN" | "MANAGER" | "RIDER" | "SERVICE";
  audience: JwtAudience;
  // Standard JWT claims
  iat?: number;
  exp?: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Generate a 6-digit numeric OTP using a CSPRNG (`crypto.randomInt`). */
  generateOtp(): string {
    const n = randomInt(0, 1_000_000); // [0, 1_000_000) — uniformly distributed
    return n.toString().padStart(6, "0");
  }

  /** Hash an OTP for storage (bcrypt too slow for this, we use sha256). */
  hashOtp(otp: string): string {
    return createHash("sha256").update(otp).digest("hex");
  }

  /** Generate a random 8-character alphanumeric referral code (Crockford base32). */
  generateReferralCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ambiguous chars removed
    let s = "";
    const bytes = randomBytes(8);
    for (const b of bytes) s += alphabet[b % alphabet.length];
    return s;
  }

  /** Generate a random refresh token (opaque, stored hashed). */
  generateRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Issue access + refresh token pair. Persist refresh token hash to DB.
   *
   *  Special case for `JwtAudience.BOT`: no refresh token. Bot tokens are
   *  long-lived service credentials (default TTL 1 year) shared with n8n
   *  via the `N8N_BOT_SERVICE_TOKEN` env var. Issuing a refresh token
   *  here would force n8n to persist a `RefreshToken` row with no FK
   *  subject (the schema's userId/adminUserId/riderId fields are all
   *  nullable, but a bot has none of those — a stray row would just be
   *  dead weight). The bot caller rotates via
   *  `POST /api/v1/bot/auth/rotate` instead, which mints a fresh access
   *  token directly without involving this code path.
   */
  async issueTokens(params: {
    subject: string;
    audience: JwtAudience;
    /** Role to embed in the JWT. Defaults to mapping from audience. */
    role?: "CUSTOMER" | "ADMIN" | "MANAGER" | "RIDER" | "SERVICE";
    /** Override TTL in seconds. Required for BOT (default 1 year). */
    accessTtlSeconds?: number;
    userAgent?: string;
    ip?: string;
  }) {
    const role = params.role ?? (
      params.audience === JwtAudience.CUSTOMER ? "CUSTOMER"
      : params.audience === JwtAudience.ADMIN ? "ADMIN"
      : params.audience === JwtAudience.RIDER ? "RIDER"
      : "SERVICE"
    );

    let accessToken: string;
    if (params.accessTtlSeconds !== undefined) {
      // Caller-provided TTL (used by the BOT path). `JwtService.signAsync`
      // accepts an options object whose `expiresIn` is interpreted as
      // seconds when given a number.
      accessToken = await this.jwt.signAsync(
        {
          sub: params.subject,
          role,
          audience: params.audience,
        },
        { expiresIn: params.accessTtlSeconds },
      );
    } else {
      accessToken = await this.jwt.signAsync({
        sub: params.subject,
        role,
        audience: params.audience,
      });
    }

    if (params.audience === JwtAudience.BOT) {
      // No refresh token, no DB write. The bot configures n8n with the
      // returned accessToken directly; rotation is a separate admin call.
      const expiresAt = new Date(
        Date.now() + (params.accessTtlSeconds ?? 31_536_000) * 1000,
      );
      return { accessToken, refreshToken: null, expiresAt };
    }

    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTtlSeconds = Number(this.config.get("JWT_REFRESH_TTL_SECONDS", "2592000"));
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: {
        ...(params.audience === JwtAudience.CUSTOMER  ? { userId: params.subject } : {}),
        ...(params.audience === JwtAudience.ADMIN     ? { adminUserId: params.subject } : {}),
        ...(params.audience === JwtAudience.RIDER     ? { riderId: params.subject } : {}),
        tokenHash: refreshTokenHash,
        userAgent: params.userAgent,
        ip: params.ip,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresAt };
  }

  /** Verify a refresh token, revoke the old one, rotate. */
  async rotateRefreshToken(refreshToken: string, meta: { userAgent?: string; ip?: string; audience: JwtAudience }) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) throw new Error("Invalid refresh token");
    if (stored.revokedAt) throw new Error("Refresh token already revoked");
    if (stored.expiresAt < new Date()) throw new Error("Refresh token expired");

    const subject =
      stored.userId || stored.adminUserId || stored.riderId;
    if (!subject) throw new Error("Invalid refresh token (no subject)");

    // Revoke old
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens({
      subject,
      audience: meta.audience,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
  }

  /** Revoke a refresh token (e.g. on logout). */
  async revokeRefreshToken(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Verify access token signature + decode payload. */
  verifyAccessToken(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token);
  }
}
