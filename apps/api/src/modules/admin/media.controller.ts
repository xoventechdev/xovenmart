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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { diskStorage } from "multer";
import { randomBytes } from "crypto";
import { join } from "path";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { MediaStorageService } from "./media-storage.service";

@ApiTags("admin/media")
@Controller("admin/media")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminMediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
  ) {}

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

  /**
   * Multipart upload endpoint — the recommended path for product form
   * image uploads. Accepts a single `file` field via multipart/form-data,
   * writes the bytes to local disk under `apps/api/uploads/YYYY-MM-DD/`,
   * and returns the public URL.
   *
   * `productId` is OPTIONAL — when omitted the upload lands in the
   * shared "media library" (no `ProductImage` row created yet) and the
   * caller can attach it later from `/admin/products/{id}/edit`. When
   * provided, a `ProductImage` row is created and linked to the product
   * with the supplied `sortOrder` (default 0).
   *
   * Why this exists alongside the legacy JSON `POST /upload`:
   *   - The JSON path embeds base64 in the request body, which the
   *     upstream proxy rejects with 413 once the image gets large.
   *   - This path streams the bytes via multer → disk, then returns
   *     just a URL, so the request body stays small no matter the
   *     image size.
   *
   * Returns: `{ id, url, filename, sizeBytes, mimeType }` where `id`
   * is the `ProductImage` row id (or `null` for a library-only upload).
   */
  @Post("upload-file")
  @AdminOnly()
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        productId: { type: "string", nullable: true },
        altBn: { type: "string", nullable: true },
        altEn: { type: "string", nullable: true },
        sortOrder: { type: "integer", nullable: true },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      // Stream straight to a temp dir; MediaStorageService renames to
      // the final date-partitioned path. We use `randomBytes` to avoid
      // collisions if two uploads arrive in the same millisecond.
      storage: diskStorage({
        destination: process.env.UPLOAD_TMP_DIR || "/tmp",
        filename: (_req, file, cb) => {
          const id = randomBytes(8).toString("hex");
          const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || [".bin"])[0];
          cb(null, `${id}${ext}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB — same cap as MediaStorageService
      },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          return cb(new BadRequestException("Only image files are accepted"), false);
        }
        return cb(null, true);
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { productId?: string; altBn?: string; altEn?: string; sortOrder?: string },
    @Req() req: Request,
  ) {
    const { url, sizeBytes, mimeType } = await this.storage.save(
      file,
      body?.altBn,
      body?.altEn,
      req,
    );

    // If `productId` was supplied, create the `ProductImage` row now.
    // Otherwise the upload is library-only — admin can attach it later.
    if (!body?.productId) {
      return {
        id: null,
        url,
        filename: file?.originalname ?? null,
        sizeBytes,
        mimeType,
        library: true,
      };
    }

    const product = await this.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) {
      // Roll back the file we just wrote so we don't leak orphan uploads.
      await this.storage.remove(url, req);
      throw new BadRequestException(`Product ${body.productId} not found`);
    }

    const sortOrder =
      body.sortOrder !== undefined && body.sortOrder !== ""
        ? Number(body.sortOrder)
        : 0;

    const created = await this.prisma.productImage.create({
      data: {
        productId: body.productId,
        url,
        altBn: body.altBn ?? null,
        altEn: body.altEn ?? null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    });

    const actorId = (req as any).userId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "media_image",
          entityId: created.id,
          action: "upload",
          diff: { productId: body.productId, filename: file?.originalname, url },
        },
      });
    }

    return {
      id: created.id,
      url,
      filename: file?.originalname ?? null,
      sizeBytes,
      mimeType,
      library: false,
    };
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
