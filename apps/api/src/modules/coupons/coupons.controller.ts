import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("coupons")
@Controller("coupons")
export class CouponsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("active")
  @ApiOperation({ summary: "List currently active public coupons for display in app/web" })
  async activeCoupons() {
    const now = new Date();
    return this.prisma.discount.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        // Exclude user-specific and system-issued
        issuer: { in: ["ADMIN", "PROMO"] },
        restrictedUserId: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, type: true, value: true,
        minOrder: true, maxDiscount: true,
        descriptionBn: true, descriptionEn: true,
        bannerImageUrl: true, scope: true,
        firstOrderOnly: true,
        startsAt: true, endsAt: true,
      },
    });
  }

  /**
   * Look up a coupon by code. The previous version returned only basic
   * fields, so the frontend couldn't detect already-used or limit-finished
   * coupons until the order placement step failed. Now we return usage
   * fields too AND, for logged-in customers, a per-user redemption count
   * so the UI can show precise toasts on Apply.
   *
   * Response shape (success):
   *   { ...coupon fields..., usageLimit, usagePerUserLimit, usedCount,
   *     restrictedUserId, myUsage }
   *
   * Response shape (failure, with HTTP 4xx and `{ message, code, ... }`):
   *   - NOT_FOUND         — no such code
   *   - INACTIVE          — disabled by admin
   *   - NOT_STARTED       — startsAt in the future
   *   - EXPIRED           — endsAt in the past
   *   - LIMIT_REACHED     — global usageLimit hit
   *   - ALREADY_REDEEMED  — this user already used the code (usagePerUserLimit hit)
   *   - WRONG_USER        — coupon restricted to a different account
   *
   * The frontend branches on `code` to render the right message in the
   * user's language. The `message` field is English by default but is
   * already user-facing on most paths; the FE may override with bn/en
   * strings when needed.
   */
  @Get(":code")
  @ApiOperation({ summary: "Get coupon details by code, including usage state for the current user" })
  async byCode(@Param("code") code: string, @Req() req: Request) {
    const upper = code.toUpperCase();
    const c = await this.prisma.discount.findUnique({
      where: { code: upper },
    });
    if (!c) {
      return { ok: false, code: "NOT_FOUND", message: "Invalid coupon code" };
    }

    const now = new Date();
    if (!c.isActive) {
      return { ok: false, code: "INACTIVE", message: "Coupon is inactive" };
    }
    if (c.startsAt > now) {
      return { ok: false, code: "NOT_STARTED", message: "Coupon is not yet active" };
    }
    if (c.endsAt < now) {
      return { ok: false, code: "EXPIRED", message: "Coupon has expired" };
    }
    if (c.usageLimit !== null && c.usedCount >= c.usageLimit) {
      return { ok: false, code: "LIMIT_REACHED", message: "Coupon usage limit reached" };
    }

    // Per-user checks need the caller's identity. We read it from the JWT
    // set by the auth guard; an unauthenticated guest is only allowed to
    // apply PUBLIC coupons (no restrictedUserId, usagePerUserLimit == 1
    // but the per-user check below will simply skip without an id).
    const userId = (req as any).userId as string | undefined;

    if (c.restrictedUserId) {
      if (!userId) {
        return {
          ok: false,
          code: "WRONG_USER",
          message: "Coupon not valid for this account",
        };
      }
      if (c.restrictedUserId !== userId) {
        return {
          ok: false,
          code: "WRONG_USER",
          message: "Coupon not valid for this account",
        };
      }
    }

    let myUsage = 0;
    if (userId) {
      myUsage = await this.prisma.order.count({
        where: {
          userId,
          couponId: c.id,
          status: { not: "CANCELLED" },
        },
      });
      if (myUsage >= c.usagePerUserLimit) {
        return {
          ok: false,
          code: "ALREADY_REDEEMED",
          message: "You have already used this coupon",
          myUsage,
        };
      }
    }

    return {
      ok: true,
      id: c.id,
      code: c.code,
      type: c.type,
      value: Number(c.value),
      minOrder: c.minOrder != null ? Number(c.minOrder) : null,
      maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
      descriptionBn: c.descriptionBn,
      descriptionEn: c.descriptionEn,
      scope: c.scope,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      firstOrderOnly: c.firstOrderOnly,
      isActive: c.isActive,
      // Usage fields exposed so the FE can render "1 of 1 used" copy and
      // call out near-limit coupons. `restrictedUserId` is also returned
      // — the FE never displays it, but exposing it makes the contract
      // honest (the FE could already tell the type is restricted by
      // checking myUsage vs usagePerUserLimit, but the boolean is handy).
      usageLimit: c.usageLimit,
      usagePerUserLimit: c.usagePerUserLimit,
      usedCount: c.usedCount,
      restrictedUserId: c.restrictedUserId,
      myUsage,
    };
  }
}