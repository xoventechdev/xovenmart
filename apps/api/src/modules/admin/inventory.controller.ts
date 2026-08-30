import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { StockMovementReason } from "@prisma/client";

@ApiTags("admin/inventory")
@Controller("admin/inventory")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminInventoryController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List inventory ───────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "List inventory rows with product details. Filter by q (name/sku) and lowStock." })
  async list(
    @Query()
    q: { page?: number; perPage?: number; q?: string; lowStock?: string | boolean },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);

    // Build where filter against Product
    const where: any = {};
    if (q.q) {
      where.product = {
        OR: [
          { nameEn: { contains: q.q, mode: "insensitive" as const } },
          { nameBn: { contains: q.q, mode: "insensitive" as const } },
          { sku: { contains: q.q, mode: "insensitive" as const } },
        ],
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { updatedAt: "desc" },
        include: { product: true },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    // Map to flat shape; productId is the inventory PK
    let items = rows.map((r) => ({
      id: r.productId,
      productId: r.productId,
      sku: r.product.sku,
      slug: r.product.slug,
      nameEn: r.product.nameEn,
      nameBn: r.product.nameBn,
      stockQty: r.stockQty,
      reservedQty: r.reservedQty,
      lowStockThreshold: r.lowStockThreshold,
      updatedAt: r.updatedAt,
    }));

    // lowStock filter happens in JS (Prisma can't compare column-to-column).
    if (String(q.lowStock).toLowerCase() === "true") {
      items = items.filter((it) => it.stockQty <= it.lowStockThreshold);
    }

    return { items, page, perPage, total };
  }

  // ─── Low-stock convenience route ───────────────────────────────

  @Get("low-stock")
  @ApiOperation({ summary: "List low-stock items and their count" })
  async lowStock(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 200, 500);

    const [rows, totalAll] = await Promise.all([
      this.prisma.inventory.findMany({
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { updatedAt: "desc" },
        include: { product: true },
      }),
      this.prisma.inventory.count(),
    ]);

    const items = rows
      .filter((r) => r.stockQty <= r.lowStockThreshold)
      .map((r) => ({
        id: r.productId,
        productId: r.productId,
        sku: r.product.sku,
        slug: r.product.slug,
        nameEn: r.product.nameEn,
        nameBn: r.product.nameBn,
        stockQty: r.stockQty,
        reservedQty: r.reservedQty,
        lowStockThreshold: r.lowStockThreshold,
        updatedAt: r.updatedAt,
      }));

    return { count: items.length, items };
  }

  // ─── Stock movements history ──────────────────────────────────

  @Get("movements")
  @ApiOperation({ summary: "Recent stock movements with product details" })
  async movements(
    @Query() q: { productId?: string; page?: number; perPage?: number },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where: any = {};
    if (q.productId) where.productId = q.productId;

    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: { product: { select: { sku: true, nameEn: true, nameBn: true, slug: true } } },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const items = rows.map((m) => ({
      id: m.id,
      productId: m.productId,
      sku: m.product.sku,
      nameEn: m.product.nameEn,
      nameBn: m.product.nameBn,
      delta: m.delta,
      reason: m.reason,
      refOrderId: m.refOrderId,
      note: m.note,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
    }));

    return { items, page, perPage, total };
  }

  // ─── Adjust stock (delta) ─────────────────────────────────────

  @Post("adjust")
  @AdminOnly()
  @ApiOperation({ summary: "Adjust stock by delta. Writes StockMovement + audit log. ADMIN only." })
  async adjust(
    @Body() body: { productId: string; delta: number; reason: StockMovementReason; note?: string },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    if (!body?.productId || typeof body.delta !== "number" || !body.reason) {
      throw new BadRequestException("productId, delta, and reason are required");
    }
    const allowedReasons = Object.values(StockMovementReason);
    if (!allowedReasons.includes(body.reason)) {
      throw new BadRequestException(`reason must be one of ${allowedReasons.join(", ")}`);
    }

    const inv = await this.prisma.inventory.findUnique({ where: { productId: body.productId } });
    if (!inv) throw new BadRequestException("Inventory row not found for product");

    const before = { stockQty: inv.stockQty, reservedQty: inv.reservedQty };
    const newStock = inv.stockQty + body.delta;
    if (newStock < 0) {
      throw new BadRequestException(`Adjustment would produce negative stock (current ${inv.stockQty}, delta ${body.delta})`);
    }

    const [updated, movement] = await this.prisma.$transaction([
      this.prisma.inventory.update({
        where: { productId: body.productId },
        data: { stockQty: newStock },
      }),
      this.prisma.stockMovement.create({
        data: {
          productId: body.productId,
          delta: body.delta,
          reason: body.reason,
          note: body.note,
          createdBy: actorId,
        },
      }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "inventory",
        entityId: body.productId,
        action: "adjust_stock",
        diff: { before, delta: body.delta, reason: body.reason, note: body.note, after: updated.stockQty },
      },
    });

    return { inventory: updated, movement };
  }

  // ─── Set low-stock threshold ───────────────────────────────────

  @Post("set-threshold")
  @AdminOnly()
  @ApiOperation({ summary: "Set low-stock threshold for a product. ADMIN only." })
  async setThreshold(
    @Body() body: { productId: string; lowStockThreshold: number },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    if (!body?.productId || typeof body.lowStockThreshold !== "number") {
      throw new BadRequestException("productId and lowStockThreshold are required");
    }
    if (body.lowStockThreshold < 0) {
      throw new BadRequestException("lowStockThreshold must be >= 0");
    }

    const before = await this.prisma.inventory.findUnique({ where: { productId: body.productId } });
    if (!before) throw new BadRequestException("Inventory row not found for product");

    const updated = await this.prisma.inventory.update({
      where: { productId: body.productId },
      data: { lowStockThreshold: body.lowStockThreshold },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "inventory",
        entityId: body.productId,
        action: "set_threshold",
        diff: { before: before.lowStockThreshold, after: body.lowStockThreshold },
      },
    });

    return updated;
  }

  // ─── Inventory summary ────────────────────────────────────────

  @Get("summary")
  @ApiOperation({ summary: "Inventory counts and total cost value" })
  async summary() {
    // Column-to-column comparison (stockQty <= lowStockThreshold) and math
    // (stockQty * costPrice) are not supported by Prisma directly, so fetch
    // both tables and reduce in JS.
    const [invRows, products] = await Promise.all([
      this.prisma.inventory.findMany({
        select: { productId: true, stockQty: true, lowStockThreshold: true },
      }),
      this.prisma.product.findMany({
        select: { id: true, costPrice: true },
      }),
    ]);

    const costMap = new Map<string, number>();
    for (const p of products) {
      costMap.set(p.id, Number(p.costPrice));
    }

    const total = invRows.length;
    const lowStock = invRows.filter((r) => r.stockQty <= r.lowStockThreshold).length;
    const outOfStock = invRows.filter((r) => r.stockQty <= 0).length;
    const totalValue = invRows.reduce(
      (acc, r) => acc + r.stockQty * (costMap.get(r.productId) ?? 0),
      0,
    );

    return { total, lowStock, outOfStock, totalValue };
  }
}