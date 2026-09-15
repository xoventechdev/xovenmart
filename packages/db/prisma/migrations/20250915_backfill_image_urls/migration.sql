-- Backfill product / category / banner image URLs from relative
-- `/uploads/...` to absolute `https://api.xovenmart.com/uploads/...`.
--
-- Why this migration exists:
--
-- Before today, MediaStorageService returned a RELATIVE URL when no
-- PUBLIC_UPLOAD_PREFIX was configured. The admin panel is hosted at
-- `xovenmart.com` (web) but uploads are served at `api.xovenmart.com`.
-- A relative `/uploads/...` URL saved in the DB resolves against the
-- page origin, so when an admin previews an upload from `xovenmart.com`,
-- the browser tries `https://xovenmart.com/uploads/...` and gets a 404.
-- Same problem on the public site.
--
-- The fix is two-part:
--
--   1. New uploads now return an absolute URL derived from the request
--      host (or PUBLIC_UPLOAD_PREFIX) — see MediaStorageService.urlPrefix.
--   2. THIS migration rewrites the rows that were already saved with a
--      relative URL, so existing products / categories / banners
--      immediately start rendering without a manual data fix.
--
-- Scope:
--   - product_images.url            (every product photo)
--   - categories.image_url          (category icon)
--   - banners.image_url             (homepage hero)
--   - banners.mobile_image_url      (mobile hero variant)
--
-- Out of scope (already absolute, or stored as data: base64):
--   - app_settings brand logos      (now stored as base64 — see Phase G)
--   - data: URLs (base64 inlining — left alone)
--   - external https/http URLs      (left alone)
--
-- Idempotent: only touches rows where the URL starts with `/uploads/`
-- (single leading slash, no scheme). Rows that are already absolute,
-- data: URLs, or external URLs are not modified.

UPDATE "product_images"
SET    "url" = 'https://api.xovenmart.com' || "url"
WHERE  "url" LIKE '/uploads/%'
  AND  "url" NOT LIKE 'http://%'
  AND  "url" NOT LIKE 'https://%';

UPDATE "categories"
SET    "image_url" = 'https://api.xovenmart.com' || "image_url"
WHERE  "image_url" IS NOT NULL
  AND  "image_url" LIKE '/uploads/%'
  AND  "image_url" NOT LIKE 'http://%'
  AND  "image_url" NOT LIKE 'https://%';

UPDATE "banners"
SET    "image_url" = 'https://api.xovenmart.com' || "image_url"
WHERE  "image_url" LIKE '/uploads/%'
  AND  "image_url" NOT LIKE 'http://%'
  AND  "image_url" NOT LIKE 'https://%';

UPDATE "banners"
SET    "mobile_image_url" = 'https://api.xovenmart.com' || "mobile_image_url"
WHERE  "mobile_image_url" IS NOT NULL
  AND  "mobile_image_url" LIKE '/uploads/%'
  AND  "mobile_image_url" NOT LIKE 'http://%'
  AND  "mobile_image_url" NOT LIKE 'https://%';
