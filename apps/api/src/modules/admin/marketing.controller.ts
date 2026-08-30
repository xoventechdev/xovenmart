import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

const LOG_PREFIX = "notification.log.";
const VALID_CHANNELS = new Set(["email", "sms", "push"]);

interface NotificationPayload {
  channel: string;
  recipient: string;
  subject?: string;
  body: string;
  status?: string;
  sentAt?: string;
  audience?: string;
}

@ApiTags("admin/marketing")
@Controller("admin/marketing")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminMarketingController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────

  private async writeLog(payload: NotificationPayload, actorId?: string) {
    const sentAt = new Date();
    const safe = payload.recipient.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const key = `${LOG_PREFIX}${payload.channel}.${sentAt.getTime()}.${safe}`;
    const value: NotificationPayload = {
      ...payload,
      sentAt: sentAt.toISOString(),
      status: payload.status ?? "QUEUED",
    };
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(value), updatedBy: actorId ?? null },
      create: { key, value: JSON.stringify(value), updatedBy: actorId ?? null },
    });
    return { id: key, ...value };
  }

  // ─── Banners ──────────────────────────────────────────────────

  @Get("banners")
  async listBanners(@Query("position") position?: string) {
    const where = position ? { position } : {};
    return this.prisma.banner.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  @Post("banners")
  @AdminOnly()
  async createBanner(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body?.imageUrl) {
      throw new BadRequestException("imageUrl is required");
    }
    const b = await this.prisma.banner.create({
      data: {
        imageUrl: body.imageUrl,
        mobileImageUrl: body.mobileImageUrl,
        linkUrl: body.linkUrl,
        titleBn: body.titleBn,
        titleEn: body.titleEn,
        subtitleBn: body.subtitleBn,
        subtitleEn: body.subtitleEn,
        position: body.position || "homepage_hero",
        isActive: body.isActive ?? true,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        sortOrder: body.sortOrder ?? 0,
        updatedBy: actorId ?? null,
      },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "banner",
          entityId: b.id,
          action: "create",
          diff: { position: b.position, titleEn: b.titleEn },
        },
      });
    }
    return b;
  }

  @Patch("banners/:id")
  async updateBanner(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const data: any = { updatedBy: actorId ?? null };
    const fields: (keyof typeof body)[] = [
      "imageUrl",
      "mobileImageUrl",
      "linkUrl",
      "titleBn",
      "titleEn",
      "subtitleBn",
      "subtitleEn",
      "position",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    const b = await this.prisma.banner.update({ where: { id }, data });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "banner",
          entityId: id,
          action: "update",
          diff: body,
        },
      });
    }
    return b;
  }

  @Delete("banners/:id")
  @AdminOnly()
  async deleteBanner(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    await this.prisma.banner.delete({ where: { id } });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "banner",
          entityId: id,
          action: "delete",
        },
      });
    }
    return { ok: true };
  }

  // ─── Deals (active promos) ────────────────────────────────────

  @Get("deals")
  async deals() {
    const now = new Date();
    return this.prisma.discount.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ─── Campaigns (all promos) ───────────────────────────────────

  @Get("campaigns")
  async campaigns() {
    return this.prisma.discount.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { orders: true, products: true, categories: true } },
      },
    });
  }

  @Post("campaigns")
  @AdminOnly()
  async createCampaign(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body?.code || !body?.type) {
      throw new BadRequestException("code and type are required");
    }
    const c = await this.prisma.discount.create({
      data: {
        code: String(body.code).toUpperCase(),
        type: body.type,
        value: body.value ?? 0,
        scope: body.scope ?? "ALL",
        minOrder: body.minOrder ?? 0,
        maxDiscount: body.maxDiscount,
        startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
        endsAt: body.endsAt ? new Date(body.endsAt) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        usageLimit: body.usageLimit,
        usagePerUserLimit: body.usagePerUserLimit ?? 1,
        firstOrderOnly: body.firstOrderOnly ?? false,
        descriptionBn: body.descriptionBn,
        descriptionEn: body.descriptionEn,
        bannerImageUrl: body.bannerImageUrl,
        issuer: "PROMO",
        products: body.productIds?.length
          ? { create: body.productIds.map((productId: string) => ({ productId })) }
          : undefined,
        categories: body.categoryIds?.length
          ? { create: body.categoryIds.map((categoryId: string) => ({ categoryId })) }
          : undefined,
      },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "campaign",
          entityId: c.id,
          action: "create",
          diff: { code: c.code, type: c.type, value: c.value },
        },
      });
    }
    return c;
  }

  // ─── Broadcast ────────────────────────────────────────────────

  @Post("broadcast")
  @AdminOnly()
  async broadcast(@Body() body: any, @Req() req: Request) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body is required");
    }
    const channel = String(body.channel ?? "").toLowerCase();
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${body.channel}. Must be email, sms, or push.`);
    }
    if (!body.body || typeof body.body !== "string") {
      throw new BadRequestException("body (string) is required");
    }
    const audience = String(body.audience ?? "all").toLowerCase();
    if (!["all", "customers", "admins"].includes(audience)) {
      throw new BadRequestException(`Invalid audience: ${body.audience}. Must be all, customers, or admins.`);
    }
    const actorId = (req as any).userId;

    let recipients: string[] = [];
    if (audience === "all" || audience === "customers") {
      const users = await this.prisma.user.findMany({ select: { phone: true, email: true }, take: 1000 });
      for (const u of users) {
        if (channel === "sms" && u.phone) recipients.push(u.phone);
        if (channel === "email" && u.email) recipients.push(u.email);
      }
    }
    if (audience === "all" || audience === "admins") {
      const admins = await this.prisma.adminUser.findMany({ select: { email: true, phone: true }, take: 200 });
      for (const a of admins) {
        if (channel === "email" && a.email) recipients.push(a.email);
        if (channel === "sms" && a.phone) recipients.push(a.phone);
      }
    }
    recipients = Array.from(new Set(recipients));

    const ids: string[] = [];
    for (const r of recipients) {
      const result = await this.writeLog(
        {
          channel,
          recipient: r,
          subject: body.subject,
          body: body.body,
          status: "BROADCAST",
          audience: `marketing.${audience}`,
        },
        actorId,
      );
      ids.push(result.id);
    }
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "marketing_broadcast",
          entityId: `marketing.broadcast.${Date.now()}`,
          action: "broadcast",
          diff: { channel, audience, recipientCount: ids.length, subject: body.subject },
        },
      });
    }
    return { ok: true, count: ids.length, ids };
  }

  // ─── Stats ────────────────────────────────────────────────────

  @Get("stats")
  async stats() {
    const now = new Date();
    const [totalCampaigns, activeCampaigns, totalRedemptions, orders] = await Promise.all([
      this.prisma.discount.count(),
      this.prisma.discount.count({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      }),
      this.prisma.order.count({ where: { couponId: { not: null } } }),
      this.prisma.order.aggregate({
        where: { couponId: { not: null } },
        _sum: { discountTotal: true },
      }),
    ]);
    return {
      totalCampaigns,
      activeCampaigns,
      totalRedemptions,
      revenueInfluenced: Number(orders._sum.discountTotal ?? 0),
    };
  }
}
