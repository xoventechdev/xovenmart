import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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

@ApiTags("admin/media")
@Controller("admin/media")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminMediaController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────

  private toDto(img: any) {
    return {
      id: img.id,
      productId: img.productId,
      productName: img.product?.nameEn ?? null,
      url: img.url,
      altBn: img.altBn,
      altEn: img.altEn,
      sortOrder: img.sortOrder,
      createdAt: img.createdAt,
    };
  }

  private estimateContentType(url: string): string {
    const lower = url.toLowerCase();
    if (lower.startsWith("data:image/png")) return "png";
    if (lower.startsWith("data:image/jpeg") || lower.startsWith("data:image/jpg")) return "jpeg";
    if (lower.startsWith("data:image/webp")) return "webp";
    if (lower.startsWith("data:image/gif")) return "gif";
    if (lower.includes(".png")) return "png";
    if (lower.includes(".webp")) return "webp";
    if (lower.includes(".gif")) return "gif";
    return "jpeg";
  }

  private dataUrlSize(dataUrl: string): number {
    // rough byte estimate for a base64 data URL
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return 0;
    const b64 = dataUrl.slice(comma + 1);
    // every 4 base64 chars = 3 bytes (approx)
    return Math.floor((b64.length * 3) / 4);
  }

  // ─── Routes ───────────────────────────────────────────────────

  @Get("images")
  async listImages(@Query() q: { productId?: string; page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 100, 500);
    const where = q.productId ? { productId: q.productId } : {};
    const [items, total] = await Promise.all([
      this.prisma.productImage.findMany({
        where,
        include: {
          product: { select: { id: true, nameEn: true, nameBn: true, sku: true } },
        },
        orderBy: [{ productId: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.productImage.count({ where }),
    ]);
    return {
      items: items.map((i: any) => ({
        ...this.toDto(i),
        productName: i.product?.nameEn ?? null,
      })),
      page,
      perPage,
      total,
    };
  }

  @Post("upload")
  @AdminOnly()
  async upload(@Body() body: any, @Req() req: Request) {
    if (!body?.productId) {
      throw new BadRequestException("productId is required");
    }
    if (!body?.dataBase64) {
      throw new BadRequestException("dataBase64 is required");
    }
    if (!body?.filename) {
      throw new BadRequestException("filename is required");
    }
    const product = await this.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) {
      throw new BadRequestException(`Product ${body.productId} not found`);
    }

    const actorId = (req as any).userId;

    // Build data URL (Day-1: store base64 inline)
    let url: string;
    if (body.dataBase64.startsWith("data:")) {
      url = body.dataBase64;
    } else {
      const ct = body.contentType || "image/jpeg";
      url = `data:${ct};base64,${body.dataBase64}`;
    }

    const created = await this.prisma.productImage.create({
      data: {
        productId: body.productId,
        url,
        altBn: body.altBn ?? null,
        altEn: body.altEn ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "media_image",
          entityId: created.id,
          action: "upload",
          diff: { productId: body.productId, filename: body.filename },
        },
      });
    }

    return { ...this.toDto(created), filename: body.filename };
  }

  @Patch("images/:id")
  async updateImage(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const data: any = {};
    if (body.altBn !== undefined) data.altBn = body.altBn;
    if (body.altEn !== undefined) data.altEn = body.altEn;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    const updated = await this.prisma.productImage.update({
      where: { id },
      data,
      include: { product: { select: { id: true, nameEn: true } } },
    });
    const actorId = (req as any).userId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "media_image",
          entityId: id,
          action: "update",
          diff: body,
        },
      });
    }
    return this.toDto(updated);
  }

  @Delete("images/:id")
  @AdminOnly()
  async deleteImage(@Param("id") id: string, @Req() req: Request) {
    await this.prisma.productImage.delete({ where: { id } });
    const actorId = (req as any).userId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "media_image",
          entityId: id,
          action: "delete",
        },
      });
    }
    return { ok: true };
  }

  @Post("images/reorder")
  @AdminOnly()
  async reorderImages(@Body() body: { productId: string; imageIds: string[] }, @Req() req: Request) {
    if (!body?.productId || !Array.isArray(body.imageIds)) {
      throw new BadRequestException("productId and imageIds[] are required");
    }
    const actorId = (req as any).userId;
    const ops = body.imageIds.map((imageId, idx) =>
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { sortOrder: idx },
      }),
    );
    await Promise.all(ops);
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "media_image",
          entityId: body.productId,
          action: "reorder",
          diff: { count: body.imageIds.length },
        },
      });
    }
    return { ok: true, count: body.imageIds.length };
  }

  @Get("stats")
  async stats() {
    const all = await this.prisma.productImage.findMany({ select: { url: true } });
    const byType: Record<string, number> = {};
    let totalSizeBytes = 0;
    for (const img of all as any[]) {
      const t = this.estimateContentType(img.url);
      byType[t] = (byType[t] ?? 0) + 1;
      if (img.url.startsWith("data:")) {
        totalSizeBytes += this.dataUrlSize(img.url);
      }
    }
    return {
      totalImages: all.length,
      totalSizeBytes,
      byType,
    };
  }
}
