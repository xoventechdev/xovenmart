import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join, extname, resolve } from "path";
import { randomBytes } from "crypto";

/**
 * Filesystem-backed media storage for product images.
 *
 * Why local disk instead of base64 in Postgres / R2?
 *
 *   - **413 Content Too Large.** The previous JSON shape embedded the
 *     entire base64 data URL inside the product PATCH body. A single
 *     3 MB photo became ~4 MB of base64 inside JSON, which the proxy
 *     (Cloudflare / Coolify / Nginx) rejected with a 413 before the
 *     request even reached the controller.
 *   - **Database bloat.** Storing megabytes per image as `text` makes
 *     every product query slower as the table grows.
 *   - **Cheap to operate.** A few thousand 2-MB product photos fit
 *     in a single VPS volume; we don't need R2 / Cloudfront yet. When
 *     traffic justifies it, swap this service for an R2 uploader —
 *     the only caller (`AdminMediaController.upload`) gets the URL
 *     back from one place.
 *
 * Upload contract (multipart/form-data):
 *
 *   - field `file`: a single image file (jpg, png, webp, gif).
 *   - field `altBn` / `altEn`: optional text (currently unused by
 *     the controller — kept in the contract for future callers).
 *
 * Returns the **public** URL to the served file, e.g.
 * `https://api.xovenmart.com/uploads/2026-09-14/abcd1234.jpg` in
 * production, or `/uploads/2026-09-14/abcd1234.jpg` when no public
 * base is configured. Callers persist this URL in `ProductImage.url`
 * exactly the same way they'd persist an external HTTPS URL — the
 * public Next.js site then loads the image directly from the API host
 * via `<Image unoptimized>`, which is cheaper than proxying through
 * `/_next/image` for files of our size.
 *
 * Public URL prefix is configured via `PUBLIC_UPLOAD_PREFIX`. When it
 * is an absolute URL (`https://...`) we use it as-is; otherwise we
 * treat it as a path prefix (default `/uploads`). Static serving is
 * wired in `main.ts` so the same URL prefix the service returns is
 * exactly what gets served.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
// 5 MB hard cap. The client UI also rejects > 2 MB pre-upload as a
// UX nicety, but the server enforces its own limit so a hand-crafted
// curl can't bypass it. Big enough for a 4000×4000 photo straight from
// the camera; small enough that we never blow past the Coolify proxy's
// ~10 MB body limit even with several files in flight.
const MAX_BYTES = 5 * 1024 * 1024;

/** Strip any path components and dangerous chars from a user-supplied
 *  filename. We never trust the client to provide a clean name. */
function sanitizeBasename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "image";
  // Keep ASCII letters, digits, dot, hyphen, underscore. Collapse to
  // empty if everything got stripped.
  return base.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
}

