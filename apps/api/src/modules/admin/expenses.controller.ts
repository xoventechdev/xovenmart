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

const EXPENSE_CATEGORIES = [
  "LOGISTICS",
  "MARKETING",
  "TECH",
  "OFFICE",
  "SALARY",
  "PRODUCT_PURCHASE",
  "GOVERNMENT",
  "BANK_CHARGES",
  "REFUND",
  "MISC",
];

@ApiTags("admin/expenses")
@Controller("admin/expenses")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminExpensesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query("category") category?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("paymentMethod") paymentMethod?: string,
    @Query("page") pageStr?: string,
    @Query("perPage") perPageStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(perPageStr ?? "25", 10) || 25));
    const where: any = {};
    if (category) where.category = category;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (from || to) {
      where.incurredAt = {};
      if (from) where.incurredAt.gte = new Date(from);
      if (to) where.incurredAt.lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { incurredAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      items: items.map((e: any) => ({
        ...e,
        amount: Number(e.amount),
      })),
      page,
      perPage,
      total,
    };
  }

  @Get("categories")
  async categories() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const grouped = await this.prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return EXPENSE_CATEGORIES.map((c) => {
      const row = grouped.find((g: { category: string }) => g.category === c);
      return {
        category: c,
        totalThisMonth: row ? Number(row._sum.amount ?? 0) : 0,
        countThisMonth: row ? row._count._all : 0,
      };
    });
  }

  @Get("summary")
  async summary() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // last 12 months including current
    const months: { month: string; total: number; byCategory: Record<string, number> }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const monthRows = await this.prisma.expense.findMany({
        where: { incurredAt: { gte: mStart, lte: mEnd } },
        select: { category: true, amount: true },
      });
      const byCategory: Record<string, number> = {};
      let total = 0;
      for (const r of monthRows) {
        const a = Number(r.amount);
        total += a;
        byCategory[r.category] = (byCategory[r.category] ?? 0) + a;
      }
      const yyyy = mStart.getFullYear();
      const mm = String(mStart.getMonth() + 1).padStart(2, "0");
      months.push({ month: `${yyyy}-${mm}`, total, byCategory });
    }

    const thisMonth = months[months.length - 1].total;
    const lastMonth = months[months.length - 2].total;
    const growth = lastMonth === 0 ? null : ((thisMonth - lastMonth) / lastMonth) * 100;

    return { months, thisMonth, lastMonth, growth };
  }

  @Get("report")
  async report(@Query("from") from?: string, @Query("to") to?: string) {
    if (!from || !to) {
      throw new BadRequestException("from and to query params are required (YYYY-MM-DD)");
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException("Invalid date format");
    }

    const rows = await this.prisma.expense.findMany({
      where: { incurredAt: { gte: fromDate, lte: toDate } },
      orderBy: { incurredAt: "desc" },
    });

    // byCategory
    const byCategory: Record<string, number> = {};
    const vendorTotals: Record<string, number> = {};
    let totalAmount = 0;
    for (const r of rows) {
      const a = Number(r.amount);
      totalAmount += a;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + a;
      const v = (r.vendorName ?? "—").trim() || "—";
      vendorTotals[v] = (vendorTotals[v] ?? 0) + a;
    }

    // Same period last month — calculate range width and shift
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
    const prevFrom = new Date(fromDate);
    prevFrom.setDate(prevFrom.getDate() - days - 1);
    const prevTo = new Date(toDate);
    prevTo.setDate(prevTo.getDate() - days - 1);
    const prevRows = await this.prisma.expense.findMany({
      where: { incurredAt: { gte: prevFrom, lte: prevTo } },
      select: { amount: true },
    });
    const prevTotal = prevRows.reduce((sum: number, r: { amount: any }) => sum + Number(r.amount), 0);
    const comparison = prevTotal === 0 ? null : ((totalAmount - prevTotal) / prevTotal) * 100;

    const topVendors = Object.entries(vendorTotals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      from: fromDate,
      to: toDate,
      total: totalAmount,
      count: rows.length,
      byCategory,
      topVendors,
      comparison: {
        prevFrom,
        prevTo,
        prevTotal,
        growth: comparison,
      },
    };
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException("Expense not found");
    return { ...e, amount: Number(e.amount) };
  }

  @Post()
  @AdminOnly()
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body.category || !EXPENSE_CATEGORIES.includes(body.category)) {
      throw new BadRequestException(`category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
    }
    if (typeof body.amount !== "number" || body.amount <= 0) {
      throw new BadRequestException("A positive numeric amount is required");
    }
    if (!body.incurredAt) {
      throw new BadRequestException("incurredAt is required");
    }
    const incurredAt = new Date(body.incurredAt);
    if (isNaN(incurredAt.getTime())) {
      throw new BadRequestException("Invalid incurredAt");
    }

    const created = await this.prisma.expense.create({
      data: {
        category: body.category,
        amount: body.amount,
        paymentMethod: body.paymentMethod ?? "CASH",
        descriptionBn: body.descriptionBn ?? null,
        descriptionEn: body.descriptionEn ?? null,
        vendorName: body.vendorName ?? null,
        receiptUrl: body.receiptUrl ?? null,
        incurredAt,
        recordedById: actorId,
        notes: body.notes ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "expense",
        entityId: created.id,
        action: "create",
        diff: {
          category: created.category,
          amount: Number(created.amount),
          paymentMethod: created.paymentMethod,
          vendorName: created.vendorName,
          incurredAt: created.incurredAt,
        },
      },
    });

    return { ...created, amount: Number(created.amount) };
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");

    if (body.category && !EXPENSE_CATEGORIES.includes(body.category)) {
      throw new BadRequestException(`category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
    }

    const data: any = {};
    if (body.category !== undefined) data.category = body.category;
    if (body.amount !== undefined) data.amount = Number(body.amount);
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod;
    if (body.descriptionBn !== undefined) data.descriptionBn = body.descriptionBn;
    if (body.descriptionEn !== undefined) data.descriptionEn = body.descriptionEn;
    if (body.vendorName !== undefined) data.vendorName = body.vendorName;
    if (body.receiptUrl !== undefined) data.receiptUrl = body.receiptUrl;
    if (body.incurredAt !== undefined) {
      const d = new Date(body.incurredAt);
      if (isNaN(d.getTime())) throw new BadRequestException("Invalid incurredAt");
      data.incurredAt = d;
    }
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await this.prisma.expense.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "expense",
        entityId: id,
        action: "update",
        diff: body,
      },
    });
    return { ...updated, amount: Number(updated.amount) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");
    await this.prisma.expense.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "expense",
        entityId: id,
        action: "delete",
        diff: { category: existing.category, amount: Number(existing.amount) },
      },
    });
    return { ok: true };
  }
}