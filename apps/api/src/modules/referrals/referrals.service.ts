import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { Request } from "express";

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * Base URL used to build share links. Falls back to the production host
   * so the value is never empty — a missing env shouldn't produce a broken
   * `/r/` link. The same env (`PUBLIC_SITE_URL` / `APP_BASE_URL`) drives
   * the rest of the app's email / SMS links.
   */
  private get appBaseUrl(): string {
    return (
      this.cfg.get<string>("APP_BASE_URL") ??
      this.cfg.get<string>("PUBLIC_SITE_URL") ??
      "https://xovenmart.com"
    ).replace(/\/+$/, "");
  }

  /** Get my referral info (code + referred users + rewards). */
  async myReferrals(req: Request) {
    const userId = (req as any).userId;
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, registeredAt: true },
    });
    if (!me) throw new NotFoundException("User not found");
    if (!me.registeredAt) {
      throw new BadRequestException("Please complete registration to use referrals");
    }

    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referee: { select: { name: true, phone: true, createdAt: true } },
        rewards: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Read the reward amount so the share message reflects the current
    // admin-set value (instead of the historical hardcoded "৳50").
    let rewardAmount = 50;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: "referral.rewardAmount" },
      });
      if (row) {
        const n = Number(JSON.parse(row.value));
        if (!Number.isNaN(n) && n > 0) rewardAmount = n;
      }
    } catch {
      // ignore — keep the default
    }

    const stats = {
      totalReferrals: referrals.length,
      pending: referrals.filter((r: any) => r.status === "PENDING").length,
      qualified: referrals.filter((r: any) => r.status === "QUALIFIED").length,
      rewarded: referrals.filter((r: any) => r.status === "REWARDED").length,
      totalRewardAmount: referrals.reduce((acc, r: any) => {
        return acc + r.rewards.filter((rw: any) => rw.userId === userId).reduce((s: number, rw: any) => s + Number(rw.rewardAmount), 0);
      }, 0),
    };

    return {
      referralCode: me.referralCode,
      shareUrl: `${this.appBaseUrl}/r/${me.referralCode}`,
      shareMessage: `Join me on XovenMart and get ৳${rewardAmount} off your first order! Use my code ${me.referralCode}: ${this.appBaseUrl}/r/${me.referralCode}`,
      stats,
      referrals: referrals.map((r: any) => ({
        id: r.id,
        refereeName: r.referee.name,
        refereePhone: r.referee.phone,
        refereeJoinedAt: r.referee.createdAt,
        status: r.status,
        rewardedAt: r.rewardedAt,
      })),
      rewards: referrals
        .flatMap((r: any) => r.rewards)
        .filter((rw: any) => rw.userId === userId)
        .map((rw: any) => ({
          id: rw.id,
          couponCode: rw.couponCode,
          amount: Number(rw.rewardAmount),
          issuedAt: rw.issuedAt,
          redeemedAt: rw.redeemedAt,
        })),
    };
  }

  /**
   * Get the referrer that referred this user (if any).
   */
  async myReferrer(req: Request) {
    const userId = (req as any).userId;
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        referredBy: { select: { name: true, referralCode: true } },
      },
    });
    if (!me) throw new NotFoundException("User not found");
    return { referrer: me.referredBy ?? null };
  }

  /**
   * Internal: when an order is delivered, check if this is the referee's
   * first delivered order. If yes, transition the referral to REWARDED
   * and issue coupons to both parties.
   */
  async onOrderDelivered(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || !order.userId) return;

    // Find a PENDING referral where this user is the referee
    const referral = await this.prisma.referral.findFirst({
      where: { refereeId: order.userId, status: "PENDING" },
      include: { referrer: true },
    });
    if (!referral) return;

    // Verify this is the user's first DELIVERED order
    const priorDelivered = await this.prisma.order.count({
      where: {
        userId: order.userId,
        status: "DELIVERED",
        id: { not: orderId },
      },
    });
    if (priorDelivered > 0) {
      // Not first delivered order; mark expired
      await this.prisma.referral.update({
        where: { id: referral.id },
        data: { status: "EXPIRED" },
      });
      return;
    }

    // Reward knobs — read from app settings so the admin can tune them
    // from the dashboard without a redeploy. All three default to the
    // historical hardcoded values so an unconfigured install keeps the
    // same behavior. (SettingsService is not injected here — we read the
    // rows directly to keep the dependency surface small.)
    const settingsRows = await this.prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            "referral.rewardAmount",
            "referral.couponTtlDays",
            "referral.minOrder",
          ],
        },
      },
    });
    const smap: Record<string, any> = {};
    for (const r of settingsRows) {
      try {
        smap[r.key] = JSON.parse(r.value);
      } catch {
        smap[r.key] = r.value;
      }
    }
    const rewardAmount =
      typeof smap["referral.rewardAmount"] === "number" &&
      !Number.isNaN(smap["referral.rewardAmount"])
        ? smap["referral.rewardAmount"]
        : 50;
    const couponTtlDays =
      typeof smap["referral.couponTtlDays"] === "number" &&
      !Number.isNaN(smap["referral.couponTtlDays"])
        ? smap["referral.couponTtlDays"]
        : 60;
    const minOrder =
      typeof smap["referral.minOrder"] === "number" &&
      !Number.isNaN(smap["referral.minOrder"])
        ? smap["referral.minOrder"]
        : 0;
    const ttlMs = Math.max(1, couponTtlDays) * 24 * 60 * 60 * 1000;

    // Issue 2 coupons: one for referrer, one for referee
    const refCode = `REF-${randomCode()}`;
    const newCoupons = await this.prisma.$transaction(async (tx) => {
      // Coupon for referee
      const c1 = await tx.discount.create({
        data: {
          code: refCode + "R",
          type: "FLAT",
          value: rewardAmount,
          minOrder,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + ttlMs),
          usageLimit: 1,
          usagePerUserLimit: 1,
          issuer: "SYSTEM",
          restrictedUserId: order.userId!,
          descriptionEn: `Referral reward — ৳${rewardAmount} off your next order`,
          descriptionBn: `রেফারেল পুরস্কার — আপনার পরবর্তী অর্ডারে ৳${rewardAmount} ছাড়`,
        },
      });
      // Coupon for referrer
      const c2 = await tx.discount.create({
        data: {
          code: refCode + "F",
          type: "FLAT",
          value: rewardAmount,
          minOrder,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + ttlMs),
          usageLimit: 1,
          usagePerUserLimit: 1,
          issuer: "SYSTEM",
          restrictedUserId: referral.referrerId,
          descriptionEn: `Referral reward — ৳${rewardAmount} off your next order`,
          descriptionBn: `রেফারেল পুরস্কার — আপনার পরবর্তী অর্ডারে ৳${rewardAmount} ছাড়`,
        },
      });
      // ReferralReward rows
      await tx.referralReward.create({
        data: {
          referralId: referral.id,
          userId: order.userId!,
          rewardAmount,
          couponCode: c1.code,
          couponId: c1.id,
        },
      });
      await tx.referralReward.create({
        data: {
          referralId: referral.id,
          userId: referral.referrerId,
          rewardAmount,
          couponCode: c2.code,
          couponId: c2.id,
        },
      });
      // Mark referral REWARDED
      await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: "REWARDED",
          qualifiedAt: new Date(),
          rewardedAt: new Date(),
          refereeOrderId: order.id,
        },
      });
      return [c1, c2];
    });

    return { ok: true, couponCodes: newCoupons.map((c) => c.code), amount: rewardAmount };
  }
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}