@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  /** Resolve the on-disk root directory once. */
  private get uploadDir(): string {
    const fromEnv = process.env.UPLOAD_DIR;
    if (fromEnv) return resolve(fromEnv);
    // Walk up from CWD until we find the monorepo root (where
    // `pnpm-workspace.yaml` lives) — then land at
    // `<root>/apps/api/uploads`. Works in dev (`pnpm --filter api dev`)
    // AND in the Coolify Docker image (CWD = `/app/apps/api`).
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
        return resolve(join(dir, "apps", "api", "uploads"));
      }
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
    // Fallback: relative to CWD. Docker sets WORKDIR to /app/apps/api.
    return resolve(process.cwd(), "uploads");
  }

  /** URL prefix the served files are reachable at. Matches the static
   *  mount point wired in `main.ts`. Accepts either a relative path
   *  (default `/uploads`) or an absolute `https://...` URL — when
   *  absolute, the saved URL points straight at the API host so the
   *  Next.js public site can `<Image unoptimized>` it without needing
   *  a proxy through `/_next/image`. */
  get urlPrefix(): string {
    return process.env.PUBLIC_UPLOAD_PREFIX || "/uploads";
  }

  /** Compose the public URL for a given filename in the date-partitioned
   *  layout. Centralized so the absolute-vs-relative rule lives in one
   *  place. `urlPrefix` may be `/uploads` (relative) or
   *  `https://api.xovenmart.com/uploads` (absolute) — we strip any
   *  trailing slashes and append the date-partitioned path. */
  private buildPublicUrl(dayDir: string, filename: string): string {
    const trimmed = this.urlPrefix.replace(/\/+$/, "");
    const tail = `${dayDir}/${filename}`.replace(/^\/+/, "");
    return `${trimmed}/${tail}`;
  }

  /** Save an uploaded file to disk and return its public URL.
   *
   *  Throws `BadRequestException` for any validation failure so the
   *  controller can let it bubble up as a 400 with a clear message.
   */
  async save(
    file: Express.Multer.File | undefined,
    altBn?: string,
    altEn?: string,
  ): Promise<{ url: string; sizeBytes: number; mimeType: string }> {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported image type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME].join(", ")}`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB (max ${MAX_BYTES / 1024 / 1024} MB)`,
      );
    }

    // Date-partitioned path keeps any single directory small enough for
    // filesystems that struggle with huge dirs (ext4 is fine but S3
    // listing by date prefix is also a nice side effect if we ever
    // mirror to R2).
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const dayDir = join(this.uploadDir, `${yyyy}-${mm}-${dd}`);

    await fs.mkdir(dayDir, { recursive: true });

    const ext = ALLOWED_EXT[file.mimetype] || extname(sanitizeBasename(file.originalname)) || ".bin";
    const id = randomBytes(8).toString("hex"); // 16 chars — collision-safe
    const filename = `${id}${ext}`;
    const fullPath = join(dayDir, filename);

    // If multer was configured with `dest`, the file is already on disk
    // at `file.path`. If it was configured with memory storage, write
    // the buffer. The controller picks one — both code paths below
    // handle the common cases.
    if (file.path && file.path !== fullPath) {
      await fs.rename(file.path, fullPath).catch(async (err) => {
        // Cross-device rename can fail on some FS configs — fall back
        // to copy + unlink.
        if ((err as NodeJS.ErrnoException).code === "EXDEV") {
          await fs.copyFile(file.path, fullPath);
          await fs.unlink(file.path).catch(() => undefined);
          return;
        }
        throw err;
      });
    } else if (file.buffer) {
      await fs.writeFile(fullPath, file.buffer);
    } else {
      throw new BadRequestException("Uploaded file has no content");
    }

    const url = this.buildPublicUrl(`${yyyy}-${mm}-${dd}`, filename);
    this.logger.log(
      `saved upload ${url} (${(file.size / 1024).toFixed(1)} KB, ${file.mimetype}) altBn=${altBn ?? ""} altEn=${altEn ?? ""}`,
    );

    return { url, sizeBytes: file.size, mimeType: file.mimetype };
  }

  /**
   * Best-effort delete — used when an admin removes an image from the
   * product form (or rolls back a failed create). Silently no-ops if
   * the file isn't on disk so callers don't need to special-case
   * "already deleted" / "external URL" rows.
   */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url) return;
    // Only act on URLs we own. External https URLs are skipped.
    const prefix = this.urlPrefix + "/";
    if (!url.startsWith(prefix)) return;
    const tail = url.slice(prefix.length);
    // Defensive: no `..`, no leading `/`, no drive letters.
    if (tail.includes("..") || tail.startsWith("/") || /^[a-zA-Z]:/.test(tail)) {
      this.logger.warn(`refusing to delete suspicious path: ${url}`);
      return;
    }
    const fullPath = join(this.uploadDir, tail);
    try {
      await fs.unlink(fullPath);
    } catch (e: any) {
      if (e?.code !== "ENOENT") {
        this.logger.warn(`failed to delete ${fullPath}: ${e?.message ?? e}`);
      }
    }
  }
}
