import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { Request } from "express";

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

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
      shareUrl: `https://xovenmart.com/r/${me.referralCode}`,
      shareMessage: `Join me on XovenMart and get ৳50 off your first order! Use my code ${me.referralCode}: https://xovenmart.com/r/${me.referralCode}`,
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

    // Reward amount — read from app setting
    const rewardSetting = await this.prisma.appSetting.findUnique({
      where: { key: "referralRewardAmount" },
    });
    const rewardAmount = rewardSetting ? Number(JSON.parse(rewardSetting.value)) : 50;

    // Issue 2 coupons: one for referrer, one for referee
    const refCode = `REF-${randomCode()}`;
    const newCoupons = await this.prisma.$transaction(async (tx) => {
      // Coupon for referee
      const c1 = await tx.discount.create({
        data: {
          code: refCode + "R",
          type: "FLAT",
          value: rewardAmount,
          minOrder: 0,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60), // 60 days
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
          minOrder: 0,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
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