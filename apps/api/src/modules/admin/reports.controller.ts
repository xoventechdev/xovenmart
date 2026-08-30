import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * Helper: group rows by day for the last N days, returning an array of
 * {date: 'YYYY-MM-DD', count: N} with zero-filled gaps.
 */
function groupByDay(rows: { createdAt?: Date; placedAt?: Date }[], days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result[d.toISOString().slice(0, 10)] = 0;
  }
  rows.forEach((r) => {
    const when = r.createdAt ?? r.placedAt;
    if (!when) return;
    const key = when.toISOString().slice(0, 10);
    if (key in result) result[key]++;
  });
  return Object.entries(result).map(([date, count]) => ({ date, count }));
}

/** Convert any value to a Number safely (Prisma Decimal returns string or number). */
function num(v: any): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

@ApiTags("admin/reports")
@Controller("admin/reports")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminReportsController {
  constructor(private readonly prisma: PrismaService) {}

  // ════════════════════════════════════════════════════════════════
  // SALES
  // ════════════════════════════════════════════════════════════════

  @Get("sales")
  async salesByDay(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const orders = await this.prisma.order.findMany({
      where: {
        placedAt: { gte: since },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
      select: {
        placedAt: true,
        grandTotal: true,
        items: { select: { qty: true } },
      },
      orderBy: { placedAt: "asc" },
    });

    // Aggregate per day
    const buckets: Record<string, { orders: number; revenue: number; itemsSold: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = { orders: 0, revenue: 0, itemsSold: 0 };
    }

    for (const o of orders) {
      const key = o.placedAt.toISOString().slice(0, 10);
      if (!(key in buckets)) continue;
      buckets[key].orders++;
      buckets[key].revenue += num(o.grandTotal);
      buckets[key].itemsSold += o.items.reduce((s: number, it: { qty: number }) => s + it.qty, 0);
    }

    return Object.entries(buckets).map(([date, v]) => ({
      date,
      orders: v.orders,
      revenue: Number(v.revenue.toFixed(2)),
      itemsSold: v.itemsSold,
    }));
  }

  @Get("sales/summary")
  async salesSummary() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const computeForRange = async (gte: Date, lte: Date) => {
      const orders = await this.prisma.order.findMany({
        where: {
          placedAt: { gte, lte },
          status: { notIn: ["CANCELLED", "REFUNDED"] },
        },
        select: { grandTotal: true },
      });
      const orderCount = orders.length;
      const revenue = orders.reduce((s: number, o: { grandTotal: any }) => s + num(o.grandTotal), 0);
      const aov = orderCount > 0 ? revenue / orderCount : 0;
      return {
        orders: orderCount,
        revenue: Number(revenue.toFixed(2)),
        aov: Number(aov.toFixed(2)),
      };
    };

    const thisMonth = await computeForRange(thisMonthStart, now);
    const lastMonth = await computeForRange(lastMonthStart, lastMonthEnd);

    const pct = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Number((((curr - prev) / prev) * 100).toFixed(2));

    return {
      thisMonth,
      lastMonth,
      growth: {
        orders: pct(thisMonth.orders, lastMonth.orders),
        revenue: pct(thisMonth.revenue, lastMonth.revenue),
      },
    };
  }

  // �═══════════════════════════════════════════════════════════════
  // ORDERS
  // ════════════════════════════════════════════════════════════════

  @Get("orders")
  async ordersReport(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [allOrders, byStatusRows, byMethodRows, dailyRows] = await Promise.all([
      this.prisma.order.findMany({
        where: { placedAt: { gte: since } },
        select: { status: true, paymentMethod: true, placedAt: true },
      }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: { placedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["paymentMethod"],
        where: { placedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { placedAt: { gte: since } },
        select: { placedAt: true },
        orderBy: { placedAt: "asc" },
      }),
    ]);

    // By status
    const byStatus = byStatusRows.map((r: any) => ({
      status: r.status,
      count: r._count._all,
    }));
    const total = allOrders.length;

    // By payment method
    const byPaymentMethod = byMethodRows.map((r: any) => ({
      method: r.paymentMethod,
      count: r._count._all,
    }));

    // Daily (last 14 days window regardless of `days` param? — spec says 14 days)
    const daily = groupByDay(dailyRows, 14).map((d) => ({
      date: d.date,
      orders: d.count,
    }));

    return {
      total,
      byStatus,
      byPaymentMethod,
      daily,
    };
  }

  @Get("orders/cancellation-rate")
  async cancellationRate(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [cancelled, total] = await Promise.all([
      this.prisma.order.count({
        where: { placedAt: { gte: since }, status: "CANCELLED" },
      }),
      this.prisma.order.count({ where: { placedAt: { gte: since } } }),
    ]);

    return {
      cancelled,
      total,
      rate: total === 0 ? 0 : Number(((cancelled / total) * 100).toFixed(2)),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PRODUCTS
  // ════════════════════════════════════════════════════════════════

  @Get("products/top-selling")
  async topSelling(@Query() q: { days?: number; limit?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const limit = Math.min(q.limit ?? 20, 100);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    // Get order items where the order was placed in window and not cancelled/refunded
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          placedAt: { gte: since },
          status: { notIn: ["CANCELLED", "REFUNDED"] },
        },
      },
      select: {
        productId: true,
        qty: true,
        lineTotal: true,
        product: {
          select: { nameEn: true, nameBn: true, sku: true },
        },
      },
    });

    const map = new Map<
      string,
      { productId: string; nameEn: string; nameBn: string; sku: string; qtySold: number; revenue: number }
    >();

    for (const it of items) {
      const existing = map.get(it.productId);
      if (existing) {
        existing.qtySold += it.qty;
        existing.revenue += num(it.lineTotal);
      } else {
        map.set(it.productId, {
          productId: it.productId,
          nameEn: it.product.nameEn,
          nameBn: it.product.nameBn,
          sku: it.product.sku,
          qtySold: it.qty,
          revenue: num(it.lineTotal),
        });
      }
    }

    return Array.from(map.values())
      .sort((a: any, b: any) => b.qtySold - a.qtySold)
      .slice(0, limit)
      .map((r: any) => ({ ...r, revenue: Number(r.revenue.toFixed(2)) }));
  }

  @Get("products/slow-moving")
  async slowMoving(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 60, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    // Find product IDs that had any order item in window
    const sold = await this.prisma.orderItem.findMany({
      where: { order: { placedAt: { gte: since } } },
      select: { productId: true },
    });
    const soldSet = new Set(sold.map((s: { productId: string }) => s.productId));

    // Find the last sale per product that ever had a sale (for the lastSoldAt hint)
    // For active products not in soldSet, we want to know if they EVER sold.
    // For simplicity we fetch the most recent orderItem.createdAt per candidate.
    const candidates = await this.prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: Array.from(soldSet) },
      },
      select: {
        id: true,
        nameEn: true,
        nameBn: true,
        sku: true,
        inventory: { select: { stockQty: true } },
        orderItems: {
          orderBy: { order: { placedAt: "desc" } },
          take: 1,
          select: { order: { select: { placedAt: true } } },
        },
      },
    });

    return candidates
      .map((p: any) => ({
        productId: p.id,
        nameEn: p.nameEn,
        nameBn: p.nameBn,
        sku: p.sku,
        lastSoldAt: p.orderItems[0]?.order.placedAt ?? null,
        stockQty: p.inventory?.stockQty ?? 0,
      }))
      .sort((a: any, b: any) => (b.lastSoldAt?.getTime() ?? 0) - (a.lastSoldAt?.getTime() ?? 0));
  }

  @Get("products/inventory-value")
  async inventoryValue() {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        nameEn: true,
        nameBn: true,
        salePrice: true,
        costPrice: true,
        inventory: { select: { stockQty: true } },
      },
    });

    let totalCost = 0;
    let totalSale = 0;
    let totalUnits = 0;

    const items = rows.map((p: any) => {
      const qty = p.inventory?.stockQty ?? 0;
      const cost = num(p.costPrice) * qty;
      const sale = num(p.salePrice) * qty;
      totalCost += cost;
      totalSale += sale;
      totalUnits += qty;
      return {
        productId: p.id,
        sku: p.sku,
        nameEn: p.nameEn,
        nameBn: p.nameBn,
        stockQty: qty,
        costValue: Number(cost.toFixed(2)),
        saleValue: Number(sale.toFixed(2)),
      };
    });

    return {
      totalCost: Number(totalCost.toFixed(2)),
      totalSale: Number(totalSale.toFixed(2)),
      potentialProfit: Number((totalSale - totalCost).toFixed(2)),
      totalUnits,
      items: items.sort((a: any, b: any) => b.saleValue - a.saleValue),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ════════════════════════════════════════════════════════════════

  @Get("customers/new")
  async newCustomers(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });

    return groupByDay(users, days);
  }

  @Get("customers/top")
  async topCustomers(@Query() q: { days?: number; limit?: number }) {
    const days = Math.min(q.days ?? 90, 365);
    const limit = Math.min(q.limit ?? 20, 100);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const orders = await this.prisma.order.findMany({
      where: {
        placedAt: { gte: since },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
        userId: { not: null },
      },
      select: { userId: true, grandTotal: true },
    });

    const map = new Map<string, { userId: string; orders: number; spent: number }>();
    for (const o of orders) {
      if (!o.userId) continue;
      const existing = map.get(o.userId);
      if (existing) {
        existing.orders++;
        existing.spent += num(o.grandTotal);
      } else {
        map.set(o.userId, { userId: o.userId, orders: 1, spent: num(o.grandTotal) });
      }
    }

    const userIds = Array.from(map.keys());
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, phone: true, email: true },
    });
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    return Array.from(map.values())
      .sort((a: any, b: any) => b.spent - a.spent)
      .slice(0, limit)
      .map((r: any) => ({
        ...r,
        spent: Number(r.spent.toFixed(2)),
        user: userMap.get(r.userId) ?? null,
      }));
  }

  @Get("customers/lifetime-value")
  async lifetimeValue() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { notIn: ["CANCELLED", "REFUNDED"] },
        userId: { not: null },
      },
      select: { userId: true, grandTotal: true },
    });

    const totals = new Map<string, number>();
    for (const o of orders) {
      if (!o.userId) continue;
      totals.set(o.userId, (totals.get(o.userId) ?? 0) + num(o.grandTotal));
    }

    const values = Array.from(totals.values()).sort((a: number, b: number) => a - b);
    if (values.length === 0) {
      return { avg: 0, median: 0, top10PctThreshold: 0, sampleSize: 0 };
    }

    const sum = values.reduce((s: number, v: number) => s + v, 0);
    const avg = sum / values.length;

    const median =
      values.length % 2 === 1
        ? values[Math.floor(values.length / 2)]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;

    // top 10% threshold: value at the 90th percentile
    const idx = Math.max(0, Math.floor(values.length * 0.9) - 1);
    const top10PctThreshold = values[idx];

    return {
      avg: Number(avg.toFixed(2)),
      median: Number(median.toFixed(2)),
      top10PctThreshold: Number(top10PctThreshold.toFixed(2)),
      sampleSize: values.length,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // RIDERS
  // ════════════════════════════════════════════════════════════════

  @Get("riders/performance")
  async riderPerformance(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const riders = await this.prisma.rider.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const deliveries = await this.prisma.delivery.findMany({
      where: { assignedAt: { gte: since }, riderId: { not: null } },
      select: {
        riderId: true,
        proofStatus: true,
        pickedAt: true,
        deliveredAt: true,
        cashCollected: true,
      },
    });

    const map = new Map<
      string,
      { total: number; success: number; totalTimeMins: number; timeCount: number; cash: number }
    >();
    for (const d of deliveries) {
      if (!d.riderId) continue;
      const r = map.get(d.riderId) ?? { total: 0, success: 0, totalTimeMins: 0, timeCount: 0, cash: 0 };
      r.total++;
      if (d.proofStatus === "DELIVERED") r.success++;
      if (d.pickedAt && d.deliveredAt) {
        r.totalTimeMins += (d.deliveredAt.getTime() - d.pickedAt.getTime()) / 60000;
        r.timeCount++;
      }
      r.cash += num(d.cashCollected);
      map.set(d.riderId, r);
    }

    return riders
      .map((r: any) => {
        const s = map.get(r.id);
        const total = s?.total ?? 0;
        const success = s?.success ?? 0;
        const avgTime = s && s.timeCount > 0 ? s.totalTimeMins / s.timeCount : 0;
        return {
          riderId: r.id,
          name: r.name,
          totalDeliveries: total,
          successRate: total === 0 ? 0 : Number(((success / total) * 100).toFixed(2)),
          avgDeliveryTime: Number(avgTime.toFixed(2)),
          cashCollected: Number((s?.cash ?? 0).toFixed(2)),
        };
      })
      .sort((a: any, b: any) => b.totalDeliveries - a.totalDeliveries);
  }

  @Get("riders/cash")
  async riderCashOutstanding() {
    const rows = await this.prisma.rider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, currentFloat: true },
    });

    const total = rows.reduce((s: number, r: { currentFloat: any }) => s + num(r.currentFloat), 0);
    return {
      total: Number(total.toFixed(2)),
      riders: rows
        .map((r: any) => ({
          riderId: r.id,
          name: r.name,
          currentFloat: Number(num(r.currentFloat).toFixed(2)),
        }))
        .sort((a: any, b: any) => b.currentFloat - a.currentFloat),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PAYMENTS
  // ════════════════════════════════════════════════════════════════

  @Get("payments/methods")
  async paymentMethods(@Query() q: { days?: number }) {
    const days = Math.min(q.days ?? 30, 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.order.groupBy({
      by: ["paymentMethod"],
      where: {
        placedAt: { gte: since },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
    });

    const total = rows.reduce((s: number, r: any) => s + r._count._all, 0);

    return rows
      .map((r: any) => ({
        method: r.paymentMethod,
        count: r._count._all,
        amount: Number(num(r._sum.grandTotal).toFixed(2)),
        share: total === 0 ? 0 : Number(((r._count._all / total) * 100).toFixed(2)),
      }))
      .sort((a: any, b: any) => b.count - a.count);
  }

  @Get("payments/pending")
  async pendingPayments() {
    const rows = await this.prisma.payment.findMany({
      where: { status: "PENDING" },
      select: { amount: true },
    });

    const total = rows.reduce((s: number, r: { amount: any }) => s + num(r.amount), 0);
    return {
      count: rows.length,
      totalAmount: Number(total.toFixed(2)),
    };
  }

  @Get("payments/cod-outstanding")
  async codOutstanding() {
    const rows = await this.prisma.order.findMany({
      where: {
        paymentMethod: "COD",
        status: { in: ["OUT_FOR_DELIVERY", "DELIVERED", "PREPARED", "PREPARING", "ACCEPTED"] },
        paymentStatus: { in: ["PENDING"] },
      },
      select: { grandTotal: true },
    });

    const total = rows.reduce((s: number, r: { grandTotal: any }) => s + num(r.grandTotal), 0);
    return {
      count: rows.length,
      totalAmount: Number(total.toFixed(2)),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // OTHER
  // ════════════════════════════════════════════════════════════════

  @Get("low-stock")
  async lowStock(@Query() q: { threshold?: number }) {
    const inventoryRows = await this.prisma.inventory.findMany({
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            nameEn: true,
            nameBn: true,
            salePrice: true,
            isActive: true,
            category: { select: { nameEn: true } },
          },
        },
      },
    });

    const threshold = q.threshold; // if provided, use it; else rely on per-product lowStockThreshold
    const filtered = inventoryRows
      .filter((r: any) => {
        const limit = threshold ?? r.lowStockThreshold;
        return r.stockQty <= limit && r.product.isActive;
      })
      .map((r: any) => ({
        productId: r.productId,
        sku: r.product.sku,
        nameEn: r.product.nameEn,
        nameBn: r.product.nameBn,
        category: r.product.category?.nameEn ?? null,
        stockQty: r.stockQty,
        lowStockThreshold: r.lowStockThreshold,
        reorderQty: Math.max(r.lowStockThreshold * 3 - r.stockQty, 0),
        salePrice: Number(num(r.product.salePrice).toFixed(2)),
      }))
      .sort((a: any, b: any) => a.stockQty - b.stockQty);

    return filtered;
  }

  @Get("referrals")
  async referralsFunnel() {
    const [invited, registered, ordered, rewarded] = await Promise.all([
      this.prisma.referral.count(),
      this.prisma.referral.count({ where: { status: { in: ["PENDING", "QUALIFIED", "REWARDED"] } } }),
      this.prisma.referral.count({ where: { status: { in: ["QUALIFIED", "REWARDED"] } } }),
      this.prisma.referral.count({ where: { status: "REWARDED" } }),
    ]);

    const pct = (n: number, d: number) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(2)));

    return {
      invited,
      registered,
      ordered,
      rewarded,
      conversion: {
        invitedToRegistered: pct(registered, invited),
        registeredToOrdered: pct(ordered, registered),
        orderedToRewarded: pct(rewarded, ordered),
      },
    };
  }
}
