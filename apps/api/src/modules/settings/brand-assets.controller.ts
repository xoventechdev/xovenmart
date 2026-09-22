import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import "multer"; // ensures the global Express.Multer namespace is augmented
import { SettingsService } from "./settings.service";
import { MediaStorageService } from "../admin/media-storage.service";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";

/**
 * Brand asset (logo / favicon / OG image) management.
 *
 * Why this lives next to `SettingsService` instead of in `AdminMediaController`:
 *   - `AdminMediaController` is product-scoped — every upload route
 *     requires `productId` and is intended for product gallery rows.
 *     Brand assets are global, not per-product.
 *   - The user-facing consumption path is admin-edited, persisted via
 *     the AppSetting key-value store, and read by every public page
 *     via `/settings/public/general`. So "Brand" is a sibling of
 *     "General Settings", not a sibling of "Media".
 *
 * Storage strategy — file on disk + URL in AppSettings:
 *
 *   - The previous version of this controller wrote files to
 *     `/var/www/xovenmart-uploads/brand/` and served them via a public
 *     `/static/brand/:filename` route. That broke every time the
 *     api container redeployed (overlay filesystem, no persistent
 *     volume mounted at that path) — the DB still had the URL
 *     pointing at a file that no longer existed, so every `<img src>`
 *     404'd with "Asset not found on disk".
 *   - An interim rewrite encoded the uploaded file as
 *     `data:image/<ext>;base64,...` and stored the data URL directly
 *     in the AppSetting row. That survived redeploys but blew up
 *     `/settings/public/general` to 6.4 MB on every page load — the
 *     api was shipping the full binary inline as JSON.
 *   - This rewrite (the third iteration) saves the file to the api's
 *     persistent uploads volume (`infra_api_uploads` mounted at
 *     `/repo/apps/api/uploads` in the container) and stores the
 *     absolute URL in AppSettings. Same disk volume that product
 *     images already use, so the api's existing `express.static`
 *     mount at `/uploads/*` serves them. Survives redeploys because
 *     the volume is persistent, AND the per-page response stays
 *     small because the binary isn't inlined into JSON.
 *
 * Why we delete the old `/static/brand/:filename` public route:
 *   - Nothing on the web/admin app reads from it directly anymore —
 *     every consumer (header `<BrandBlock>`, footer `<BrandBlock>`,
 *     maintenance `<MaintenanceLock>`, root `<metadata>`) reads
 *     `brand.logoUrl` from `/settings/public/general` and stuffs it
 *     into an `<img src>` verbatim. A data URL or a `/uploads/...`
 *     URL both work there with zero changes. Keeping a dead
 *     controller around would just invite future contributors to
 *     debug a 404 on a URL nothing else uses.
 *
 * Security:
 *   - Only ADMIN role can upload.
 *   - File type is sniffed from the magic bytes (first 12 bytes) —
 *     not the extension — so a renamed `.png` `.exe` is rejected.
 *   - File size capped at 4 MB. Logos/favicons are tiny.
 */
@ApiTags("admin/brand-assets")
@Controller("admin/brand-assets")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN")
@AdminOnly()
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminBrandAssetsController {
  private readonly logger = new Logger(AdminBrandAssetsController.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly storage: MediaStorageService,
  ) {}

  /** Allowed key set for the `kind` field — maps 1:1 to a settings row. */
  private static readonly KINDS = new Set([
    "logo",
    "logoDark",
    "favicon",
    "ogImage",
  ]);

  /** Max upload size in bytes (4 MB — covers any realistic PNG/SVG). */
  private static readonly MAX_BYTES = 4 * 1024 * 1024;

  /** Magic-byte → mime allowlist. SVG is text; the rest are binary. */
  private static readonly MAGIC: Array<{
    ext: string;
    mime: string;
    match: (b: Buffer) => boolean;
  }> = [
    { ext: "png", mime: "image/png", match: (b) => b[0] === 0x89 && b[1] === 0x50 },
    {
      ext: "jpg",
      mime: "image/jpeg",
      match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    },
    {
      ext: "webp",
      mime: "image/webp",
      match: (b) =>
        b.toString("ascii", 0, 4) === "RIFF" &&
        b.toString("ascii", 8, 12) === "WEBP",
    },
    {
      ext: "gif",
      mime: "image/gif",
      match: (b) => b.toString("ascii", 0, 3) === "GIF",
    },
    {
      ext: "ico",
      mime: "image/x-icon",
      match: (b) => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00,
    },
    {
      ext: "svg",
      mime: "image/svg+xml",
      match: (b) => {
        const s = b
          .toString("utf8", 0, Math.min(b.length, 512))
          .trim()
          .toLowerCase();
        return s.startsWith("<?xml") || s.startsWith("<svg");
      },
    },
  ];

  @Post("upload")
  @ApiOperation({
    summary:
      "Upload a brand asset (logo / favicon / OG image) — multipart/form-data",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: AdminBrandAssetsController.MAX_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException("Missing 'file' field");

    // 1. Verify size (the FileInterceptor limits will short-circuit too
    //    but a clean error is better than a 500).
    if (file.size > AdminBrandAssetsController.MAX_BYTES) {
      throw new BadRequestException(
        `File too large. Max ${AdminBrandAssetsController.MAX_BYTES / 1024 / 1024} MB`,
      );
    }

    // 2. Read the `kind` field — must be one of the known kinds.
    const kind = String((req.body as any)?.kind ?? "").trim();
    if (!AdminBrandAssetsController.KINDS.has(kind)) {
      throw new BadRequestException(
        `kind must be one of: ${[...AdminBrandAssetsController.KINDS].join(", ")}`,
      );
    }

    // 3. Magic-byte sniff — never trust the client mime type or extension.
    const detected = AdminBrandAssetsController.MAGIC.find((m) =>
      m.match(file.buffer),
    );
    if (!detected) {
      throw new BadRequestException(
        "Unsupported file type. Allowed: png, jpg, webp, gif, ico, svg.",
      );
    }

    // Set the sniffed mime on the multer file object so MediaStorageService's
    // ALLOWED_MIME check accepts it. FileInterceptor usually relies on the
    // client-declared mimetype, but we just verified the magic bytes are
    // valid — trust the sniff, not the extension.
    file.mimetype = detected.mime;
    if (!file.originalname.match(/\.[a-z0-9]+$/i)) {
      file.originalname = `${kind}.${detected.ext}`;
    }

    // 4. Save the binary to the api's persistent uploads volume and get
    //    back an absolute URL. MediaStorageService handles the date-
    //    partitioned directory layout, random filename, and the
    //    /uploads/<date>/<id>.<ext> path. The URL it returns is what
    //    gets stored in AppSettings — that's what `general.public.controller.ts`
    //    reads on every page load.
    const { url, sizeBytes, mimeType } = await this.storage.save(file, undefined, undefined, req);

    const settingsKey = `brand.${kind}Url`;
    const actorId = (req as any).userId as string;
    await this.settings.set(settingsKey, url, actorId);

    this.logger.log(
      `stored kind=${kind} → ${url} (${(sizeBytes / 1024).toFixed(1)} KB, ${mimeType})`,
    );

    return {
      ok: true,
      kind,
      url,
      contentType: mimeType,
      size: sizeBytes,
    };
  }
}
