import {
  BadRequestException,
  Body,
  ConflictException,
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
import {
  AdminOnly,
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * Admin-only Supplier / Vendor management.
 *
 * Tracks local vendors that supply products for each order line so the
 * admin can:
 *   - Identify dependable / undependable vendors
 *   - Handle product returns (which vendor did this product come from)
 *   - Process warranty claims (vendor contact on file)
 *   - Do market research on which vendors stock what
 *
 * Customers / riders never see any of this data.
 */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

@ApiTags("admin/suppliers")
@Controller("admin/suppliers")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminSuppliersController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Lightweight lookup for dropdowns ─────────────────────────

  @Get("lookup")
  @ApiOperation({ summary: "Lightweight list of active suppliers for dropdowns" })
  async lookup() {
    const rows = await this.prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
      select: { id: true, slug: true, nameBn: true, nameEn: true },
      take: 500,
    });
    return rows;
  }

  // ─── Paginated list with search + filter ──────────────────────

  @Get()
  @ApiOperation({
    summary: "List suppliers with search, active filter, pagination",
  })
  async list(
    @Query() q: { q?: string; isActive?: string; page?: string; perPage?: string },
  ) {
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(q.perPage ?? "50", 10) || 50));
    const where: any = {};
    if (q.isActive === "true") where.isActive = true;
    else if (q.isActive === "false") where.isActive = false;

    if (q.q && q.q.trim()) {
      const term = q.q.trim();
      where.OR = [
        { nameBn: { contains: term, mode: "insensitive" as const } },
        { nameEn: { contains: term, mode: "insensitive" as const } },
        { contactName: { contains: term, mode: "insensitive" as const } },
        { phone: { contains: term } },
        { email: { contains: term, mode: "insensitive" as const } },
        { area: { contains: term, mode: "insensitive" as const } },
        { slug: { contains: term, mode: "insensitive" as const } },
      ];
    }

    const [items, total, activeCount] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { nameEn: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          _count: {
            select: {
              productLinks: true,
              itemLinks: true,
            },
          },
        },
      }),
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.count({ where: { isActive: true } }),
    ]);

    return { items, page, perPage, total, activeCount };
  }

  @Get(":id")
  @ApiOperation({ summary: "Supplier detail + recent order-item links + linked products" })
  async detail(@Param("id") id: string) {
    const s = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        productLinks: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                slug: true,
                nameBn: true,
                nameEn: true,
                isActive: true,
                category: { select: { nameEn: true, nameBn: true } },
              },
            },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
        itemLinks: {
          orderBy: { recordedAt: "desc" },
          take: 50,
          include: {
            orderItem: {
              select: {
                id: true,
                qty: true,
                unitPrice: true,
                lineTotal: true,
                productId: true,
                nameSnapshot: true,
                order: {
                  select: {
                    id: true,
                    orderNo: true,
                    status: true,
                    placedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!s) throw new NotFoundException("Supplier not found");
    return s;
  }

  // ─── Create ───────────────────────────────────────────────────

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: "Create supplier (admin only)" })
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    if (!body?.nameEn?.trim() || !body?.nameBn?.trim()) {
      throw new BadRequestException("nameEn and nameBn are required");
    }
    const slug = (body.slug?.trim() || slugify(body.nameEn)).slice(0, 80);

    const existing = await this.prisma.supplier.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Supplier with slug "${slug}" already exists`);
    }

    const s = await this.prisma.supplier.create({
      data: {
        slug,
        nameBn: body.nameBn.trim(),
        nameEn: body.nameEn.trim(),
        contactName: body.contactName?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim()?.toLowerCase() || null,
        addressBn: body.addressBn?.trim() || null,
        addressEn: body.addressEn?.trim() || null,
        area: body.area?.trim() || null,
        notesBn: body.notesBn?.trim() || null,
        notesEn: body.notesEn?.trim() || null,
        rating: clampRating(body.rating ?? 3),
        sortOrder: clampInt(body.sortOrder ?? 0),
        isActive: body.isActive ?? true,
      },
    });
    await this.audit(actorId, s.id, "create", { after: body });
    return s;
  }

  // ─── Update ───────────────────────────────────────────────────

  @Patch(":id")
  @ApiOperation({ summary: "Partial update (admin or manager)" })
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Supplier not found");

    const data: any = {};
    if (body.nameBn !== undefined) data.nameBn = body.nameBn?.trim();
    if (body.nameEn !== undefined) data.nameEn = body.nameEn?.trim();
    if (body.contactName !== undefined) data.contactName = body.contactName?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.email !== undefined) data.email = body.email?.trim()?.toLowerCase() || null;
    if (body.addressBn !== undefined) data.addressBn = body.addressBn?.trim() || null;
    if (body.addressEn !== undefined) data.addressEn = body.addressEn?.trim() || null;
    if (body.area !== undefined) data.area = body.area?.trim() || null;
    if (body.notesBn !== undefined) data.notesBn = body.notesBn?.trim() || null;
    if (body.notesEn !== undefined) data.notesEn = body.notesEn?.trim() || null;
    if (body.rating !== undefined) data.rating = clampRating(body.rating);
    if (body.sortOrder !== undefined) data.sortOrder = clampInt(body.sortOrder);
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const after = await this.prisma.supplier.update({ where: { id }, data });
    await this.audit(actorId, id, "update", { before, after: data });
    return after;
  }

  // ─── Activate / deactivate (admin only) ───────────────────────

  @Patch(":id/activate")
  @AdminOnly()
  async activate(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const after = await this.prisma.supplier.update({
      where: { id },
      data: { isActive: true },
    });
    await this.audit(actorId, id, "activate", { after });
    return after;
  }

  @Patch(":id/deactivate")
  @AdminOnly()
  async deactivate(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const after = await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit(actorId, id, "deactivate", { after });
    return after;
  }

  // ─── Soft delete (admin only) ─────────────────────────────────

  @Delete(":id")
  @AdminOnly()
  @ApiOperation({
    summary: "Soft-delete supplier (admin only). Refuses if order-item links exist.",
  })
  async softDelete(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const linkCount = await this.prisma.orderItemSupplier.count({ where: { supplierId: id } });
    if (linkCount > 0) {
      // Surface a few sample order numbers so admin knows what to fix first
      const samples = await this.prisma.orderItemSupplier.findMany({
        where: { supplierId: id },
        take: 5,
        include: { orderItem: { select: { order: { select: { orderNo: true } } } } },
        orderBy: { recordedAt: "desc" },
      });
      const orderNos = Array.from(
        new Set(samples.map((s) => s.orderItem?.order?.orderNo).filter(Boolean)),
      );
      throw new ConflictException({
        message: `Supplier has ${linkCount} order-item link(s); remove or reassign before deleting.`,
        orderNos,
        linkCount,
      });
    }

    // Also refuse if there are product links — keep the supplier as
    // isActive=false instead so admins can reactivate later without losing
    // the supplier-product relationship.
    const productLinkCount = await this.prisma.supplierProduct.count({ where: { supplierId: id } });
    if (productLinkCount > 0) {
      // Just deactivate — never hard-delete a supplier that has product links.
      const after = await this.prisma.supplier.update({
        where: { id },
        data: { isActive: false },
      });
      await this.audit(actorId, id, "deactivate", {
        reason: "had product links — soft-deactivated instead of deleted",
        productLinkCount,
      });
      return { ok: true, deactivated: true };
    }

    await this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
    await this.audit(actorId, id, "soft_delete", {});
    return { ok: true };
  }

  // ─── Supplier ⇄ Product directory ─────────────────────────────

  @Get(":id/products")
  @ApiOperation({ summary: "List products linked to this supplier" })
  async listProducts(@Param("id") id: string) {
    return this.prisma.supplierProduct.findMany({
      where: { supplierId: id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            slug: true,
            nameBn: true,
            nameEn: true,
            isActive: true,
            category: { select: { nameEn: true, nameBn: true } },
          },
        },
      },
    });
  }

  @Post(":id/products")
  @AdminOnly()
  @ApiOperation({ summary: "Link a product to this supplier (admin only)" })
  async addProduct(
    @Param("id") id: string,
    @Body() body: { productId: string; isPrimary?: boolean; unitCost?: number },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    if (!body?.productId) throw new BadRequestException("productId is required");

    const product = await this.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw new NotFoundException("Product not found");

    const link = await this.prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: id, productId: body.productId } },
      update: {
        isPrimary: !!body.isPrimary,
        unitCost: body.unitCost ?? undefined,
      },
      create: {
        supplierId: id,
        productId: body.productId,
        isPrimary: !!body.isPrimary,
        unitCost: body.unitCost ?? null,
      },
    });

    // If marking as primary, unset other primaries for the same product
    if (body.isPrimary) {
      await this.prisma.supplierProduct.updateMany({
        where: {
          productId: body.productId,
          NOT: { supplierId: id },
        },
        data: { isPrimary: false },
      });
    }

    await this.audit(actorId, id, "link_product", { productId: body.productId, isPrimary: !!body.isPrimary, unitCost: body.unitCost });
    return link;
  }

  @Patch(":id/products/:productId")
  @ApiOperation({ summary: "Update a product link (primary flag / unit cost)" })
  async updateProductLink(
    @Param("id") id: string,
    @Param("productId") productId: string,
    @Body() body: { isPrimary?: boolean; unitCost?: number | null },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    const existing = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId: id, productId } },
    });
    if (!existing) throw new NotFoundException("Product link not found");

    const data: any = {};
    if (body.isPrimary !== undefined) data.isPrimary = !!body.isPrimary;
    if (body.unitCost !== undefined) data.unitCost = body.unitCost ?? null;

    const link = await this.prisma.supplierProduct.update({
      where: { supplierId_productId: { supplierId: id, productId } },
      data,
    });
    if (body.isPrimary === true) {
      await this.prisma.supplierProduct.updateMany({
        where: { productId, NOT: { supplierId: id } },
        data: { isPrimary: false },
      });
    }
    await this.audit(actorId, id, "link_product", { productId, ...data });
    return link;
  }

  @Delete(":id/products/:productId")
  @AdminOnly()
  @ApiOperation({ summary: "Remove a product link (admin only)" })
  async removeProductLink(
    @Param("id") id: string,
    @Param("productId") productId: string,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    await this.prisma.supplierProduct.delete({
      where: { supplierId_productId: { supplierId: id, productId } },
    });
    await this.audit(actorId, id, "unlink_product", { productId });
    return { ok: true };
  }

  // ─── Order-item sourcing ──────────────────────────────────────

  @Post("order-items/:orderItemId")
  @ApiOperation({
    summary: "Record which supplier(s) sourced an order item",
  })
  async linkOrderItem(
    @Param("orderItemId") orderItemId: string,
    @Body()
    body: {
      supplierId: string;
      qty: number;
      unitCost?: number;
      note?: string;
    },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    if (!body?.supplierId) throw new BadRequestException("supplierId is required");
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException("qty must be a positive number");
    }

    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: { id: true, qty: true, productId: true },
    });
    if (!item) throw new NotFoundException("Order item not found");

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: body.supplierId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    // Sum of already-recorded qty for this order item + new qty must not
    // exceed the order item qty.
    const already = await this.prisma.orderItemSupplier.aggregate({
      where: { orderItemId, NOT: { supplierId: body.supplierId } },
      _sum: { qty: true },
    });
    const used = (already._sum.qty ?? 0) + qty;
    if (used > item.qty) {
      throw new BadRequestException(
        `Total supplied qty (${used}) exceeds order item qty (${item.qty})`,
      );
    }

    const link = await this.prisma.orderItemSupplier.upsert({
      where: {
        orderItemId_supplierId: {
          orderItemId,
          supplierId: body.supplierId,
        },
      },
      update: {
        qty,
        unitCost: body.unitCost ?? undefined,
        note: body.note ?? undefined,
        recordedBy: actorId,
      },
      create: {
        orderItemId,
        supplierId: body.supplierId,
        qty,
        unitCost: body.unitCost ?? null,
        note: body.note ?? null,
        recordedBy: actorId,
      },
    });

    await this.audit(actorId, body.supplierId, "link_order_item", {
      orderItemId,
      qty,
      unitCost: body.unitCost,
      productId: item.productId,
    });

    return link;
  }

  @Delete("order-items/:orderItemId/:supplierId")
  @AdminOnly()
  @ApiOperation({ summary: "Remove a supplier link from an order item (admin only)" })
  async unlinkOrderItem(
    @Param("orderItemId") orderItemId: string,
    @Param("supplierId") supplierId: string,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    await this.prisma.orderItemSupplier.delete({
      where: { orderItemId_supplierId: { orderItemId, supplierId } },
    });
    await this.audit(actorId, supplierId, "unlink_order_item", { orderItemId });
    return { ok: true };
  }

  @Get("order-items/:orderItemId")
  @ApiOperation({ summary: "List supplier links for a given order item" })
  async getOrderItemLinks(@Param("orderItemId") orderItemId: string) {
    return this.prisma.orderItemSupplier.findMany({
      where: { orderItemId },
      include: {
        supplier: {
          select: { id: true, slug: true, nameBn: true, nameEn: true, phone: true, rating: true },
        },
      },
      orderBy: { recordedAt: "asc" },
    });
  }

  // ─── helpers ──────────────────────────────────────────────────

  private async audit(
    actorId: string | undefined,
    entityId: string,
    action: string,
    diff: any,
  ) {
    if (!actorId) return;
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "supplier",
        entityId,
        action,
        diff,
      },
    });
  }
}

function clampRating(n: any): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, v));
}
function clampInt(n: any): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return v;
}
