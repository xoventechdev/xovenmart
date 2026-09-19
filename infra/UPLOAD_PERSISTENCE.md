# Upload persistence — recovery + deploy procedure

## Background

Product images uploaded via `POST /admin/media/upload-file` are saved to
`/repo/apps/api/uploads/YYYY-MM-DD/<id>.<ext>` **inside the API container**.
Until 2026-09-19 there was NO persistent volume mounted at that path —
so every container restart (Coolify redeploy, OOM kill, healthcheck fail)
wiped the directory and images 404'd.

This file is the one-time recovery procedure for any images already on
disk in the running container, plus the deploy steps for the new
`api_uploads` volume.

---

## Step 1 — Salvage existing uploads BEFORE redeploy

**Critical:** this must run BEFORE the next Coolify deploy. Once the new
`api_uploads` volume is bound, the API container will be recreated and
its writable layer is gone.

```bash
# From the VPS, as root or a user in the `docker` group:

# 1. Find the API container's image-mount root (its writable layer).
#    This is where the files actually live on the host filesystem.
docker inspect xovenmart-api \
  --format '{{index .GraphDriver.Data "UpperDir"}}'
# → outputs something like:
#    /var/lib/docker/overlay2/abc123.../diff
#    COPY THAT PATH — you'll need it in step 2.

# 2. Check what's actually inside the container at the upload path:
docker exec xovenmart-api ls /repo/apps/api/uploads/
# Expected: a list of YYYY-MM-DD/ directories. If empty, no files to
# salvage — skip to Step 2.

# 3. Tar everything out of the container into a host-side scratch dir:
mkdir -p /opt/xovenmart-salvage/uploads
docker exec xovenmart-api \
  tar Ccf /repo/apps/api - uploads \
  | tar Cxf /opt/xovenmart-salvage/ -
# -C /repo/apps/api = `cd` into the upload root inside the container
# `uploads` is the dirname we tar
# The pipe extracts into /opt/xovenmart-salvage/ → produces
#   /opt/xovenmart-salvage/uploads/2026-09-18/70689ab1a0675cc6.png
#   /opt/xovenmart-salvage/uploads/2026-09-19/...

# 4. Verify the salvage:
find /opt/xovenmart-salvage/uploads -type f | head
find /opt/xovenmart-salvage/uploads -type f | wc -l
# → should match the count of files you saw inside the container.
```

If step 3 fails with "No such file or directory" — the container has no
uploads at all, which means everything was stored as base64 in the DB
(the `data:image/png;base64,...` rows). No salvage needed.

## Step 2 — Deploy with the new `api_uploads` volume

Push from dev:

```bash
git add infra/docker-compose.yml N8N_PROGRESS.md \
        infra/UPLOAD_PERSISTENCE.md
git commit -m "fix(infra): persist product uploads across container restarts

Adds a named 'api_uploads' docker volume bound to
/repo/apps/api/uploads so files written by POST /admin/media/upload-file
survive Coolify redeploys. Without this, every redeploy wipes the
upload directory and previously-uploaded images 404.

The UPLOAD_DIR env var is now set explicitly so the API doesn't fall
back to its walk-up-from-CWD heuristic — a future Dockerfile WORKDIR
change can't silently move the upload root."
git push xovenmart main
```

Coolify will rebuild and restart the api service with the new volume
mount. The container's writable layer is discarded — that's why Step 1
must happen FIRST.

## Step 3 — Re-inject salvaged files into the new volume

After Coolify reports the deploy as healthy:

```bash
# 1. Verify the new volume is mounted and empty:
docker exec xovenmart-api ls /repo/apps/api/uploads/
# → likely empty (fresh volume)

# 2. Copy the salvaged files INTO the new volume via the container:
#    Same tar-pipe trick, reversed:
cat /opt/xovenmart-salvage/uploads.tar | \
  docker exec -i xovenmart-api \
    tar Cxf /repo/apps/api -
# Wait — we didn't make a tar above. If you tar'd step 3 of Step 1
# into a file:
docker exec -i xovenmart-api \
  tar Cxf /repo/apps/api - < /opt/xovenmart-salvage/uploads.tar

# OR, simpler if you have the files in /opt/xovenmart-salvage/uploads/:
docker cp /opt/xovenmart-salvage/uploads/. \
  xovenmart-api:/repo/apps/api/uploads/

# 3. Verify from the host (the API now serves them):
docker exec xovenmart-api \
  ls /repo/apps/api/uploads/$(date -u +%Y-%m-%d)/
# OR for the date you salvaged:
docker exec xovenmart-api \
  ls /repo/apps/api/uploads/2026-09-18/

# 4. From your laptop, fetch one of the previously-broken URLs:
curl -I https://api.xovenmart.com/uploads/2026-09-18/70689ab1a0675cc6.png
# → HTTP/2 200, Content-Type: image/png
```

## Step 4 — Clean up the salvage dir

Once you've confirmed the prod URLs work:

```bash
rm -rf /opt/xovenmart-salvage
```

## Why this doesn't fix base64-in-DB images

The `POST /admin/media/upload` (legacy JSON endpoint) embeds the image
bytes directly into `ProductImage.url` as a `data:image/png;base64,...`
string. Those rows are unaffected by the volume change — they always
rendered because the image bytes travel with every HTML payload.

To convert them to file-on-disk (smaller DB, faster catalog queries,
removable via DELETE endpoint instead of UPDATE), run the migration
script that's part of Phase 2 (TODO: scripts/migrate-base64-images.ts).
Until that runs, the data URL rows keep working as-is.

## Future uploads

After this fix lands:

- New uploads via the admin UI land at
  `/repo/apps/api/uploads/YYYY-MM-DD/<id>.<ext>` inside the container,
  which is now the `api_uploads` volume — persistent across deploys.
- The `express.static` mount at `/uploads/*` (wired in `main.ts:189`)
  serves them at `https://api.xovenmart.com/uploads/...`.
- If the API container is ever COMPLETELY recreated (rare — only if
  Docker itself loses the volume, e.g., a `docker volume prune`), the
  uploads are gone, but the `ProductImage.url` strings still point at
  the old paths and the storefront will show broken images. Recovery
  from THAT scenario is: nightly backup of the `api_uploads` volume.
  (Not yet implemented — TODO for Phase 4 if file uploads grow large.)

## Rollback

If the new volume mount breaks something, revert with:

```bash
git revert HEAD
git push xovenmart main
```

Files already written to the volume will survive the revert (named
volumes are NOT deleted by container recreation). So a rollback doesn't
lose uploads — but the writable-layer files from BEFORE the new volume
mount were already gone (that was the bug).