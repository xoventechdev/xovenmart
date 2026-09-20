# Product image recovery — browser cache + re-upload

**Situation:** 92 product images uploaded via `POST /admin/media/upload-file`
are recorded in the DB as URLs like
`https://api.xovenmart.com/uploads/2026-09-18/abc123.png` but the files
themselves are gone (lost when the API container was recreated before
the `api_uploads` persistent volume was added).

The images may still be in **your browser's HTTP cache** — that's why
they appear on your device but not to other customers. The cache is
the only realistic recovery source.

## What's in this folder

- `fetch-broken-inventory.mjs` — Node script. Fetches the live catalog
  and writes `broken-inventory.json` (92 broken URLs + product info).
  **Already run; `broken-inventory.json` is committed.**
- `broken-inventory.json` — the inventory. 92 entries with product
  slug, name (Bn/En), unit, full URL, and `urlTail` (the
  `YYYY-MM-DD/abc.png` part that matches the on-disk path).
- `reconcile-dead-images.mjs` — Node script. Lists every `ProductImage`
  row in the DB (via `GET /admin/media/images`), classifies each URL
  as `base64` / `fileOnDisk` / `external`, HEAD-checks every
  file-on-disk URL, then prints a live-vs-dead report. Run with
  `--apply` to delete the dead rows (writes a backup file first).
- `cache-extract.html` — single-file HTML page. **First attempt —
  known to fail** because the API sends `Vary: Origin` on image
  responses, and the page runs on `http://localhost:8765` which is a
  different origin than `https://xovenmart.com` where the cache is
  warm. Kept for reference. Use the bookmarklet instead.
- `cache-extract-bookmarklet.html` — single-file HTML page. **Use this
  for Stage 1.** It installs a bookmarklet into your bookmarks bar
  that runs the same extractor INSIDE any open
  `https://xovenmart.com/*` page, where the cache is warm and the
  origin matches. Drag the "XovenMart recover" link to your bookmarks
  bar, then click it while on `https://xovenmart.com`.
- `build-bookmarklet.mjs` — re-inlines the inventory into the
  bookmarklet HTML. Run after re-running `fetch-broken-inventory.mjs`
  to refresh.
- `reupload.html` — single-file HTML page for the second stage. Self-
  contained login form + inventory-aware uploader. Lets you pick files
  from disk and uploads them via `POST /admin/media/upload-file`.
  Persisted to the new `api_uploads` volume.
- `package.json` — `npm run serve` starts a local static server on
  port 8765 so `reupload.html` can fetch `broken-inventory.json`
  (browsers block `file://` fetches). `npm run inventory` re-fetches
  the inventory.

## How to recover

### Stage 1 — extract from browser cache (auto, 5 min)

The previous `cache-extract.html` attempt failed because the API
sets `Vary: Origin` and the page was loaded from `localhost:8765`
(a different origin from `xovenmart.com`, where the cache is warm).
Use the **bookmarklet** instead — it runs inside a page already
served from `xovenmart.com`, where the origin matches.

1. Make sure Chrome is open and you've visited `https://xovenmart.com`
   (or any product page) recently so the images are warm in cache.
2. Open `cache-extract-bookmarklet.html` from this folder in Chrome
   (double-click the file). Show the bookmarks bar with
   <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>.
3. Drag the blue **"XovenMart recover"** link to your bookmarks bar.
4. Open (or refresh) `https://xovenmart.com`.
5. Click the **XovenMart recover** bookmark. A floating panel appears
   in the top-right.
6. Click **Start**. The panel walks the 92 URLs, asks the browser for
   each from cache (no network), and downloads recovered ones to
   `Downloads/xovenmart-recovery/`.
7. When done, click **Download manifest** to save a JSON record of
   what was recovered vs. what was missing.

If the bookmarklet shows "0 recovered", your cache may have been
cleared between sessions (Chrome clears cache on close by default in
some setups). Open the storefront, click around a few product pages
to warm the cache, then click the bookmarklet again.

### Stage 2 — re-upload the rest (manual, ~10–30 min)

For URLs the cache didn't have, use `reupload.html`:

1. From this folder, run `npx http-server -p 8765` (or `npm run serve`).
2. Open `http://localhost:8765/reupload.html` in Chrome.
3. Sign in with your admin email + password (the same one you use for
   `https://admin.xovenmart.com`). The token stays in this browser
   session only.
4. The page shows one product at a time with the broken URL visible.
   Click "Choose file", pick the original image, click "Upload".
   The page advances to the next product automatically.
5. Use "Skip" to come back later, or "Mark lost" if the original
   image is gone for good.
6. Each upload goes to the new `api_uploads` volume (persistent).

### Stage 3 — verify

After either stage:

```bash
# Pick a previously-broken URL and check it now:
curl -I https://api.xovenmart.com/uploads/2026-09-18/70689ab1a0675cc6.png
# → HTTP/2 200, Content-Type: image/png
```

### Stage 4 — reconcile the DB (after Part 1 ships)

The 92 broken images are now permanently dead — even after Stage 1/2
recovered the original files, the *DB* still holds URL pointers to
non-existent files for any image the cache didn't have. The
reconciliation script removes those dead DB rows.

```bash
cd tools/recovery
node reconcile-dead-images.mjs          # dry-run — prints live/dead report
node reconcile-dead-images.mjs --apply  # deletes dead rows (writes backup first)
# Or via npm:
npm run reconcile
npm run reconcile:apply
```

You'll need admin credentials. The script:
1. Signs in as admin.
2. Fetches every `ProductImage` row via the admin API.
3. Splits into `base64` (always live) / `fileOnDisk` (HEAD-checked) /
   `external` (skipped, we don't own those).
4. **Dry-run:** prints a report with live and dead counts. No DB writes.
5. **`--apply`:** writes `reconciliation-backup.json` (every row it
   would delete, fully restorable), then DELETEs the dead rows. Asks
   for `YES` confirmation before the deletes.

If you ever want to re-check after a deploy or volume move, the
dry-run is safe to run any time.

## Why not just SSH into the VPS and recover from a snapshot?

The images never reached a persistent disk on the VPS — they only
existed inside the API container's writable layer. The Hetzner snapshot
of the VPS disk would include that writable layer IF the snapshot was
taken before the API container was recreated. But I can't reach your
Hetzner account from here; that's a manual step for you if you have
the snapshot enabled.

## Why not pull from R2 / Wayback?

- The code path that uploaded these images never wrote to R2
  (`MediaStorageService.save` writes to local disk only; the
  `R2_*` env vars are set up but not wired into the upload flow).
- The product pages on `xovenmart.com` were never public-indexed
  with the images inline (they're loaded as `<img src>`), so
  Wayback Machine didn't capture them.
- Cloudflare cache: if the image URLs were hit frequently enough,
  Cloudflare's edge might have them. Try
  `curl -I https://api.xovenmart.com/uploads/2026-09-18/70689ab1a0675cc6.png -H 'Cache-Purge: 1'`
  — if Cloudflare returns a HIT, the bytes are recoverable via a
  similar script pointed at Cloudflare's edge instead of local cache.

