import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/customers")
@Controller("admin/customers")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminCustomersController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Customers list ────────────────────────────────────────────

  @Get()
  async list(
    @Query() q: {
      q?: string;
      page?: number;
      perPage?: number;
      blocked?: string | boolean;
      withOrders?: string | boolean;
    },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where: any = {};
    if (q.q) {
      where.OR = [
        { phone: { contains: q.q } },
        { name: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
        { referralCode: { contains: q.q, mode: "insensitive" } },
      ];
    }
    if (q.blocked === true || q.blocked === "true") {
      where.isBlocked = true;
    } else if (q.blocked === false || q.blocked === "false") {
      where.isBlocked = false;
    }
    if (q.withOrders === true || q.withOrders === "true") {
      where.orders = { some: {} };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: {
          referredBy: { select: { id: true, name: true, phone: true } },
          _count: {
            select: { orders: true, referralsMade: true, addresses: true },
          },
          orders: {
            where: { status: "DELIVERED" },
            select: { grandTotal: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map((u: any) => {
      const lifetimeValue = u.orders.reduce(
        (sum: number, o: any) => sum + Number(o.grandTotal),
        0,
      );
      const { orders: _omit, ...rest } = u;
      return {
        ...rest,
        lifetimeValue,
      };
    });

    return { items, page, perPage, total };
  }

  @Get("blocked")
  async listBlocked(
    @Query() q: { q?: string; page?: number; perPage?: number },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where: any = { isBlocked: true };
    if (q.q) {
      where.OR = [
        { phone: { contains: q.q } },
        { name: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
      ];
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: {
          referredBy: { select: { id: true, name: true, phone: true } },
          _count: {
            select: { orders: true, referralsMade: true, addresses: true },
          },
          orders: {
            where: { status: "DELIVERED" },
            select: { grandTotal: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const items = users.map((u: any) => {
      const lifetimeValue = u.orders.reduce(
        (sum: number, o: any) => sum + Number(o.grandTotal),
        0,
      );
      const { orders: _omit, ...rest } = u;
      return { ...rest, lifetimeValue };
    });
    return { items, page, perPage, total };
  }

  @Get("referrals")
  async listReferrals(
    @Query() q: { status?: string; page?: number; perPage?: number },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where: any = {};
    if (q.status) {
      where.status = q.status;
    }
    const [items, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: {
          referrer: { select: { id: true, name: true, phone: true } },
          referee: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.referral.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  @Get("referrals/rewards")
  async listRewards(
    @Query() q: { page?: number; perPage?: number },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const [items, total] = await Promise.all([
      this.prisma.referralReward.findMany({
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { issuedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          referral: {
            include: {
              referrer: { select: { id: true, name: true, phone: true } },
              referee: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.referralReward.count(),
    ]);
    const formatted = items.map((r: any) => ({
      ...r,
      rewardAmount: Number(r.rewardAmount),
    }));
    return { items: formatted, page, perPage, total };
  }

  @Get(":id")
  async getDetail(@Param("id") id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        referredBy: { select: { id: true, name: true, phone: true } },
        addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
        _count: {
          select: { orders: true, referralsMade: true, addresses: true, rewards: true },
        },
        orders: {
          orderBy: { placedAt: "desc" },
          take: 10,
          select: {
            id: true,
            orderNo: true,
            status: true,
            grandTotal: true,
            placedAt: true,
            deliveredAt: true,
          },
        },
        referralsMade: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            referee: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });
    if (!u) return null;

    const lifetimeAgg = await this.prisma.order.aggregate({
      where: { userId: id, status: "DELIVERED" },
      _sum: { grandTotal: true },
      _count: { _all: true },
    });

    const referralStats = await this.prisma.referral.groupBy({
      by: ["status"],
      where: { referrerId: id },
      _count: { _all: true },
    });

    const rewardStats = await this.prisma.referralReward.aggregate({
      where: { userId: id },
      _sum: { rewardAmount: true },
      _count: { _all: true },
    });

    return {
      ...u,
      lifetimeValue: Number(lifetimeAgg._sum.grandTotal ?? 0),
      deliveredOrderCount: lifetimeAgg._count._all,
      referralStats: referralStats.map((s: any) => ({
        status: s.status,
        count: s._count._all,
      })),
      rewardStats: {
        totalIssued: rewardStats._count._all,
        totalAmount: Number(rewardStats._sum.rewardAmount ?? 0),
      },
      orders: u.orders.map((o: any) => ({
        ...o,
        grandTotal: Number(o.grandTotal),
      })),
    };
  }

  @Get(":id/addresses")
  async listAddresses(@Param("id") id: string) {
    return this.prisma.address.findMany({
      where: { userId: id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  @Patch(":id/block")
  @AdminOnly()
  async block(
    @Param("id") id: string,
    @Body() body: { isBlocked: boolean },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { isBlocked: true },
    });
    const u = await this.prisma.user.update({
      where: { id },
      data: { isBlocked: !!body.isBlocked },
      select: {
        id: true,
        phone: true,
        name: true,
        isBlocked: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "user",
        entityId: id,
        action: body.isBlocked ? "block" : "unblock",
        diff: { before, after: { isBlocked: u.isBlocked } },
      },
    });
    return u;
  }

  @Patch(":id/notes")
  @AdminOnly()
  async notes(
    @Param("id") id: string,
    @Body() body: { notes: string },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    // We don't have a notes column on User — write the note into the audit log
    // so admins can see the history. Returns the persisted audit log entry id.
    const log = await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "user",
        entityId: id,
        action: "note",
        diff: { notes: body.notes ?? "" },
      },
    });
    return { ok: true, auditLogId: log.id };
  }
}
