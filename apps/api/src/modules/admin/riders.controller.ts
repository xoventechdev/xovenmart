import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import * as bcrypt from "bcryptjs";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/riders")
@Controller("admin/riders")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminRidersController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Rich list ────────────────────────────────────────────────
  // NOTE: GET /admin/riders (basic) lives in admin.controller.ts for
  // backward compat. This richer version lives at /admin/riders/all.

  @Get("all")
  @ApiOperation({
    summary:
      "List all riders with delivery stats, current float and last-active timestamp",
  })
  async listAll() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const riders = await this.prisma.rider.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        deliveries: {
          select: {
            id: true,
            assignedAt: true,
            deliveredAt: true,
            cashCollected: true,
          },
        },
      },
    });

    // Pull latest refresh-token activity per rider in a single query
    const refreshLatest = await this.prisma.refreshToken.groupBy({
      by: ["riderId"],
      where: { riderId: { not: null }, revokedAt: null },
      _max: { createdAt: true },
    });
    const lastActiveMap = new Map<string, Date>();
    for (const row of refreshLatest) {
      if (row.riderId && row._max.createdAt) {
        lastActiveMap.set(row.riderId, row._max.createdAt);
      }
    }

    return riders.map((r) => {
      const todaysDeliveries = r.deliveries.filter(
        (d) => d.assignedAt && d.assignedAt >= today,
      );
      const totalDeliveries = r.deliveries.length;
      const todayCOD = todaysDeliveries
        .filter((d) => d.cashCollected && Number(d.cashCollected) > 0)
        .reduce((sum, d) => sum + Number(d.cashCollected), 0);
      const lastDeliveryAt = r.deliveries
        .map((d) => d.deliveredAt ?? d.assignedAt)
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const lastActiveAt =
        (lastActiveMap.get(r.id) ?? null) || lastDeliveryAt;

      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        nidNumber: r.nidNumber,
        isActive: r.isActive,
        currentFloat: Number(r.currentFloat),
        todayDeliveries: todaysDeliveries.length,
        totalDeliveries,
        todayCODCollected: todayCOD,
        lastActiveAt,
        createdAt: r.createdAt,
      };
    });
  }

  // ─── Active riders (dropdown) ─────────────────────────────────

  @Get("active/list")
  @ApiOperation({ summary: "List active riders only — for assignment dropdowns" })
  async listActive() {
    return this.prisma.rider.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, currentFloat: true },
    });
  }

  // ─── Cash summary ─────────────────────────────────────────────

  @Get("cash/summary")
  @ApiOperation({
    summary:
      "Per-rider cash summary: current float, today's COD, unsettled delivery count",
  })
  async cashSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const riders = await this.prisma.rider.findMany({
      orderBy: { name: "asc" },
      include: {
        deliveries: {
          where: {
            deliveredAt: { gte: today },
            cashCollected: { gt: 0 },
          },
          select: {
            cashCollected: true,
            id: true,
            deliveredAt: true,
          },
        },
        cashSettlements: {
          orderBy: { periodEnd: "desc" },
          take: 1,
          select: { periodEnd: true, createdAt: true },
        },
      },
    });

    // Unsettled = deliveries where cash was collected but no cashSettlement
    // covers their period yet. Simplified: deliveries with cashCollected>0
    // whose deliveredAt is later than the most recent settlement's periodEnd
    // (or no settlement exists).
    return riders.map((r) => {
      const lastSettlement = r.cashSettlements[0];
      const cutoff = lastSettlement?.periodEnd ?? new Date(0);

      const todayCollected = r.deliveries
        .filter((d) => d.deliveredAt && d.deliveredAt >= today)
        .reduce((sum, d) => sum + Number(d.cashCollected), 0);

      const unsettledDeliveries = r.deliveries.filter(
        (d) => d.deliveredAt && d.deliveredAt > cutoff,
      ).length;

      return {
        riderId: r.id,
        name: r.name,
        currentFloat: Number(r.currentFloat),
        todayCollected,
        unsettledDeliveries,
        lastSettlementAt:
          lastSettlement?.createdAt ?? lastSettlement?.periodEnd ?? null,
      };
    });
  }

  // ─── Create rider ─────────────────────────────────────────────

  @Post("create")
  @AdminOnly()
  @ApiOperation({ summary: "Create a new rider (ADMIN only)" })
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;

    if (!body.email || !body.password || !body.name || !body.phone) {
      throw new BadRequestException(
        "email, password, name and phone are required",
      );
    }

    const email = String(body.email).toLowerCase();
    const existing = await this.prisma.rider.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("Rider with this email already exists");

    const phoneExists = await this.prisma.rider.findUnique({
      where: { phone: body.phone },
    });
    if (phoneExists) throw new BadRequestException("Rider with this phone already exists");

    const hash = await bcrypt.hash(body.password, 12);
    const r = await this.prisma.rider.create({
      data: {
        email,
        passwordHash: hash,
        name: body.name,
        phone: body.phone,
        nidNumber: body.nidNumber ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider",
        entityId: r.id,
        action: "create",
        diff: { email, name: body.name, phone: body.phone },
      },
    });

    return {
      id: r.id,
      email: r.email,
      name: r.name,
      phone: r.phone,
    };
  }

  // ─── Rider detail ─────────────────────────────────────────────

  @Get(":id")
  @ApiOperation({
    summary:
      "Full rider detail: profile, recent deliveries, cash settlements, today's COD",
  })
  async detail(@Param("id") id: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const r = await this.prisma.rider.findUnique({
      where: { id },
      include: {
        deliveries: {
          orderBy: { assignedAt: "desc" },
          take: 25,
          include: {
            order: {
              select: {
                id: true,
                orderNo: true,
                status: true,
                grandTotal: true,
                paymentMethod: true,
              },
            },
          },
        },
        cashSettlements: {
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    });

    if (!r) return null;

    const todayDeliveries = r.deliveries.filter(
      (d) => d.assignedAt && d.assignedAt >= today,
    );
    const todayCOD = todayDeliveries
      .filter((d) => Number(d.cashCollected) > 0)
      .reduce((sum, d) => sum + Number(d.cashCollected), 0);

    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      nidNumber: r.nidNumber,
      isActive: r.isActive,
      currentFloat: Number(r.currentFloat),
      todayCODCollected: todayCOD,
      todayDeliveryCount: todayDeliveries.length,
      totalDeliveryCount: await this.prisma.delivery.count({
        where: { riderId: id },
      }),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      recentDeliveries: r.deliveries.map((d) => ({
        id: d.id,
        orderNo: d.order?.orderNo,
        orderStatus: d.order?.status,
        grandTotal: d.order ? Number(d.order.grandTotal) : 0,
        paymentMethod: d.order?.paymentMethod,
        cashCollected: Number(d.cashCollected),
        proofStatus: d.proofStatus,
        assignedAt: d.assignedAt,
        deliveredAt: d.deliveredAt,
      })),
      recentSettlements: r.cashSettlements.map((s) => ({
        id: s.id,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        expected: Number(s.expected),
        received: Number(s.received),
        variance: Number(s.variance),
        notes: s.notes,
        createdAt: s.createdAt,
      })),
    };
  }

  // ─── Update rider ─────────────────────────────────────────────

  @Patch(":id")
  @ApiOperation({
    summary:
      "Update rider (name, phone, isActive, password). Password changes require ADMIN.",
  })
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const actorRole = (req as any).role as "ADMIN" | "MANAGER";
    const data: any = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) {
      if (actorRole !== "ADMIN") {
        throw new BadRequestException(
          "Only ADMIN can change a rider's password",
        );
      }
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }

    const updated = await this.prisma.rider.update({
      where: { id },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider",
        entityId: id,
        action: "update",
        diff: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.password && { passwordChanged: true }),
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      isActive: updated.isActive,
      currentFloat: Number(updated.currentFloat),
    };
  }

  // ─── Block / Unblock rider ────────────────────────────────────
  // Rider uses `isActive` not `isBlocked`. Setting isActive=false blocks
  // the rider from logging in / receiving new deliveries.

  @Patch(":id/block")
  @AdminOnly()
  @ApiOperation({ summary: "Block or unblock a rider (ADMIN only)" })
  async block(
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;

    if (typeof body?.isActive !== "boolean") {
      throw new BadRequestException("isActive boolean required");
    }

    const updated = await this.prisma.rider.update({
      where: { id },
      data: { isActive: body.isActive },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider",
        entityId: id,
        action: body.isActive ? "unblock" : "block",
        diff: { isActive: body.isActive },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
    };
  }

  // ─── Float adjustments ────────────────────────────────────────

  @Post("floats")
  @AdminOnly()
  @ApiOperation({
    summary:
      "Adjust rider's current float (give change to rider or reclaim). ADMIN only.",
  })
  async adjustFloat(
    @Body() body: { riderId: string; amount: number; note?: string },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;

    if (!body?.riderId || typeof body.amount !== "number") {
      throw new BadRequestException("riderId and numeric amount required");
    }

    const rider = await this.prisma.rider.findUnique({
      where: { id: body.riderId },
    });
    if (!rider) throw new BadRequestException("Rider not found");

    const before = Number(rider.currentFloat);
    const after = before + body.amount;

    const updated = await this.prisma.rider.update({
      where: { id: body.riderId },
      data: { currentFloat: after },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider",
        entityId: body.riderId,
        action: "adjust_float",
        diff: {
          before,
          delta: body.amount,
          after,
          note: body.note ?? null,
        },
      },
    });

    return {
      riderId: updated.id,
      name: updated.name,
      before,
      delta: body.amount,
      currentFloat: Number(updated.currentFloat),
      note: body.note ?? null,
    };
  }
}
