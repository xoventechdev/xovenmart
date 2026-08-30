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
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { CatalogService } from "../catalog/catalog.service";

@ApiTags("admin/delivery-zones")
@Controller("admin/delivery-zones")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminDeliveryZonesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Normalize a DB zone into a JSON-safe plain object with numbers coerced.
   * Shared between list / getOne / create / update so the API contract is
   * stable.
   */
  private serializeZone(z: any) {
    return {
      id: z.id,
      nameBn: z.nameBn,
      nameEn: z.nameEn,
      centerLat: Number(z.centerLat),
      centerLng: Number(z.centerLng),
      radiusKm: Number(z.radiusKm),
      baseKm: Number(z.baseKm),
      baseFee: Number(z.baseFee),
      perKmFee: Number(z.perKmFee),
      perKgFee: Number(z.perKgFee),
      heavyKgThreshold: z.heavyKgThreshold != null ? Number(z.heavyKgThreshold) : null,
      heavyKgFee: z.heavyKgFee != null ? Number(z.heavyKgFee) : null,
      freeAbove: z.freeAbove != null ? Number(z.freeAbove) : null,
      isActive: z.isActive,
      sortOrder: z.sortOrder,
      createdAt: z.createdAt,
      updatedAt: z.updatedAt,
    };
  }

  private validateBody(body: any, partial = false) {
    if (!partial) {
      if (!body.nameEn || !body.nameBn) {
        throw new BadRequestException("nameBn and nameEn are required");
      }
      if (
        body.centerLat == null ||
        body.centerLng == null ||
        body.radiusKm == null ||
        body.baseKm == null ||
        body.baseFee == null ||
        body.perKmFee == null
      ) {
        throw new BadRequestException(
          "centerLat, centerLng, radiusKm, baseKm, baseFee and perKmFee are required",
        );
      }
    }
    if (
      body.centerLat != null &&
      (Number(body.centerLat) < -90 || Number(body.centerLat) > 90)
    ) {
      throw new BadRequestException("centerLat must be between -90 and 90");
    }
    if (
      body.centerLng != null &&
      (Number(body.centerLng) < -180 || Number(body.centerLng) > 180)
    ) {
      throw new BadRequestException("centerLng must be between -180 and 180");
    }
    if (body.radiusKm != null && Number(body.radiusKm) <= 0) {
      throw new BadRequestException("radiusKm must be > 0");
    }
    if (body.baseKm != null && Number(body.baseKm) < 0) {
      throw new BadRequestException("baseKm must be >= 0");
    }
    if (body.baseFee != null && Number(body.baseFee) < 0) {
      throw new BadRequestException("baseFee must be >= 0");
    }
    if (body.perKmFee != null && Number(body.perKmFee) < 0) {
      throw new BadRequestException("perKmFee must be >= 0");
    }
    if (body.perKgFee != null && Number(body.perKgFee) < 0) {
      throw new BadRequestException("perKgFee must be >= 0");
    }
    if (body.heavyKgThreshold != null && Number(body.heavyKgThreshold) <= 0) {
      throw new BadRequestException("heavyKgThreshold must be > 0");
    }
    if (body.heavyKgFee != null && Number(body.heavyKgFee) < 0) {
      throw new BadRequestException("heavyKgFee must be >= 0");
    }
    if (body.heavyKgThreshold != null && body.heavyKgFee == null) {
      throw new BadRequestException("heavyKgFee is required when heavyKgThreshold is set");
    }
    if (body.heavyKgFee != null && body.heavyKgThreshold == null) {
      throw new BadRequestException("heavyKgThreshold is required when heavyKgFee is set");
    }
  }

  /**
   * GET /admin/delivery-zones
   * List all zones (active + inactive) ordered by sortOrder, then radius.
   */
  @Get()
  async list() {
    const zones = await this.prisma.deliveryZone.findMany({
      orderBy: [{ sortOrder: "asc" }, { radiusKm: "asc" }],
    });
    return zones.map((z) => this.serializeZone(z));
  }

  /**
   * GET /admin/delivery-zones/:id
   * Single zone detail.
   */
  @Get(":id")
  async getOne(@Param("id") id: string) {
    const z = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!z) throw new NotFoundException("Delivery zone not found");
    return this.serializeZone(z);
  }

  /**
   * POST /admin/delivery-zones
   * Create a new zone. Admin only.
   */
  @Post()
  @AdminOnly()
  async create(@Body() body: any, @Req() req: Request) {
    this.validateBody(body);
    const actorId = (req as any).userId;
    const z = await this.prisma.deliveryZone.create({
      data: {
        nameBn: body.nameBn,
        nameEn: body.nameEn,
        centerLat: body.centerLat,
        centerLng: body.centerLng,
        radiusKm: body.radiusKm,
        baseKm: body.baseKm,
        baseFee: body.baseFee,
        perKmFee: body.perKmFee,
        perKgFee: body.perKgFee ?? 0,
        heavyKgThreshold: body.heavyKgThreshold ?? null,
        heavyKgFee: body.heavyKgFee ?? null,
        freeAbove: body.freeAbove ?? null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "delivery_zone", entityId: z.id, action: "create", diff: { nameEn: z.nameEn } },
    });
    return this.serializeZone(z);
  }

  /**
   * PATCH /admin/delivery-zones/:id
   * Update a zone.
   */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    this.validateBody(body, true);
    const actorId = (req as any).userId;
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Delivery zone not found");

    const data: any = {};
    const fields: (keyof typeof body)[] = [
      "nameBn", "nameEn", "centerLat", "centerLng", "radiusKm",
      "baseKm", "baseFee", "perKmFee", "perKgFee",
      "heavyKgThreshold", "heavyKgFee", "freeAbove",
      "sortOrder", "isActive",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }

    const updated = await this.prisma.deliveryZone.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "delivery_zone", entityId: id, action: "update", diff: body },
    });
    return this.serializeZone(updated);
  }

  /**
   * DELETE /admin/delivery-zones/:id
   * Soft delete: set isActive=false. Allowed for both ADMIN and MANAGER so a
   * delivery/logistics manager can retire outdated zones without escalating.
   */
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Delivery zone not found");
    await this.prisma.deliveryZone.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "delivery_zone", entityId: id, action: "soft_delete" },
    });
    return { ok: true };
  }

  /**
   * POST /admin/delivery-zones/recalculate-fees
   * Recomputes the deliveryFee for every PENDING order based on the current
   * zone config and the order's address + cart weights. Useful after a
   * zone pricing change.
   */
  @Post("recalculate-fees")
  @AdminOnly()
  async recalculateFees(@Req() req: Request) {
    const actorId = (req as any).userId;
    const pendingOrders = await this.prisma.order.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED", "PREPARING", "PREPARED"] } },
      include: { items: true },
    });
    let updated = 0;
    for (const o of pendingOrders) {
      const addr: any = o.addressSnapshot;
      if (!addr?.lat || !addr?.lng) continue;
      const items = o.items.map((it: any) => ({
        qty: it.qty,
        weightGrams: it.weightGramsSnapshot ?? 1000,
      }));
      const r = await this.catalog.calcDeliveryFee(
        Number(addr.lat),
        Number(addr.lng),
        Number(o.subtotal),
        items,
      );
      if (r.outsideAllZones) continue;
      const newFee = r.deliveryFee;
      if (newFee !== Number(o.deliveryFee)) {
        const newGrand = Number(o.subtotal) - Number(o.discountTotal) + newFee;
        await this.prisma.order.update({
          where: { id: o.id },
          data: {
            deliveryFee: newFee,
            grandTotal: newGrand,
          },
        });
        updated++;
      }
    }
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "delivery_zone", entityId: "ALL", action: "recalculate_fees", diff: { updated } },
    });
    return { ok: true, updated };
  }
}
