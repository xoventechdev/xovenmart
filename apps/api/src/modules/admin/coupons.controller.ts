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
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/coupons")
@Controller("admin/coupons")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminCouponsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /admin/coupons
   * Alias for /all (so the smoke test and the basic admin list path both work).
   */
  @Get()
  async listBasic() {
    return this.listAll();
  }

  /**
   * GET /admin/coupons/all
   * Full list of coupons with product/category/order counts and aggregate
   * discount given across all orders that used the coupon.
   */
  @Get("all")
  async listAll() {
    const [coupons, aggregate] = await Promise.all([
      this.prisma.discount.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          products: { select: { productId: true } },
          categories: { select: { categoryId: true } },
          _count: { select: { products: true, categories: true, orders: true } },
        },
      }),
      this.prisma.order.groupBy({
        by: ["couponId"],
        where: { couponId: { not: null } },
        _sum: { discountTotal: true },
        _count: true,
      }),
    ]);

    const discountByCoupon = new Map(
      aggregate
        .filter((a: { couponId: string | null }) => a.couponId)
        .map((a: { couponId: string; _sum: { discountTotal: any }; _count: number }) => [a.couponId as string, { discountTotal: Number(a._sum.discountTotal ?? 0), orders: a._count }])
    );

    return coupons.map((c: any) => ({
      ...c,
      value: Number(c.value),
      minOrder: Number(c.minOrder),
      maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
      centerLat: null,
      discountGiven: discountByCoupon.get(c.id)?.discountTotal ?? 0,
      ordersWithCoupon: discountByCoupon.get(c.id)?.orders ?? c._count.orders,
    }));
  }

  /**
   * GET /admin/coupons/active
   * Coupons that are currently active: isActive=true, within date range,
   * not over usage limit. (Field-to-field compare done in JS because Prisma
   * doesn't support column-to-column comparisons in `where`.)
   */
  @Get("active")
  async listActive() {
    const now = new Date();
    const all = await this.prisma.discount.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: "asc" },
    });
    const filtered = all.filter((c: { usageLimit: number | null; usedCount: number }) => c.usageLimit == null || c.usedCount < c.usageLimit);
    return filtered.map((c: any) => ({
      ...c,
      value: Number(c.value),
      minOrder: Number(c.minOrder),
      maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
    }));
  }

  /**
   * GET /admin/coupons/:id/redemptions
   * Orders that used this coupon — customer name/phone, order date, discount applied.
   */
  @Get(":id/redemptions")
  async getRedemptions(@Param("id") id: string) {
    const coupon = await this.prisma.discount.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException("Coupon not found");

    const orders = await this.prisma.order.findMany({
      where: { couponId: id },
      orderBy: { placedAt: "desc" },
      include: {
        user: { select: { name: true, phone: true } },
      },
    });

    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
      },
      orders: orders.map((o: any) => ({
        id: o.id,
        orderNo: o.orderNo,
        placedAt: o.placedAt,
        status: o.status,
        customerName: o.user?.name ?? o.guestName ?? "Guest",
        customerPhone: o.user?.phone ?? o.guestPhone ?? null,
        orderTotal: Number(o.grandTotal),
        discountApplied: Number(o.discountTotal),
      })),
      totals: {
        redemptions: orders.length,
        totalDiscount: orders.reduce((s: number, o: any) => s + Number(o.discountTotal), 0),
      },
    };
  }

  /**
   * GET /admin/coupons/redemptions
   * Aggregated redemption history across all (or one) coupons.
   * Query: ?couponId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&perPage=50
   */
  @Get("redemptions/aggregated")
  async getRedemptionsAggregated(@Query() q: { couponId?: string; from?: string; to?: string; page?: string; perPage?: string }) {
    const where: any = { couponId: { not: null } };
    if (q.couponId) where.couponId = q.couponId;
    if (q.from || q.to) {
      where.placedAt = {};
      if (q.from) where.placedAt.gte = new Date(q.from);
      if (q.to) where.placedAt.lte = new Date(q.to);
    }
    const page = q.page ? parseInt(q.page, 10) : 1;
    const perPage = Math.min(q.perPage ? parseInt(q.perPage, 10) : 50, 200);

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { placedAt: "desc" },
        include: {
          user: { select: { name: true, phone: true } },
          coupon: { select: { id: true, code: true, type: true, value: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((o: any) => ({
        id: o.id,
        orderNo: o.orderNo,
        placedAt: o.placedAt,
        status: o.status,
        customerName: o.user?.name ?? o.guestName ?? "Guest",
        customerPhone: o.user?.phone ?? o.guestPhone ?? null,
        orderTotal: Number(o.grandTotal),
        discountApplied: Number(o.discountTotal),
        coupon: o.coupon
          ? {
              id: o.coupon.id,
              code: o.coupon.code,
              type: o.coupon.type,
              value: Number(o.coupon.value),
            }
          : null,
      })),
      page,
      perPage,
      total,
    };
  }

  /**
   * POST /admin/coupons/create
   * Create a coupon with full fields. Admin only.
   */
  @Post("create")
  @AdminOnly()
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const code = (body.code ?? "").toString().toUpperCase().trim();
    if (!code) throw new BadRequestException("Coupon code is required");

    const existing = await this.prisma.discount.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`Coupon code "${code}" already exists`);

    if (!body.startsAt || !body.endsAt) {
      throw new BadRequestException("startsAt and endsAt are required");
    }
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException("Invalid startsAt / endsAt");
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException("endsAt must be after startsAt");
    }

    const productIds: string[] = Array.isArray(body.productIds) ? body.productIds : [];
    const categoryIds: string[] = Array.isArray(body.categoryIds) ? body.categoryIds : [];
    const scope = body.scope ?? "ALL";
    if (scope === "SPECIFIC_PRODUCTS" && productIds.length === 0) {
      throw new BadRequestException("scope=SPECIFIC_PRODUCTS requires at least one productId");
    }
    if (scope === "SPECIFIC_CATEGORIES" && categoryIds.length === 0) {
      throw new BadRequestException("scope=SPECIFIC_CATEGORIES requires at least one categoryId");
    }

    const c = await this.prisma.discount.create({
      data: {
        code,
        type: body.type,
        value: body.value,
        scope,
        minOrder: body.minOrder ?? 0,
        maxDiscount: body.maxDiscount ?? null,
        startsAt,
        endsAt,
        usageLimit: body.usageLimit ?? null,
        usagePerUserLimit: body.usagePerUserLimit ?? 1,
        firstOrderOnly: body.firstOrderOnly ?? false,
        descriptionBn: body.descriptionBn ?? null,
        descriptionEn: body.descriptionEn ?? null,
        bannerImageUrl: body.bannerImageUrl ?? null,
        products: productIds.length
          ? { create: productIds.map((productId) => ({ productId })) }
          : undefined,
        categories: categoryIds.length
          ? { create: categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "coupon", entityId: c.id, action: "create", diff: { code: c.code } },
    });

    return c;
  }

  /**
   * PATCH /admin/coupons/:id
   * Alias for /update/:id — both paths update the same coupon.
   * Body: any subset of { code, type, value, scope, minOrder, maxDiscount,
   *                       startsAt, endsAt, usageLimit, usagePerUserLimit,
   *                       firstOrderOnly, isActive, descriptionBn, descriptionEn,
   *                       bannerImageUrl, productIds, categoryIds }.
   */
  @Patch(":id")
  async updateAlias(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    return this.update(id, body, req);
  }

  /**
   * PATCH /admin/coupons/update/:id
   * Full update including scope/products/categories.
   */
  @Patch("update/:id")
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.discount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Coupon not found");

    const data: any = {};
    if (body.code !== undefined) {
      const code = body.code.toString().toUpperCase().trim();
      if (code !== existing.code) {
        const clash = await this.prisma.discount.findUnique({ where: { code } });
        if (clash) throw new BadRequestException(`Coupon code "${code}" already exists`);
      }
      data.code = code;
    }
    if (body.type !== undefined) data.type = body.type;
    if (body.value !== undefined) data.value = body.value;
    if (body.scope !== undefined) data.scope = body.scope;
    if (body.minOrder !== undefined) data.minOrder = body.minOrder;
    if (body.maxDiscount !== undefined) data.maxDiscount = body.maxDiscount;
    if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt);
    if (body.endsAt !== undefined) data.endsAt = new Date(body.endsAt);
    if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit;
    if (body.usagePerUserLimit !== undefined) data.usagePerUserLimit = body.usagePerUserLimit;
    if (body.firstOrderOnly !== undefined) data.firstOrderOnly = body.firstOrderOnly;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.descriptionBn !== undefined) data.descriptionBn = body.descriptionBn;
    if (body.descriptionEn !== undefined) data.descriptionEn = body.descriptionEn;
    if (body.bannerImageUrl !== undefined) data.bannerImageUrl = body.bannerImageUrl;

    // Replace product/category associations when scope/IDs are passed
    const productIds: string[] | undefined = Array.isArray(body.productIds) ? body.productIds : undefined;
    const categoryIds: string[] | undefined = Array.isArray(body.categoryIds) ? body.categoryIds : undefined;

    if (productIds !== undefined || categoryIds !== undefined) {
      if (productIds !== undefined) {
        await this.prisma.discountProduct.deleteMany({ where: { discountId: id } });
        if (productIds.length) {
          await this.prisma.discountProduct.createMany({
            data: productIds.map((productId) => ({ discountId: id, productId })),
          });
        }
      }
      if (categoryIds !== undefined) {
        await this.prisma.discountCategory.deleteMany({ where: { discountId: id } });
        if (categoryIds.length) {
          await this.prisma.discountCategory.createMany({
            data: categoryIds.map((categoryId) => ({ discountId: id, categoryId })),
          });
        }
      }
    }

    const updated = await this.prisma.discount.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "coupon", entityId: id, action: "update", diff: body },
    });

    return updated;
  }

  /**
   * DELETE /admin/coupons/:id
   * Soft delete: set isActive=false. Admin only.
   */
  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.discount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Coupon not found");
    await this.prisma.discount.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "coupon", entityId: id, action: "soft_delete" },
    });
    return { ok: true };
  }

  /**
   * POST /admin/coupons/:id/duplicate
   * Clone an existing coupon with a new code (suffix `-COPY`, then `-COPY-2`, etc.).
   * Admin only.
   */
  @Post(":id/duplicate")
  @AdminOnly()
  async duplicate(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const src = await this.prisma.discount.findUnique({
      where: { id },
      include: { products: true, categories: true },
    });
    if (!src) throw new NotFoundException("Coupon not found");

    // Generate a unique code
    const baseCode = `${src.code}-COPY`;
    let candidate = baseCode;
    for (let i = 2; i < 50; i++) {
      const exists = await this.prisma.discount.findUnique({ where: { code: candidate } });
      if (!exists) break;
      candidate = `${baseCode}-${i}`;
      if (i === 49) throw new BadRequestException("Could not generate unique copy code");
    }

    const clone = await this.prisma.discount.create({
      data: {
        code: candidate,
        type: src.type,
        value: src.value,
        scope: src.scope,
        minOrder: src.minOrder,
        maxDiscount: src.maxDiscount,
        startsAt: src.startsAt,
        endsAt: src.endsAt,
        usageLimit: src.usageLimit,
        usagePerUserLimit: src.usagePerUserLimit,
        firstOrderOnly: src.firstOrderOnly,
        descriptionBn: src.descriptionBn,
        descriptionEn: src.descriptionEn,
        bannerImageUrl: src.bannerImageUrl,
        products: src.products.length
          ? { create: src.products.map((p: { productId: string }) => ({ productId: p.productId })) }
          : undefined,
        categories: src.categories.length
          ? { create: src.categories.map((c: { categoryId: string }) => ({ categoryId: c.categoryId })) }
          : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "coupon", entityId: clone.id, action: "duplicate", diff: { from: src.id, code: clone.code } },
    });

    return clone;
  }
}
