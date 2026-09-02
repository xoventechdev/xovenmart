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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import * as bcrypt from "bcryptjs";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin")
@Controller("admin")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Staff self-service (profile + password) ────────────────

  /**
   * Return the current staff member's own profile.
   * Mirrors /auth/me but locked to admin audience and returns the full
   * editable surface (name, phone, email, role, lastLoginAt).
   */
  @Get("me")
  @ApiOperation({ summary: "Get current staff member's profile (admin/manager)" })
  async getMe(@Req() req: Request) {
    const id = (req as any).userId;
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!admin) throw new NotFoundException("Admin not found");
    return { admin };
  }

  /**
   * Staff can update their own name + phone.
   * Email and role are intentionally NOT editable here — email change
   * requires admin confirmation (out of scope for v1) and role changes
   * must go through the HR/admin flow.
   */
  @Patch("me")
  @ApiOperation({ summary: "Update current staff member's name and/or phone" })
  async updateMe(@Req() req: Request, @Body() body: { name?: string; phone?: string | null }) {
    const id = (req as any).userId;
    if (!body.name && body.phone === undefined) {
      throw new BadRequestException("No fields to update");
    }
    const data: any = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (body.phone !== undefined) {
      // empty string -> null (clears phone); otherwise trimmed
      data.phone = body.phone && String(body.phone).trim() ? String(body.phone).trim() : null;
    }
    const admin = await this.prisma.adminUser.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: id,
        actorRole: admin.role,
        entity: "admin_user",
        entityId: id,
        action: "self_update",
        diff: data,
      },
    });
    return { admin };
  }

  /**
   * Change the staff member's own password.
   * Requires the current password for confirmation (anti-takeover).
   * Revokes all refresh tokens on success so a hijacked session can't
   * continue using the old password.
   */
  @Post("me/change-password")
  @ApiOperation({ summary: "Change current staff member's password (requires current password)" })
  async changeMyPassword(
    @Req() req: Request,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const id = (req as any).userId;
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException("currentPassword and newPassword are required");
    }
    if (String(body.newPassword).length < 8) {
      throw new BadRequestException("New password must be at least 8 characters");
    }
    const admin = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException("Admin not found");

    const ok = await bcrypt.compare(body.currentPassword, admin.passwordHash);
    if (!ok) throw new BadRequestException("Current password is incorrect");

    const newHash = await bcrypt.hash(body.newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens so other sessions must log in again
    await this.prisma.refreshToken.updateMany({
      where: { adminUserId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: id,
        actorRole: admin.role,
        entity: "admin_user",
        entityId: id,
        action: "password_change",
      },
    });

    return { ok: true };
  }

  // ─── Dashboard stats ─────────────────────────────────────────

  /**
   * Compact stat tiles for the dashboard header.
   * Returns today / this-week / this-month counts + revenue + period-over-period
   * deltas so the dashboard can show trend arrows. Also includes the
   * 6-bucket order-status funnel (PENDING → DELIVERED) and the orders-by-source
   * split (WEB / POS / ANDROID) which feed the small widgets below the KPI row.
   *
   * Period boundaries (BD-local):
   *   - today     : today 00:00 → now
   *   - week      : last 7 days, rolling
   *   - month     : last 30 days, rolling
   *   - prevWeek  : 7 days before the rolling week (for delta %)
   *   - prevMonth : 30 days before the rolling month (for delta %)
   *
   * Cancelled orders are excluded from revenue (and from revenue deltas).
   */
  @Get("stats")
  @ApiOperation({ summary: "Dashboard KPIs: today / week / month orders + revenue + deltas + status funnel + source split" })
  async stats() {
    const now = new Date();
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);

    const dayMs = 24 * 60 * 60 * 1000;
    const week0 = new Date(today0.getTime() - 6 * dayMs); // 7-day window incl. today
    const month0 = new Date(today0.getTime() - 29 * dayMs); // 30-day window incl. today
    const prevWeekStart = new Date(week0.getTime() - 7 * dayMs);
    const prevMonthStart = new Date(month0.getTime() - 30 * dayMs);

    const nonCancelled = { status: { not: "CANCELLED" as const } };

    const [
      ordersToday,
      revenueTodayAgg,
      ordersWeek,
      revenueWeekAgg,
      ordersPrevWeek,
      revenuePrevWeekAgg,
      ordersMonth,
      revenueMonthAgg,
      ordersPrevMonth,
      revenuePrevMonthAgg,
      pending,
      preparingOut,
      deliveredToday,
      cancelledToday,
      // Status funnel (all-time, all sources)
      funnelPending,
      funnelAccepted,
      funnelPreparing,
      funnelPrepared,
      funnelOutForDelivery,
      funnelDelivered,
      // Source split (last 30 days)
      srcWeb,
      srcPos,
      srcAndroid,
      // Low stock list — any active product whose stockQty is at or below
      // its threshold. We don't filter on `trackStock` because the
      // inventory page itself shows low-stock for every row; admins
      // expect the dashboard tile to match. `trackStock` only governs
      // whether the *customer* UI blocks add-to-cart — it's not a
      // gating signal for ops visibility.
      lowStockItems,
    ] = await Promise.all([
      this.prisma.order.count({ where: { placedAt: { gte: today0 } } }),
      this.prisma.order.aggregate({ where: { placedAt: { gte: today0 }, ...nonCancelled }, _sum: { grandTotal: true } }),
      this.prisma.order.count({ where: { placedAt: { gte: week0 } } }),
      this.prisma.order.aggregate({ where: { placedAt: { gte: week0 }, ...nonCancelled }, _sum: { grandTotal: true } }),
      this.prisma.order.count({ where: { placedAt: { gte: prevWeekStart, lt: week0 } } }),
      this.prisma.order.aggregate({ where: { placedAt: { gte: prevWeekStart, lt: week0 }, ...nonCancelled }, _sum: { grandTotal: true } }),
      this.prisma.order.count({ where: { placedAt: { gte: month0 } } }),
      this.prisma.order.aggregate({ where: { placedAt: { gte: month0 }, ...nonCancelled }, _sum: { grandTotal: true } }),
      this.prisma.order.count({ where: { placedAt: { gte: prevMonthStart, lt: month0 } } }),
      this.prisma.order.aggregate({ where: { placedAt: { gte: prevMonthStart, lt: month0 }, ...nonCancelled }, _sum: { grandTotal: true } }),
      this.prisma.order.count({ where: { status: { in: ["PENDING", "ACCEPTED", "PREPARING", "PREPARED"] } } }),
      this.prisma.order.count({ where: { status: { in: ["ACCEPTED", "PREPARING", "PREPARED"] } } }),
      this.prisma.order.count({ where: { status: "DELIVERED", deliveredAt: { gte: today0 } } }),
      this.prisma.order.count({ where: { status: "CANCELLED", cancelledAt: { gte: today0 } } }),
      this.prisma.order.count({ where: { status: "PENDING" } }),
      this.prisma.order.count({ where: { status: "ACCEPTED" } }),
      this.prisma.order.count({ where: { status: "PREPARING" } }),
      this.prisma.order.count({ where: { status: "PREPARED" } }),
      this.prisma.order.count({ where: { status: "OUT_FOR_DELIVERY" } }),
      this.prisma.order.count({ where: { status: "DELIVERED" } }),
      this.prisma.order.count({ where: { source: "WEB", placedAt: { gte: month0 } } }),
      this.prisma.order.count({ where: { source: "POS", placedAt: { gte: month0 } } }),
      this.prisma.order.count({ where: { source: "ANDROID", placedAt: { gte: month0 } } }),
      this.prisma.inventory.findMany({
        where: { product: { isActive: true } },
        select: {
          stockQty: true,
          lowStockThreshold: true,
          product: {
            select: {
              id: true,
              slug: true,
              nameBn: true,
              nameEn: true,
              images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
            },
          },
        },
      }),
    ]);

    const sum = (agg: { _sum: { grandTotal: any } } | null | undefined) =>
      Number(agg?._sum?.grandTotal ?? 0);

    const pct = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    // Compute stock counts BEFORE slicing — the tile shows the *total*
    // number of low / out-of-stock products, not just the 8 we display.
    const allLow = lowStockItems.filter((r) => r.stockQty <= r.lowStockThreshold);
    const lowStockList = allLow
      .sort((a, b) => a.stockQty - b.stockQty) // most-empty first
      .slice(0, 8)
      .map((r) => ({
        productId: r.product.id,
        slug: r.product.slug,
        nameBn: r.product.nameBn,
        nameEn: r.product.nameEn,
        imageUrl: r.product.images[0]?.url ?? null,
        stockQty: r.stockQty,
        lowStockThreshold: r.lowStockThreshold,
      }));

    return {
      // Compact tiles
      ordersToday,
      revenueToday: sum(revenueTodayAgg),
      pending,
      lowStockCount: allLow.length,
      // Distinguish "completely empty" from "below threshold" — admins
      // care a lot about the difference (an out-of-stock product can't
      // accept any orders, a low-stock one is still sellable).
      outOfStockCount: allLow.filter((r) => r.stockQty <= 0).length,

      // Extended KPIs (period + delta %)
      ordersWeek,
      revenueWeek: sum(revenueWeekAgg),
      ordersWeekDelta: pct(ordersWeek, ordersPrevWeek),
      revenueWeekDelta: pct(sum(revenueWeekAgg), sum(revenuePrevWeekAgg)),
      ordersMonth,
      revenueMonth: sum(revenueMonthAgg),
      ordersMonthDelta: pct(ordersMonth, ordersPrevMonth),
      revenueMonthDelta: pct(sum(revenueMonthAgg), sum(revenuePrevMonthAgg)),

      // Quick counters
      inProgress: preparingOut,
      deliveredToday,
      cancelledToday,

      // Funnel (for stacked bar / pie)
      funnel: {
        PENDING: funnelPending,
        ACCEPTED: funnelAccepted,
        PREPARING: funnelPreparing,
        PREPARED: funnelPrepared,
        OUT_FOR_DELIVERY: funnelOutForDelivery,
        DELIVERED: funnelDelivered,
      },

      // Source split (last 30 days)
      sourceSplit: { WEB: srcWeb, POS: srcPos, ANDROID: srcAndroid },

      // Low stock detail
      lowStock: lowStockList,
    };
  }

  // ─── Dashboard chart data ────────────────────────────────────

  /**
   * Heavy aggregates for the dashboard chart widgets:
   *   - `daily`         : last 14 days of { orders, revenue } for the trend chart
   *   - `topProducts`   : top 5 best-sellers in the last 7 days (by qty)
   *   - `paymentSplit`  : revenue by payment method in the last 30 days
   *   - `categorySplit` : revenue by category in the last 30 days (top 6)
   *
   * The daily series is filled with zeros for days with no orders so the
   * chart's x-axis stays a continuous 14-day window without gaps.
   */
  @Get("dashboard")
  @ApiOperation({ summary: "Dashboard chart data: 14-day trend, top products, payment split, category split" })
  async dashboard() {
    const now = new Date();
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const days = 14;
    const dailyStart = new Date(today0.getTime() - (days - 1) * dayMs);
    const weekStart = new Date(today0.getTime() - 6 * dayMs);
    const monthStart = new Date(today0.getTime() - 29 * dayMs);

    const [dailyOrders, topProductRows, paymentRows, categoryRows] = await Promise.all([
      // Daily orders + revenue for last 14 days
      this.prisma.order.findMany({
        where: { placedAt: { gte: dailyStart } },
        select: { placedAt: true, grandTotal: true, status: true },
      }),
      // Top products by qty in last 7 days (group by productId via OrderItem)
      this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: { placedAt: { gte: weekStart }, status: { not: "CANCELLED" } } },
        _sum: { qty: true, lineTotal: true },
        orderBy: { _sum: { qty: "desc" } },
        take: 5,
      }),
      // Payment method split (last 30 days, exclude CANCELLED)
      this.prisma.order.groupBy({
        by: ["paymentMethod"],
        where: { placedAt: { gte: monthStart }, status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      // Category split (last 30 days, exclude CANCELLED)
      this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: { placedAt: { gte: monthStart }, status: { not: "CANCELLED" } } },
        _sum: { lineTotal: true },
      }),
    ]);

    // ─── Build 14-day daily series (fill zeros for empty days) ───
    const dailyMap = new Map<string, { orders: number; revenue: number; cancelled: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(dailyStart.getTime() + i * dayMs);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { orders: 0, revenue: 0, cancelled: 0 });
    }
    for (const o of dailyOrders) {
      const key = new Date(o.placedAt).toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (!entry) continue;
      entry.orders += 1;
      if (o.status !== "CANCELLED") entry.revenue += Number(o.grandTotal);
      else entry.cancelled += 1;
    }
    const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v }));

    // ─── Top products — join product name/image ───
    const topProductIds = topProductRows.map((r) => r.productId);
    const topProductsMeta = topProductIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: {
            id: true,
            slug: true,
            nameEn: true,
            nameBn: true,
            images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
          },
        })
      : [];
    const metaMap = new Map(topProductsMeta.map((p) => [p.id, p]));
    const topProducts = topProductRows.map((r) => {
      const m = metaMap.get(r.productId);
      return {
        productId: r.productId,
        slug: m?.slug ?? "",
        nameEn: m?.nameEn ?? "",
        nameBn: m?.nameBn ?? "",
        imageUrl: m?.images[0]?.url ?? null,
        qty: r._sum.qty ?? 0,
        revenue: Number(r._sum.lineTotal ?? 0),
      };
    });

    // ─── Payment method split ───
    const paymentSplit = paymentRows
      .map((r) => ({
        method: r.paymentMethod,
        orders: r._count._all,
        revenue: Number(r._sum.grandTotal ?? 0),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // ─── Category split (top 6 by revenue, others → "Other") ───
    const productCategoryMap = new Map<string, string>(); // productId -> category name
    if (topProductIds.length > 0 || categoryRows.length > 0) {
      const allProductIds = Array.from(new Set(categoryRows.map((r) => r.productId)));
      if (allProductIds.length > 0) {
        const prods = await this.prisma.product.findMany({
          where: { id: { in: allProductIds } },
          select: { id: true, category: { select: { nameEn: true } } },
        });
        for (const p of prods) productCategoryMap.set(p.id, p.category.nameEn);
      }
    }
    const catTotals = new Map<string, number>();
    for (const r of categoryRows) {
      const cat = productCategoryMap.get(r.productId) ?? "Other";
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + Number(r._sum.lineTotal ?? 0));
    }
    const sortedCats = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]);
    const top6 = sortedCats.slice(0, 6);
    const otherTotal = sortedCats.slice(6).reduce((s, [, v]) => s + v, 0);
    const categorySplit = top6.map(([category, revenue]) => ({ category, revenue }));
    if (otherTotal > 0) categorySplit.push({ category: "Other", revenue: otherTotal });

    return { daily, topProducts, paymentSplit, categorySplit };
  }

  // ─── Products CRUD ────────────────────────────────────────────

  @Get("products")
  @ApiOperation({ summary: "List all products (admin)" })
  async listProducts(@Query() q: { page?: number; perPage?: number; q?: string }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where = q.q ? {
      OR: [
        { nameBn: { contains: q.q, mode: "insensitive" as const } },
        { nameEn: { contains: q.q, mode: "insensitive" as const } },
        { sku: { contains: q.q, mode: "insensitive" as const } },
      ],
    } : {};
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: { category: { select: { nameEn: true, nameBn: true, slug: true } }, inventory: true },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  @Get("products/:id")
  @ApiOperation({ summary: "Get single product by id (admin)" })
  async getProduct(@Param("id") id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { category: { select: { nameEn: true, nameBn: true, slug: true } }, inventory: true },
    });
    if (!p) throw new NotFoundException("Product not found");
    return p;
  }

  @Post("products")
  @ApiOperation({ summary: "Create product (admin)" })
  async createProduct(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const p = await this.prisma.product.create({
      data: {
        sku: body.sku,
        slug: body.slug,
        nameBn: body.nameBn,
        nameEn: body.nameEn,
        descriptionBn: body.descriptionBn,
        descriptionEn: body.descriptionEn,
        categoryId: body.categoryId,
        unit: body.unit,
        mrp: body.mrp,
        salePrice: body.salePrice,
        costPrice: body.costPrice,
        isFeatured: body.isFeatured ?? false,
        isNew: body.isNew ?? false,
        trackStock: body.trackStock ?? false,
        inventory: {
          create: { stockQty: body.stockQty ?? 0, lowStockThreshold: body.lowStockThreshold ?? 10 },
        },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "product",
        entityId: p.id,
        action: "create",
        diff: body,
      },
    });
    return p;
  }

  @Patch("products/:id")
  @ApiOperation({ summary: "Update product (admin)" })
  async updateProduct(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const before = await this.prisma.product.findUnique({ where: { id } });
    const p = await this.prisma.product.update({
      where: { id },
      data: {
        ...(body.nameBn !== undefined && { nameBn: body.nameBn }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn }),
        ...(body.descriptionBn !== undefined && { descriptionBn: body.descriptionBn }),
        ...(body.descriptionEn !== undefined && { descriptionEn: body.descriptionEn }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(body.unit !== undefined && { unit: body.unit }),
        ...(body.mrp !== undefined && { mrp: body.mrp }),
        ...(body.salePrice !== undefined && { salePrice: body.salePrice }),
        ...(body.costPrice !== undefined && { costPrice: body.costPrice }),
        ...(body.isFeatured !== undefined && { isFeatured: body.isFeatured }),
        ...(body.isNew !== undefined && { isNew: body.isNew }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.trackStock !== undefined && { trackStock: body.trackStock }),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "product",
        entityId: id,
        action: "update",
        diff: { before, after: body },
      },
    });
    return p;
  }

  @Delete("products/:id")
  @AdminOnly()
  @ApiOperation({ summary: "Soft-delete product (sets isActive=false). ADMIN only." })
  async softDeleteProduct(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "product", entityId: id, action: "soft_delete" },
    });
    return { ok: true };
  }

  // ─── Riders CRUD ──────────────────────────────────────────────

  @Get("riders")
  async listRiders() {
    return this.prisma.rider.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, isActive: true, currentFloat: true },
    });
  }

  @Post("riders")
  @AdminOnly()
  async createRider(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const hash = await bcrypt.hash(body.password, 12);
    const r = await this.prisma.rider.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: hash,
        name: body.name,
        phone: body.phone,
        nidNumber: body.nidNumber,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "rider", entityId: r.id, action: "create", diff: { email: body.email, name: body.name } },
    });
    return { id: r.id, email: r.email, name: r.name, phone: r.phone };
  }

  @Patch("riders/:id")
  @AdminOnly()
  async updateRider(@Param("id") id: string, @Body() body: any) {
    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.phone) data.phone = body.phone;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }
    return this.prisma.rider.update({ where: { id }, data });
  }

  // ─── Orders board ─────────────────────────────────────────────

  @Get("orders")
  async listOrders(@Query() q: { status?: string; statuses?: string; source?: string; page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where: any = {};
    // Accept either ?status=PENDING (single) or ?statuses=PENDING,PREPARING (comma list)
    if (q.statuses) {
      const list = q.statuses.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length === 1) where.status = list[0];
      else if (list.length > 1) where.status = { in: list };
    } else if (q.status) {
      where.status = q.status;
    }
    // Filter by order channel (WEB / POS / ANDROID). Missing param = all.
    if (q.source) {
      where.source = q.source;
    }
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { placedAt: "desc" },
        include: { items: true, user: { select: { phone: true, name: true } }, delivery: { include: { rider: { select: { name: true } } } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  @Post("orders/:id/assign-rider")
  async assignRider(@Param("id") orderId: string, @Body() body: { riderId: string }, @Req() req: Request) {
    const actorId = (req as any).userId;
    const d = await this.prisma.delivery.upsert({
      where: { orderId },
      update: { riderId: body.riderId, assignedAt: new Date() },
      create: { orderId, riderId: body.riderId, assignedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "order", entityId: orderId, action: "assign_rider", diff: body },
    });
    return d;
  }

  @Get("orders/:id")
  @ApiOperation({ summary: "Get full order detail with items, customer, delivery, status events" })
  async getOrder(@Param("id") id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        user: { select: { id: true, name: true, phone: true, email: true } },
        delivery: { include: { rider: { select: { id: true, name: true, phone: true } } } },
        statusEvents: { orderBy: { createdAt: "asc" } },
        payments: true,
      },
    });
    if (!o) return null;
    return {
      ...o,
      subtotal: Number(o.subtotal),
      discountTotal: Number(o.discountTotal),
      deliveryFee: Number(o.deliveryFee),
      grandTotal: Number(o.grandTotal),
      items: o.items?.map((it: any) => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        lineTotal: Number(it.lineTotal),
      })),
    };
  }

  // ─── Coupons admin ────────────────────────────────────────────

  @Get("coupons")
  async listCoupons() {
    return this.prisma.discount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { products: true, categories: true, orders: true } } },
    });
  }

  @Post("coupons")
  @AdminOnly()
  async createCoupon(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const c = await this.prisma.discount.create({
      data: {
        code: body.code.toUpperCase(),
        type: body.type,
        value: body.value,
        scope: body.scope ?? "ALL",
        minOrder: body.minOrder ?? 0,
        maxDiscount: body.maxDiscount,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        usageLimit: body.usageLimit,
        usagePerUserLimit: body.usagePerUserLimit ?? 1,
        firstOrderOnly: body.firstOrderOnly ?? false,
        descriptionBn: body.descriptionBn,
        descriptionEn: body.descriptionEn,
        bannerImageUrl: body.bannerImageUrl,
        products: body.productIds?.length
          ? { create: body.productIds.map((productId: string) => ({ productId })) }
          : undefined,
        categories: body.categoryIds?.length
          ? { create: body.categoryIds.map((categoryId: string) => ({ categoryId })) }
          : undefined,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "coupon", entityId: c.id, action: "create", diff: { code: c.code } },
    });
    return c;
  }

  @Patch("coupons/:id")
  async updateCoupon(@Param("id") id: string, @Body() body: any) {
    return this.prisma.discount.update({
      where: { id },
      data: {
        ...(body.value !== undefined && { value: body.value }),
        ...(body.endsAt !== undefined && { endsAt: new Date(body.endsAt) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.usageLimit !== undefined && { usageLimit: body.usageLimit }),
        ...(body.minOrder !== undefined && { minOrder: body.minOrder }),
      },
    });
  }

  // ─── Customers ────────────────────────────────────────────────

  @Get("users")
  async listUsers(@Query() q: { q?: string; page?: number }) {
    const page = q.page ?? 1;
    const perPage = 50;
    const where = q.q ? {
      OR: [
        { phone: { contains: q.q } },
        { name: { contains: q.q, mode: "insensitive" as const } },
        { referralCode: { contains: q.q, mode: "insensitive" as const } },
      ],
    } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, phone: true, name: true, email: true, isBlocked: true,
          referralCode: true, registeredAt: true, createdAt: true,
          _count: { select: { orders: true, referralsMade: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page, perPage: 50, total };
  }

  @Patch("users/:id/block")
  @AdminOnly()
  async blockUser(@Param("id") id: string, @Body() body: { isBlocked: boolean }) {
    return this.prisma.user.update({ where: { id }, data: { isBlocked: body.isBlocked } });
  }

  // ─── Cash settlement ──────────────────────────────────────────

  @Get("cash-settlements")
  async listCashSettlements(@Query() q: { riderId?: string }) {
    const where = q.riderId ? { riderId: q.riderId } : {};
    return this.prisma.cashSettlement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { rider: { select: { name: true } } },
    });
  }

  @Post("cash-settlements")
  @AdminOnly()
  async createSettlement(@Body() body: { riderId: string; periodStart: string; periodEnd: string; expected: number; received: number; notes?: string }, @Req() req: Request) {
    const actorId = (req as any).userId;
    const variance = body.received - body.expected;
    const s = await this.prisma.cashSettlement.create({
      data: {
        riderId: body.riderId,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        expected: body.expected,
        received: body.received,
        variance,
        settledBy: actorId,
        notes: body.notes,
      },
    });
    if (variance === 0) {
      // Reset rider float
      await this.prisma.rider.update({
        where: { id: body.riderId },
        data: { currentFloat: 0 },
      });
    }
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "cash_settlement", entityId: s.id, action: "create", diff: body },
    });
    return s;
  }
}