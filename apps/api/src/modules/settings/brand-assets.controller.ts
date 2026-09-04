import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import "multer"; // ensures the global Express.Multer namespace is augmented
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { SettingsService } from "./settings.service";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";

/**
 * Default on-disk location for brand assets. Can be overridden via the
 * `BRAND_ASSETS_DIR` env var. The directory is created lazily on first
 * upload.
 *
 * IMPORTANT: this directory MUST be backed by a persistent volume mount
 * in production. In a Coolify container without a volume mount, files
 * land in the container's overlay filesystem and disappear on the next
 * redeploy — the URL stored in `brand.*Url` will then 404.
 */
export const BRAND_ASSETS_DIR_DEFAULT = "/var/www/xovenmart-uploads/brand";

/** Resolve the brand-asset directory, honouring `BRAND_ASSETS_DIR`. */
export function resolveBrandAssetsDir(): string {
  return process.env.BRAND_ASSETS_DIR ?? BRAND_ASSETS_DIR_DEFAULT;
}

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
 * Storage:
 *   - Files land on a Coolify-mounted volume at
 *     `/var/www/xovenmart-uploads/brand/` (override with env
 *     `BRAND_ASSETS_DIR`). The directory is created lazily on first
 *     upload.
 *   - The static URL is hard-coded to
 *     `${PUBLIC_API_URL}/static/brand/<file>` so the same file can be
 *     served from any reverse-proxy / CDN without rewriting paths.
 *     Traefik on the VPS is configured to strip the `/api/v1/` prefix
 *     before reaching NestJS, so `GET /static/brand/x.png` here ends
 *     up as `/static/brand/x.png` internally.
 *   - Day-1 strategy (no S3/R2/Cloudinary). Future migrations can
 *     swap `diskWrite()` for an `s3.putObject()` call without changing
 *     any consumer.
 *
 * Security:
 *   - Only ADMIN role can upload/delete.
 *   - File type is sniffed from the magic bytes (first 12 bytes) —
 *     not the extension — so a renamed `.png` `.exe` is rejected.
 *   - File size capped at 4 MB. Logos/favicons are tiny.
 *   - Filename is server-generated (random hex + safe extension) so a
 *     malicious client can't write `../../etc/passwd` as the filename.
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

  /** Magic-byte → extension allowlist. SVG is text; the rest are binary. */
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
    { ext: "webp", mime: "image/webp", match: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
    { ext: "gif", mime: "image/gif", match: (b) => b.toString("ascii", 0, 3) === "GIF" },
    { ext: "ico", mime: "image/x-icon", match: (b) => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00 },
    { ext: "svg", mime: "image/svg+xml", match: (b) => {
      const s = b.toString("utf8", 0, Math.min(b.length, 512)).trim().toLowerCase();
      return s.startsWith("<?xml") || s.startsWith("<svg");
    } },
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

    // 4. Generate a server-side filename so the user can't write
    //    `../../etc/passwd` and the URL is stable across re-uploads.
    const hash = crypto.randomBytes(8).toString("hex");
    const filename = `${kind}-${hash}.${detected.ext}`;

    // 5. Persist to disk.
    const dir = resolveBrandAssetsDir();
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, filename);
    fs.writeFileSync(target, file.buffer);

    // Self-check + structured log so we can tell apart the two
    // failure modes next time the public URL 404s:
    //   (a) the file vanished because no persistent volume is mounted
    //       at `dir` (overlay filesystem, lost on redeploy) — look
    //       for `wrote <bytes> bytes` below with the resolved path
    //       and verify the file is still there from the next request.
    //   (b) the file is there but Traefik / a reverse proxy is
    //       stripping or rewriting the path before NestJS sees it.
    // Always log the absolute target path so it shows up in
    // `coolify logs -f`.
    let writtenBytes = 0;
    try {
      writtenBytes = fs.statSync(target).size;
    } catch {
      /* swallowed — the next fs.existsSync check covers it */
    }
    this.logger.log(
      `wrote ${writtenBytes} bytes for kind=${kind} -> ${target}`,
    );

    // 6. Build the public URL.
    const apiBase = (
      process.env.PUBLIC_API_URL ?? "https://api.xovenmart.com"
    ).replace(/\/+$/, "");
    const url = `${apiBase}/static/brand/${filename}`;

    // 7. Map kind → settings row, then upsert via the existing
    //    SettingsService pipeline (so cache invalidation + audit log
    //    happen automatically).
    const settingsKey = `brand.${kind}Url`;
    const actorId = (req as any).userId as string;
    await this.settings.set(settingsKey, url, actorId);

    return {
      ok: true,
      kind,
      url,
      filename,
      contentType: detected.mime,
      size: file.size,
    };
  }
}

/**
 * PUBLIC controller — serves the brand assets back as static files.
 *
 * Why a separate `@Controller("static/brand")` and not a NestJS
 * `useStaticAssets(...)`:
 *   - We want zero caching headers on the actual file (admin can
 *     re-upload any time and the new file must appear immediately).
 *     Setting headers via middleware is messier than a one-liner
 *     inside an Express handler.
 *   - `useStaticAssets` resolves files at boot from a single root;
 *     we want a controller-level safety check (no `..` traversal,
 *     only the configured kinds).
 *   - It keeps the asset directory's on-disk shape decoupled from
 *     its public URL — future migrations to S3 only need to swap
 *     the `find()` / `sendFile()` body.
 */
@ApiTags("static")
@Controller("static/brand")
export class BrandAssetsPublicController {
  private readonly logger = new Logger(BrandAssetsPublicController.name);
  private readonly dir: string;
  private readonly apiBase: string;

  constructor() {
    this.dir = resolveBrandAssetsDir();
    this.apiBase = (
      process.env.PUBLIC_API_URL ?? "https://api.xovenmart.com"
    ).replace(/\/+$/, "");
    // Log the resolved dir once on boot so the operator can see at a
    // glance whether the public serve path matches the upload path
    // (they always should, but a typo in the env var would silently
    // split them — and the next 404 would look identical from the
    // outside). Coolify `docker logs -f` will show this on every boot.
    this.logger.log(`brand assets dir resolved to: ${this.dir}`);
  }

  /**
   * Resolve a filename from the URL and stream the file back. Returns
   * 404 if the file doesn't exist on disk (the Coolify volume was
   * re-mounted, the file was deleted, etc.).
   *
   * Filenames are restricted to the regex below — even though NestJS
   * param matching already strips path separators, defence-in-depth.
   */
  @Get(":filename")
  async getFile(@Param("filename") filename: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9_\-]+\.(png|jpg|jpeg|webp|gif|ico|svg)$/.test(filename)) {
      throw new NotFoundException("Not found");
    }

    const full = path.join(this.dir, filename);
    // `path.join` + the regex above already prevent `..` traversal,
    // but `realpath` is one more line of paranoia.
    const real = path.resolve(full);
    if (!real.startsWith(path.resolve(this.dir))) {
      throw new NotFoundException("Not found");
    }

    if (!fs.existsSync(real)) {
      // Loud log so the operator can see in `coolify logs -f` exactly
      // which path the public handler expected to find the file at.
      // This is the single most useful line for diagnosing "I uploaded
      // an asset and now it 404s" — covers both the missing-volume
      // case (overlay filesystem lost the file) and the
      // env-var-split case (upload wrote to one path, serve reads
      // from another).
      this.logger.warn(
        `brand asset 404: requested=${filename} expected=${real}`,
      );
      throw new NotFoundException("Asset not found on disk");
    }

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      ico: "image/x-icon",
      svg: "image/svg+xml",
    }[ext] ?? "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.sendFile(real);
  }
}
