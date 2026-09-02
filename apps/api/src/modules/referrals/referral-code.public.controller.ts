import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * Public, no-auth lookup of a referral code. Used by:
 *   - `/r/[code]` share landing page (renders "Invited by Rahim" hero)
 *   - `/register` autofill (preview banner before submitting details)
 *
 * Privacy: returns the inviter's display name + initial letter + join
 * month/year. No phone, no email, no user id. A logged-out user should
 * not be able to enumerate or profile referrers through this endpoint.
 *
 * Shape stability:
 *   - Always returns HTTP 200. A miss is `{valid: false}` — never 404 — so
 *     attackers can't enumerate valid codes via response status.
 *   - Malformed input (wrong length, wrong alphabet) also returns
 *     `{valid: false}` (no error throw).
 *
 * Throttling: 60 hits / 60 s per IP. Most browsers hit this once per page
 * load, so the limit is generous; protects against brute-force enumeration
 * where an attacker rotates codes from one IP.
 */
@ApiTags("referrals")
@Controller("referral-codes")
export class ReferralCodePublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":code")
  @Throttle({ medium: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Public lookup of a referral code. Returns inviter name + initial only.",
  })
  async lookup(@Param("code") raw: string) {
    const code = (raw ?? "").toUpperCase().trim();

    // Reject malformed input with the same shape as a real miss — never
    // 4xx — so an attacker can't distinguish "invalid format" from
    // "valid but unknown".
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      return { valid: false as const };
    }

    const user = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { name: true, createdAt: true, referralCode: true },
    });

    if (!user) {
      return { valid: false as const };
    }

    // Full display name + initial. No phone, no email, no user id.
    // `referrerFullName` is the human-friendly full name (e.g. "Md Kamal
    // Hosen") — the share landing page renders this so the visitor
    // recognises the person who invited them. `referrerName` is kept as
    // a first-name alias for backward-compat with older clients (the
    // register page banner used to show only the first name).
    const fullName = (user.name ?? "").trim() || "A friend";
    const firstName = fullName.split(/\s+/)[0] || fullName;
    const initial = fullName.charAt(0).toUpperCase() || "A";
    const referrerJoinedAt = user.createdAt
      ? new Date(user.createdAt).toISOString().slice(0, 7) // YYYY-MM
      : null;

    return {
      valid: true as const,
      // Full name (new — preferred).
      referrerFullName: fullName,
      // First name (legacy — kept for the register-page banner so old
      // clients don't suddenly start showing the full name without
      // design review).
      referrerName: firstName,
      initial,
      referrerJoinedAt,
      // The code itself — the landing page renders this verbatim next
      // to the inviter name so the visitor has both pieces of info.
      referralCode: user.referralCode,
    };
  }
}
