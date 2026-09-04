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
 * Storage strategy — base64 data URLs in AppSettings:
 *
 *   - The previous version of this controller wrote files to
 *     `/var/www/xovenmart-uploads/brand/` and served them via a public
 *     `/static/brand/:filename` route. That broke every time the Coolify
 *     API container redeployed (overlay filesystem, no persistent volume
 *     mounted at that path) — the DB still had the URL pointing at a
 *     file that no longer existed, so every `<img src>` 404'd with
 *     "Asset not found on disk".
 *   - This rewrite encodes the uploaded file as `data:image/<ext>;base64,...`
 *     and stores the data URL directly in the AppSetting row, exactly
 *     like `AdminMediaController.upload` does for product images. The
 *     app then ships the binary embedded in the JSON response — it
 *     survives every redeploy because it lives in the same Postgres
 *     database as every other setting, and `<img src="data:...">` is a
 *     standard browser feature with no extra plumbing required.
 *   - The cap (4 MB) is intentionally generous because real production
 *     logos / OG images are typically well under 200 KB. If the admin
 *     tries to upload a 4 MB animated WebP, the resulting data URL
 *     ~5.3 MB, which is fine inside a single AppSetting value.
 *
 * Why we delete the old `/static/brand/:filename` public route:
 *   - Nothing on the web/admin app reads from it directly anymore —
 *     every consumer (header `<BrandBlock>`, footer `<BrandBlock>`,
 *     maintenance `<MaintenanceLock>`, root `<metadata>`) reads
 *     `brand.logoUrl` from `/settings/public/general` and stuffs it
 *     into an `<img src>` verbatim. A data URL works there with zero
 *     changes. Keeping a dead controller around would just invite
 *     future contributors to debug a 404 on a URL nothing else uses.
 *
 * Security:
 *   - Only ADMIN role can upload.
 *   - File type is sniffed from the magic bytes (first 12 bytes) —
 *     not the extension — so a renamed `.png` `.exe` is rejected.
 *   - File size capped at 4 MB. Logos/favicons are tiny.
 *
 * Migration note for existing data:
 *   - Any pre-existing brand URL that points at `/static/brand/<file>`
 *     (from the old disk-based flow) will fail with a broken image.
 *     That's expected — the admin just needs to re-upload the logo /
 *     favicon / OG image once via the Brand Identity card on
 *     `/admin/system/settings`. The form already shows the empty
 *     inputs after the previous URLs 404, so the remediation is
 *     self-evident.
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

  constructor(private readonly settings: SettingsService) {}

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

    // 4. Encode as base64 data URL and store in AppSettings. No disk
    //    writes — the binary rides along inside the AppSetting.value
    //    JSON column, so it persists across redeploys without needing
    //    a Coolify volume mount.
    const dataUrl = `data:${detected.mime};base64,${file.buffer.toString("base64")}`;

    const settingsKey = `brand.${kind}Url`;
    const actorId = (req as any).userId as string;
    await this.settings.set(settingsKey, dataUrl, actorId);

    this.logger.log(
      `stored kind=${kind} as ${(dataUrl.length / 1024).toFixed(1)} KB data URL`,
    );

    return {
      ok: true,
      kind,
      url: dataUrl,
      contentType: detected.mime,
      size: file.size,
    };
  }
}
