-- Strip the four base64-encoded brand images from app_settings.
-- Each PNG was uploaded as a data URL ("data:image/png;base64,…")
-- and stored in `value`, ballooning the table to 6.4 MB and making
-- /settings/public/general ship 6 MB on every page load.
--
-- The frontend (general.public.controller.ts) falls back to the
-- inline BrandMark SVG when brand.logoUrl etc. are empty strings,
-- so emptying these is safe and recovers the full performance
-- without re-uploading anything.
--
-- Proper fix (separate task): replace the admin upload flow so it
-- stores URLs to /uploads/... instead of inlining base64, AND
-- add an enforced size cap on app_settings.value so this can't
-- silently regress.

BEGIN;

UPDATE app_settings
SET value = '""',
    updated_at = now()
WHERE key IN (
    'brand.logoUrl',
    'brand.logoDarkUrl',
    'brand.faviconUrl',
    'brand.ogImageUrl'
)
RETURNING key, LENGTH(value) AS new_size_bytes;

-- Bust the api's in-memory cache by touching a sentinel key it
-- watches. settings.service.ts subscribes to "settings.cacheBust"
-- on its notifications module; flipping this key forces a re-read.
INSERT INTO app_settings (key, value, updated_by, updated_at)
VALUES ('_cacheBust', jsonb_build_object('at', extract(epoch from now()))::text, 'strip-base64-brand-images.sql', now())
ON CONFLICT (key) DO UPDATE
   SET value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at;

COMMIT;
