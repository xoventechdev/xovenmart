import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/hr")
@Controller("admin/hr")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminHrController {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────
  // RIDER PAYOUTS
  // ────────────────────────────────────────────────────────────

  @Get("payouts")
  async listPayouts(
    @Query("status") status?: string,
    @Query("riderId") riderId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (riderId) where.riderId = riderId;
    if (from || to) {
      where.periodEnd = {};
      if (from) where.periodEnd.gte = new Date(from);
      if (to) where.periodEnd.lte = new Date(to);
    }
    const rows = await this.prisma.riderPayout.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      include: {
        rider: { select: { id: true, name: true, phone: true } },
      },
    });
    return rows.map((p: any) => ({
      id: p.id,
      riderId: p.riderId,
      riderName: p.rider?.name ?? null,
      riderPhone: p.rider?.phone ?? null,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      deliveriesCount: p.deliveriesCount,
      baseSalary: Number(p.baseSalary),
      commissionTotal: Number(p.commissionTotal),
      bonusesTotal: Number(p.bonusesTotal),
      advancesTotal: Number(p.advancesTotal),
      deductionsTotal: Number(p.deductionsTotal),
      cashCollectedTotal: Number(p.cashCollectedTotal),
      netPayable: Number(p.netPayable),
      status: p.status,
      paidAt: p.paidAt,
      paidVia: p.paidVia,
      paidRef: p.paidRef,
      notes: p.notes,
      createdAt: p.createdAt,
    }));
  }

  @Get("payouts/:id")
  async getPayout(@Param("id") id: string) {
    const p = await this.prisma.riderPayout.findUnique({
      where: { id },
      include: { rider: { select: { id: true, name: true, phone: true, email: true } } },
    });
    if (!p) throw new NotFoundException("Payout not found");
    return {
      ...p,
      baseSalary: Number(p.baseSalary),
      commissionTotal: Number(p.commissionTotal),
      bonusesTotal: Number(p.bonusesTotal),
      advancesTotal: Number(p.advancesTotal),
      deductionsTotal: Number(p.deductionsTotal),
      cashCollectedTotal: Number(p.cashCollectedTotal),
      netPayable: Number(p.netPayable),
    };
  }

  @Post("payouts/calculate")
  @AdminOnly()
  async calculatePayout(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body.riderId || !body.periodStart || !body.periodEnd) {
      throw new BadRequestException("riderId, periodStart and periodEnd are required");
    }
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      throw new BadRequestException("Invalid date format");
    }
    if (periodEnd < periodStart) {
      throw new BadRequestException("periodEnd must be after periodStart");
    }

    const rider = await this.prisma.rider.findUnique({ where: { id: body.riderId } });
    if (!rider) throw new NotFoundException("Rider not found");

    // 1) deliveries in period
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        riderId: body.riderId,
        deliveredAt: { gte: periodStart, lte: periodEnd, not: null },
      },
      select: { id: true, cashCollected: true },
    });
    const deliveriesCount = deliveries.length;
    const cashCollectedTotal = deliveries.reduce(
      (sum: number, d: { cashCollected: any }) => sum + Number(d.cashCollected ?? 0),
      0,
    );

    // 2) payroll config (rider-specific or default)
    let cfg = await this.prisma.payrollConfig.findUnique({
      where: { riderId: body.riderId },
    });
    if (!cfg) {
      cfg = await this.prisma.payrollConfig.findFirst({
        where: { riderId: null },
      });
    }

    const baseSalary = cfg ? Number(cfg.baseSalary) : 0;
    const perDeliveryRate = cfg ? Number(cfg.perDeliveryRate) : 30;
    const codCommissionPercent = cfg ? Number(cfg.codCommissionPercent) : 0;

    // 3) commission
    const commissionTotal =
      deliveriesCount * perDeliveryRate +
      (cashCollectedTotal * codCommissionPercent) / 100;

    // 4) advances (PENDING + PARTIAL, not yet repaid)
    const openAdvances = await this.prisma.staffAdvance.findMany({
      where: { riderId: body.riderId, status: { in: ["PENDING", "PARTIAL"] } },
    });
    const advancesTotal = openAdvances.reduce(
      (sum: number, a: { amount: any; repaidAmount: any }) => sum + (Number(a.amount) - Number(a.repaidAmount)),
      0,
    );

    const bonusesTotal = 0;
    const deductionsTotal = 0;

    const netPayable =
      baseSalary + commissionTotal + bonusesTotal - advancesTotal - deductionsTotal;

    const payout = await this.prisma.riderPayout.create({
      data: {
        riderId: body.riderId,
        periodStart,
        periodEnd,
        deliveriesCount,
        baseSalary,
        commissionTotal,
        bonusesTotal,
        advancesTotal,
        deductionsTotal,
        cashCollectedTotal,
        netPayable,
        status: "DRAFT",
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider_payout",
        entityId: payout.id,
        action: "calculate",
        diff: {
          riderId: body.riderId,
          deliveriesCount,
          netPayable,
          advancesTotal,
        },
      },
    });

    return {
      ...payout,
      baseSalary: Number(payout.baseSalary),
      commissionTotal: Number(payout.commissionTotal),
      bonusesTotal: Number(payout.bonusesTotal),
      advancesTotal: Number(payout.advancesTotal),
      deductionsTotal: Number(payout.deductionsTotal),
      cashCollectedTotal: Number(payout.cashCollectedTotal),
      netPayable: Number(payout.netPayable),
    };
  }

  @Patch("payouts/:id")
  @AdminOnly()
  async updatePayout(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.riderPayout.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Payout not found");
    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Only DRAFT payouts can be edited");
    }

    const baseSalary =
      body.baseSalary !== undefined ? Number(body.baseSalary) : Number(existing.baseSalary);
    const commissionTotal =
      body.commissionTotal !== undefined
        ? Number(body.commissionTotal)
        : Number(existing.commissionTotal);
    const bonusesTotal =
      body.bonusesTotal !== undefined ? Number(body.bonusesTotal) : Number(existing.bonusesTotal);
    const advancesTotal =
      body.advancesTotal !== undefined
        ? Number(body.advancesTotal)
        : Number(existing.advancesTotal);
    const deductionsTotal =
      body.deductionsTotal !== undefined
        ? Number(body.deductionsTotal)
        : Number(existing.deductionsTotal);

    const netPayable =
      baseSalary + commissionTotal + bonusesTotal - advancesTotal - deductionsTotal;

    const updated = await this.prisma.riderPayout.update({
      where: { id },
      data: {
        baseSalary,
        commissionTotal,
        bonusesTotal,
        advancesTotal,
        deductionsTotal,
        netPayable,
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider_payout",
        entityId: id,
        action: "update",
        diff: { body, netPayable },
      },
    });

    return {
      ...updated,
      baseSalary: Number(updated.baseSalary),
      commissionTotal: Number(updated.commissionTotal),
      bonusesTotal: Number(updated.bonusesTotal),
      advancesTotal: Number(updated.advancesTotal),
      deductionsTotal: Number(updated.deductionsTotal),
      cashCollectedTotal: Number(updated.cashCollectedTotal),
      netPayable: Number(updated.netPayable),
    };
  }

  @Post("payouts/:id/approve")
  @AdminOnly()
  async approvePayout(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.riderPayout.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Payout not found");
    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Only DRAFT payouts can be approved");
    }
    const updated = await this.prisma.riderPayout.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider_payout",
        entityId: id,
        action: "approve",
      },
    });
    return {
      ...updated,
      baseSalary: Number(updated.baseSalary),
      commissionTotal: Number(updated.commissionTotal),
      bonusesTotal: Number(updated.bonusesTotal),
      advancesTotal: Number(updated.advancesTotal),
      deductionsTotal: Number(updated.deductionsTotal),
      cashCollectedTotal: Number(updated.cashCollectedTotal),
      netPayable: Number(updated.netPayable),
    };
  }

  @Post("payouts/:id/pay")
  @AdminOnly()
  async payPayout(
    @Param("id") id: string,
    @Body() body: { paidVia?: string; paidRef?: string },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.riderPayout.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Payout not found");
    if (existing.status !== "APPROVED") {
      throw new BadRequestException("Only APPROVED payouts can be marked paid");
    }
    if (!body?.paidVia) {
      throw new BadRequestException("paidVia is required (CASH, BKASH, BANK, NAGAD, CARD, OTHER)");
    }

    const updated = await this.prisma.riderPayout.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidVia: body.paidVia,
        paidRef: body.paidRef ?? null,
      },
    });

    // Mark linked advances repaid
    const linkedAdvances = await this.prisma.staffAdvance.findMany({
      where: { riderId: existing.riderId, status: { in: ["PENDING", "PARTIAL"] } },
    });
    for (const adv of linkedAdvances) {
      await this.prisma.staffAdvance.update({
        where: { id: adv.id },
        data: {
          status: "REPAID",
          repaidAmount: adv.amount,
          repaidAt: new Date(),
          payoutId: id,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider_payout",
        entityId: id,
        action: "pay",
        diff: { paidVia: body.paidVia, paidRef: body.paidRef ?? null, linkedAdvances: linkedAdvances.length },
      },
    });

    return {
      ...updated,
      baseSalary: Number(updated.baseSalary),
      commissionTotal: Number(updated.commissionTotal),
      bonusesTotal: Number(updated.bonusesTotal),
      advancesTotal: Number(updated.advancesTotal),
      deductionsTotal: Number(updated.deductionsTotal),
      cashCollectedTotal: Number(updated.cashCollectedTotal),
      netPayable: Number(updated.netPayable),
    };
  }

  @Delete("payouts/:id")
  @AdminOnly()
  async removePayout(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.riderPayout.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Payout not found");
    if (existing.status !== "DRAFT" && existing.status !== "CANCELLED") {
      throw new BadRequestException("Only DRAFT or CANCELLED payouts can be deleted");
    }
    await this.prisma.riderPayout.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "rider_payout",
        entityId: id,
        action: "delete",
        diff: { status: existing.status },
      },
    });
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────
  // STAFF ADVANCES
  // ────────────────────────────────────────────────────────────

  @Get("advances")
  async listAdvances(
    @Query("riderId") riderId?: string,
    @Query("status") status?: string,
  ) {
    const where: any = {};
    if (riderId) where.riderId = riderId;
    if (status) where.status = status;
    const rows = await this.prisma.staffAdvance.findMany({
      where,
      orderBy: { givenAt: "desc" },
      include: { rider: { select: { id: true, name: true, phone: true } } },
    });
    return rows.map((a: any) => ({
      id: a.id,
      riderId: a.riderId,
      riderName: a.rider?.name ?? null,
      riderPhone: a.rider?.phone ?? null,
      adminUserId: a.adminUserId,
      amount: Number(a.amount),
      reason: a.reason,
      givenAt: a.givenAt,
      givenById: a.givenById,
      repaidAmount: Number(a.repaidAmount),
      repaidAt: a.repaidAt,
      payoutId: a.payoutId,
      status: a.status,
    }));
  }

  @Post("advances")
  @AdminOnly()
  async createAdvance(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body || typeof body.amount !== "number" || body.amount <= 0) {
      throw new BadRequestException("A positive numeric amount is required");
    }
    if (!body.riderId && !body.adminUserId) {
      throw new BadRequestException("Either riderId or adminUserId is required");
    }

    // Validate against rider PayrollConfig.maxAdvance if it's a rider advance
    if (body.riderId) {
      const rider = await this.prisma.rider.findUnique({
        where: { id: body.riderId },
        include: { payrollConfig: true },
      });
      if (!rider) throw new NotFoundException("Rider not found");
      let maxAdvance = 5000;
      if (rider.payrollConfig) {
        maxAdvance = Number(rider.payrollConfig.maxAdvance);
      } else {
        const defaultCfg = await this.prisma.payrollConfig.findFirst({
          where: { riderId: null },
        });
        if (defaultCfg) maxAdvance = Number(defaultCfg.maxAdvance);
      }

      // Sum existing open advances for this rider
      const openSum = await this.prisma.staffAdvance.aggregate({
        where: { riderId: body.riderId, status: { in: ["PENDING", "PARTIAL"] } },
        _sum: { amount: true, repaidAmount: true },
      });
      const outstanding =
        Number(openSum._sum.amount ?? 0) - Number(openSum._sum.repaidAmount ?? 0);

      if (outstanding + body.amount > maxAdvance) {
        throw new BadRequestException(
          `Advance would exceed max allowed (${maxAdvance}). Outstanding: ${outstanding.toFixed(
            2,
          )}`,
        );
      }
    }

    const created = await this.prisma.staffAdvance.create({
      data: {
        riderId: body.riderId ?? null,
        adminUserId: body.adminUserId ?? null,
        amount: body.amount,
        reason: body.reason ?? null,
        givenById: actorId,
        status: "PENDING",
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "staff_advance",
        entityId: created.id,
        action: "create",
        diff: {
          riderId: body.riderId ?? null,
          adminUserId: body.adminUserId ?? null,
          amount: body.amount,
          reason: body.reason ?? null,
        },
      },
    });

    return {
      ...created,
      amount: Number(created.amount),
      repaidAmount: Number(created.repaidAmount),
    };
  }

  @Patch("advances/:id/repay")
  @AdminOnly()
  async repayAdvance(
    @Param("id") id: string,
    @Body() body: { amount: number },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    if (!body || typeof body.amount !== "number" || body.amount <= 0) {
      throw new BadRequestException("A positive numeric amount is required");
    }
    const existing = await this.prisma.staffAdvance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Advance not found");
    if (existing.status === "REPAID") {
      throw new BadRequestException("Advance is already fully repaid");
    }

    const newRepaid = Number(existing.repaidAmount) + body.amount;
    const total = Number(existing.amount);
    const isFull = newRepaid >= total;
    const status = isFull ? "REPAID" : "PARTIAL";

    const updated = await this.prisma.staffAdvance.update({
      where: { id },
      data: {
        repaidAmount: newRepaid,
        status,
        repaidAt: isFull ? new Date() : existing.repaidAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "staff_advance",
        entityId: id,
        action: "repay",
        diff: { repaidNow: body.amount, newRepaid, status },
      },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
      repaidAmount: Number(updated.repaidAmount),
    };
  }

  // ────────────────────────────────────────────────────────────
  // PAYROLL CONFIGS
  // ────────────────────────────────────────────────────────────

  @Get("payroll-configs")
  async listPayrollConfigs() {
    const rows = await this.prisma.payrollConfig.findMany({
      orderBy: [{ riderId: "asc" }],
      include: { rider: { select: { id: true, name: true, phone: true } } },
    });
    return rows.map((c: any) => ({
      id: c.id,
      riderId: c.riderId,
      riderName: c.rider?.name ?? null,
      baseSalary: Number(c.baseSalary),
      perDeliveryRate: Number(c.perDeliveryRate),
      codCommissionPercent: Number(c.codCommissionPercent),
      maxAdvance: Number(c.maxAdvance),
      isActive: c.isActive,
    }));
  }

  @Get("payroll-configs/:riderId")
  async getPayrollConfig(@Param("riderId") riderId: string) {
    // riderId can be 'default' meaning fetch the default config
    const lookupId = riderId === "default" ? null : riderId;
    let cfg = await this.prisma.payrollConfig.findUnique({
      where: { riderId: lookupId as any },
      include: { rider: { select: { id: true, name: true, phone: true } } },
    });
    if (!cfg && lookupId) {
      cfg = await this.prisma.payrollConfig.findFirst({
        where: { riderId: null },
        include: { rider: { select: { id: true, name: true, phone: true } } },
      });
    }
    if (!cfg) {
      // return empty defaults
      return {
        id: null,
        riderId: lookupId,
        riderName: null,
        baseSalary: 0,
        perDeliveryRate: 30,
        codCommissionPercent: 0,
        maxAdvance: 5000,
        isActive: true,
      };
    }
    return {
      id: cfg.id,
      riderId: cfg.riderId,
      riderName: cfg.rider?.name ?? null,
      baseSalary: Number(cfg.baseSalary),
      perDeliveryRate: Number(cfg.perDeliveryRate),
      codCommissionPercent: Number(cfg.codCommissionPercent),
      maxAdvance: Number(cfg.maxAdvance),
      isActive: cfg.isActive,
    };
  }

  @Post("payroll-configs")
  @AdminOnly()
  async upsertPayrollConfig(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const riderId = body.riderId ?? null;
    const data: any = {
      riderId,
      baseSalary: Number(body.baseSalary ?? 0),
      perDeliveryRate: Number(body.perDeliveryRate ?? 30),
      codCommissionPercent: Number(body.codCommissionPercent ?? 0),
      maxAdvance: Number(body.maxAdvance ?? 5000),
      isActive: body.isActive ?? true,
    };

    let cfg;
    if (riderId) {
      const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
      if (!rider) throw new NotFoundException("Rider not found");
      cfg = await this.prisma.payrollConfig.upsert({
        where: { riderId },
        create: data,
        update: data,
      });
    } else {
      // default config — upsert by riderId=null
      const existing = await this.prisma.payrollConfig.findFirst({
        where: { riderId: null },
      });
      if (existing) {
        cfg = await this.prisma.payrollConfig.update({
          where: { id: existing.id },
          data,
        });
      } else {
        cfg = await this.prisma.payrollConfig.create({ data });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "payroll_config",
        entityId: cfg.id,
        action: riderId ? "upsert" : "upsert_default",
        diff: { riderId, ...data },
      },
    });

    return {
      ...cfg,
      baseSalary: Number(cfg.baseSalary),
      perDeliveryRate: Number(cfg.perDeliveryRate),
      codCommissionPercent: Number(cfg.codCommissionPercent),
      maxAdvance: Number(cfg.maxAdvance),
    };
  }

  @Patch("payroll-configs/:riderId")
  @AdminOnly()
  async updatePayrollConfig(
    @Param("riderId") riderId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    const lookupId = riderId === "default" ? null : riderId;
    let existing;
    if (lookupId) {
      existing = await this.prisma.payrollConfig.findUnique({
        where: { riderId: lookupId },
      });
    } else {
      existing = await this.prisma.payrollConfig.findFirst({
        where: { riderId: null },
      });
    }
    if (!existing) throw new NotFoundException("Payroll config not found");

    const data: any = {};
    if (body.baseSalary !== undefined) data.baseSalary = Number(body.baseSalary);
    if (body.perDeliveryRate !== undefined) data.perDeliveryRate = Number(body.perDeliveryRate);
    if (body.codCommissionPercent !== undefined)
      data.codCommissionPercent = Number(body.codCommissionPercent);
    if (body.maxAdvance !== undefined) data.maxAdvance = Number(body.maxAdvance);
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const updated = await this.prisma.payrollConfig.update({
      where: { id: existing.id },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "payroll_config",
        entityId: updated.id,
        action: "update",
        diff: data,
      },
    });

    return {
      ...updated,
      baseSalary: Number(updated.baseSalary),
      perDeliveryRate: Number(updated.perDeliveryRate),
      codCommissionPercent: Number(updated.codCommissionPercent),
      maxAdvance: Number(updated.maxAdvance),
    };
  }

  // ────────────────────────────────────────────────────────────
  // STAFF SALARY (admin users)
  // ────────────────────────────────────────────────────────────

  @Get("staff-salary")
  async listStaffSalary() {
    const admins = await this.prisma.adminUser.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    // Pull all AppSetting rows that match staff_salary.last_paid.*
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: "staff_salary.last_paid." } },
    });
    const map = new Map<string, any>();
    for (const s of settings) {
      const adminId = s.key.replace("staff_salary.last_paid.", "");
      try {
        map.set(adminId, JSON.parse(s.value));
      } catch {
        /* ignore */
      }
    }

    return admins.map((a: { id: string; name: string; email: string; role: string; isActive: boolean }) => {
      const last = map.get(a.id);
      return {
        adminUserId: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        isActive: a.isActive,
        lastPaidMonth: last?.month ?? null,
        lastPaidAmount: last?.amount ? Number(last.amount) : null,
        lastPaidAt: last?.paidAt ?? null,
        notes: last?.notes ?? null,
      };
    });
  }

  @Post("staff-salary/pay")
  @AdminOnly()
  async payStaffSalary(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body.adminUserId) throw new BadRequestException("adminUserId is required");
    if (typeof body.amount !== "number" || body.amount <= 0) {
      throw new BadRequestException("A positive numeric amount is required");
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      throw new BadRequestException("month must be in YYYY-MM format");
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: body.adminUserId },
    });
    if (!admin) throw new NotFoundException("Admin user not found");

    const key = `staff_salary.last_paid.${body.adminUserId}`;
    const value = JSON.stringify({
      month: body.month,
      amount: body.amount,
      paidAt: new Date().toISOString(),
      paidBy: actorId,
      notes: body.notes ?? null,
    });

    await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: actorId },
      update: { value, updatedBy: actorId },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "staff_salary",
        entityId: body.adminUserId,
        action: "pay",
        diff: { month: body.month, amount: body.amount, notes: body.notes ?? null },
      },
    });

    return { ok: true, key, adminUserId: body.adminUserId, month: body.month, amount: body.amount };
  }
}
