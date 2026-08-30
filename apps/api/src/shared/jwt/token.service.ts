import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.module";

export enum JwtAudience {
  CUSTOMER = "customer",
  ADMIN = "admin",
  RIDER = "rider",
}

export interface JwtPayload {
  sub: string;          // userId / adminUserId / riderId
  role: "CUSTOMER" | "ADMIN" | "MANAGER" | "RIDER";
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

  /** Generate a 6-digit numeric OTP. */
  generateOtp(): string {
    const n = Math.floor(Math.random() * 1_000_000);
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

  /** Issue access + refresh token pair. Persist refresh token hash to DB. */
  async issueTokens(params: {
    subject: string;
    audience: JwtAudience;
    /** Role to embed in the JWT. Defaults to mapping from audience. */
    role?: "CUSTOMER" | "ADMIN" | "MANAGER" | "RIDER";
    userAgent?: string;
    ip?: string;
  }) {
    const role = params.role ?? (
      params.audience === JwtAudience.CUSTOMER ? "CUSTOMER"
      : params.audience === JwtAudience.ADMIN ? "ADMIN"
      : "RIDER"
    );

    const accessToken = await this.jwt.signAsync({
      sub: params.subject,
      role,
      audience: params.audience,
    });

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
