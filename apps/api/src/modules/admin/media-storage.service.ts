import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join, extname, resolve } from "path";
import { randomBytes } from "crypto";
import type { Request } from "express";

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
 * production, or `/uploads/2026-09-14/abcd1234.jpg` when no request
 * context is available (e.g. local dev with no Host header set).
 * Callers persist this URL in `ProductImage.url` exactly the same way
 * they'd persist an external HTTPS URL — the public Next.js site then
 * loads the image directly from the API host via `<Image unoptimized>`,
 * which is cheaper than proxying through `/_next/image` for files of
 * our size.
 *
 * Public URL prefix resolution (priority order):
 *
 *   1. `PUBLIC_UPLOAD_PREFIX` env var, when set to an absolute URL —
 *      explicit operator override (e.g. CDN fronting the API host).
 *      When set to a path like `/uploads` we still honor it as the
 *      path-only fallback (e.g. legacy local dev).
 *   2. The active request's `X-Forwarded-Proto` + `X-Forwarded-Host`
 *      (or `req.protocol` + `req.headers.host`) — this is what makes
 *      the preview work from the admin panel hosted at
 *      `https://xovenmart.com/admin/...`, which proxies uploads through
 *      `api.xovenmart.com` but the browser resolves relative URLs
 *      against the WEB host.
 *   3. `/uploads` (last-resort dev fallback).
 *
 * Static serving is wired in `main.ts` at `/uploads` regardless of
 * which prefix we return — the absolute URL just gets re-resolved
 * against the API host by the browser. Existing rows that were
 * persisted with a relative URL are still served correctly because
 * the API server itself answers the same `/uploads/...` path.
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
   *  mount point wired in `main.ts`. When an Express request is passed
   *  in, the prefix becomes an absolute URL pointing at the host the
   *  request actually came from — so the admin panel (which lives on
   *  a different hostname than the API) renders the preview from the
   *  correct origin. The static mount in `main.ts` always serves at
   *  the relative `/uploads/...` path; only the URL we RETURN changes.
   *
   *  Resolution order:
   *    1. `PUBLIC_UPLOAD_PREFIX` env var, if set to an absolute URL —
   *       operator override (e.g. CDN). Honors relative path values
   *       too, for legacy local-dev convenience.
   *    2. From `req` — protocol + host. Uses `X-Forwarded-Proto` /
   *       `X-Forwarded-Host` first (Coolify/nginx set these), falls
   *       back to `req.protocol` + `req.headers.host`.
   *    3. `/uploads` — last-resort dev fallback when no request is
   *       available (e.g. background jobs).
   */
  urlPrefix(req?: Request): string {
    const env = process.env.PUBLIC_UPLOAD_PREFIX;
    if (env) {
      // If the operator gave us an absolute URL, trust it; otherwise
      // treat the env value as a relative path (legacy behavior).
      if (/^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
      return env.startsWith("/") ? env.replace(/\/+$/, "") : `/${env}`;
    }
    if (req) {
      const fwdProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
      const fwdHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
      const proto = fwdProto || req.protocol || "https";
      const host = fwdHost || req.headers.host;
      if (host) {
        return `${proto}://${host}/uploads`;
      }
    }
    return "/uploads";
  }

  /** Compose the public URL for a given filename in the date-partitioned
   *  layout. Centralized so the absolute-vs-relative rule lives in one
   *  place. `prefix` may be `/uploads` (relative) or
   *  `https://api.xovenmart.com/uploads` (absolute) — we strip any
   *  trailing slashes and append the date-partitioned path. */
  private buildPublicUrl(prefix: string, dayDir: string, filename: string): string {
    const trimmed = prefix.replace(/\/+$/, "");
    const tail = `${dayDir}/${filename}`.replace(/^\/+/, "");
    return `${trimmed}/${tail}`;
  }

  /** Save an uploaded file to disk and return its public URL.
   *
   *  When `req` is provided the returned URL is absolute and points at
   *  the same host the upload arrived on — this is what makes the
   *  admin preview work when the admin is hosted on a different
   *  hostname than the API (e.g. `xovenmart.com` admin → `api.xovenmart.com`
   *  upload endpoint → save row with `https://api.xovenmart.com/uploads/...`).
   *
   *  Throws `BadRequestException` for any validation failure so the
   *  controller can let it bubble up as a 400 with a clear message.
   */
  async save(
    file: Express.Multer.File | undefined,
    altBn?: string,
    altEn?: string,
    req?: Request,
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

    const prefix = this.urlPrefix(req);
    const url = this.buildPublicUrl(prefix, `${yyyy}-${mm}-${dd}`, filename);
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
   *
   * Matches a URL we own by:
   *   - absolute URL prefix (current `urlPrefix(req)`), OR
   *   - any relative `/uploads/...` form (handles historical rows
   *     persisted before absolute URLs were wired up).
   *
   * External https URLs to other hosts are skipped.
   */
  async remove(url: string | null | undefined, req?: Request): Promise<void> {
    if (!url) return;
    const absPrefix = this.urlPrefix(req);
    const absPrefixSlash = absPrefix + "/";
    const relPrefix = "/uploads/";
    let tail: string | null = null;
    if (url.startsWith(absPrefixSlash)) {
      tail = url.slice(absPrefixSlash.length);
    } else if (url.startsWith(relPrefix)) {
      tail = url.slice(relPrefix.length);
    } else {
      return;
    }
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

  /**
   * Recursively delete every file under the upload root, then re-create
   * the root directory. Used by the destructive `WIPE DEMO DATA` flow
   * after the DB rows are already gone — a clean sweep means the volume
   * doesn't slowly fill up with orphaned files from prior wipes.
   *
   * Best-effort: each `rm` failure is logged but doesn't abort the sweep.
   * The caller has already committed the DB wipe, so throwing here would
   * surface as a 500 to the admin for no real benefit — the user can see
   * any errors in the sweep result.
   *
   * Returns: `{ filesRemoved, bytesRemoved, errors }`. `errors` is a
   * list of `{ path, message }` so the operator can investigate.
   */
  async purgeAll(): Promise<{ filesRemoved: number; bytesRemoved: number; errors: Array<{ path: string; message: string }> }> {
    const root = this.uploadDir;
    let filesRemoved = 0;
    let bytesRemoved = 0;
    const errors: Array<{ path: string; message: string }> = [];

    async function walk(dir: string): Promise<void> {
      let entries: import("fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e: any) {
        if (e?.code === "ENOENT") return; // nothing to do
        errors.push({ path: dir, message: `readdir failed: ${e?.message ?? e}` });
        return;
      }
      for (const ent of entries) {
        const full = join(dir, ent.name);
        // Defensive: never follow symlinks — they'd let a hostile
        // upload escape the upload root.
        if (ent.isSymbolicLink()) {
          errors.push({ path: full, message: "refusing to follow symlink" });
          continue;
        }
        if (ent.isDirectory()) {
          await walk(full);
          try {
            await fs.rmdir(full);
          } catch (e: any) {
            errors.push({ path: full, message: `rmdir failed: ${e?.message ?? e}` });
          }
        } else if (ent.isFile()) {
          try {
            const stat = await fs.stat(full);
            await fs.unlink(full);
            filesRemoved += 1;
            bytesRemoved += stat.size;
          } catch (e: any) {
            errors.push({ path: full, message: `unlink failed: ${e?.message ?? e}` });
          }
        }
      }
    }

    await walk(root);
    // Re-create the root so the next upload doesn't have to mkdir.
    try {
      await fs.mkdir(root, { recursive: true });
    } catch (e: any) {
      errors.push({ path: root, message: `mkdir after purge failed: ${e?.message ?? e}` });
    }

    this.logger.warn(
      `purgeAll removed ${filesRemoved} files (${(bytesRemoved / 1024 / 1024).toFixed(2)} MB), ${errors.length} errors`,
    );
    return { filesRemoved, bytesRemoved, errors };
  }
}
