#!/usr/bin/env bash
# =============================================================================
# XovenMart — VPS deploy script (called by GitHub Actions over SSH)
# =============================================================================
# Usage:  bash deploy.sh <ref>
#
#   <ref>  — either "manual-bootstrap" (initial deploy without git pull)
#            or a tag/branch/SHA the bare repo should check out.
#
# Layout (created by bootstrap.sh):
#
#   /var/www/xovenmart/
#   ├── repo/                       bare git repo
#   ├── api/
#   │   ├── releases/<TS>/          full source tree per release
#   │   ├── current -> releases/<TS>      active release (atomically swapped)
#   │   └── shared/
#   │       ├── .env                secrets (operator-managed)
#   │       └── node_modules/       cached across releases
#   ├── web/  (same shape as api/)
#   └── backups/postgres/           daily pg_dump output
#
# Triggered by .github/workflows/deploy-api-vps.yml on push to main.
# =============================================================================

set -euo pipefail

REF="${1:-main}"
APP=/var/www/xovenmart
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
API_RELEASES=$APP/api/releases
WEB_RELEASES=$APP/web/releases
API_NEW=$API_RELEASES/$TS
WEB_NEW=$WEB_RELEASES/$TS
KEEP_RELEASES=5   # delete older releases beyond this count

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; }

# Run as the deploy user unless we're already deploy.
if [[ "$(whoami)" == "root" ]]; then
  err "do not run as root — this script must run as the 'deploy' user"
  exit 1
fi

if [[ ! -f "$APP/api/shared/.env" ]]; then
  err "$APP/api/shared/.env missing. Did you run bootstrap.sh?"
  exit 1
fi
if [[ ! -f "$APP/web/shared/.env.production" ]]; then
  err "$APP/web/shared/.env.production missing. Did you run bootstrap.sh?"
  exit 1
fi

# -----------------------------------------------------------------------------
# 0. Fetch latest code into the bare repo
# -----------------------------------------------------------------------------
if [[ "$REF" != "manual-bootstrap" ]]; then
  log "Fetching latest from origin..."
  git --git-dir="$APP/repo" remote update origin --prune
  # Verify the ref resolves (GitHub sends a SHA; manual-bootstrap is a sentinel).
  if ! git --git-dir="$APP/repo" rev-parse --verify "$REF^{commit}" >/dev/null 2>&1; then
    err "Ref '$REF' does not resolve to a commit"
    exit 1
  fi
else
  log "manual-bootstrap mode: skipping git fetch"
fi

# -----------------------------------------------------------------------------
# 1. Materialize API release
# -----------------------------------------------------------------------------
log "Materializing API release at $API_NEW..."
mkdir -p "$API_NEW"
git --git-dir="$APP/repo" --work-tree="$API_NEW" checkout -f "${REF:-main}"

cd "$API_NEW"

# Copy in node_modules from the previous release to avoid re-downloading
# every package on every deploy (most deps don't change).
if [[ -d "$APP/api/shared/node_modules" ]]; then
  rm -rf node_modules
  cp -al "$APP/api/shared/node_modules" ./node_modules
fi

# Install (idempotent; frozen lockfile + --prod because dev deps already live
# on the build runner in the GitHub workflow).
log "Running pnpm install..."
pnpm install --frozen-lockfile --prod --ignore-scripts 2>&1 | tail -10

# Refresh the shared node_modules cache so the next deploy gets a head start.
log "Refreshing shared node_modules cache..."
rm -rf "$APP/api/shared/node_modules"
cp -al ./node_modules "$APP/api/shared/node_modules"

# Generate Prisma client.
log "Generating Prisma client..."
DATABASE_URL="$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)" \
  pnpm --filter @xovenmart/db generate 2>&1 | tail -5

# Build app (idempotent — tsc + nest).
log "Building API..."
pnpm --filter @xovenmart/api build 2>&1 | tail -10

if [[ ! -f "$API_NEW/apps/api/dist/main.js" ]]; then
  err "API build did not produce apps/api/dist/main.js — aborting"
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Database schema import (idempotent)
# -----------------------------------------------------------------------------
log "Importing schema.sql (idempotent — CREATE IF NOT EXISTS)..."
SCHEMA=$API_NEW/deploy/schema.sql
if [[ ! -f "$SCHEMA" ]]; then
  warn "schema.sql missing at $SCHEMA — assuming the DB is already up to date"
else
  PGPASSWORD=...
  # shellcheck disable=SC1091
  DATABASE_URL="$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)"
  cd "$APP/api"
  sudo -u postgres psql -d xovenmart -v ON_ERROR_STOP=0 -f "$SCHEMA" >/tmp/schema-import.log 2>&1 \
    && log "schema.sql imported" \
    || warn "schema.sql had some errors (likely 'already exists' — continuing): $(tail -5 /tmp/schema-import.log)"
fi

# -----------------------------------------------------------------------------
# 3. Swap API symlink + reload PM2
# -----------------------------------------------------------------------------
log "Swapping API current → $TS..."
ln -sfn "$API_NEW" "$APP/api/current"

log "Reloading PM2 (api)..."
# pm2 reload keeps the same process name, gracefully restarts workers.
# --update-env makes sure .env changes are picked up.
pm2 reload ecosystem.config.js --only xovenmart-api --update-env || {
  err "pm2 reload failed — rolling back symlink"
  ln -sfn "$(ls -1t $API_RELEASES | grep -v "^$TS$" | head -1)" "$APP/api/current" || true
  exit 1
}

# -----------------------------------------------------------------------------
# 4. Materialize Web release (mirror of API)
# -----------------------------------------------------------------------------
log "Materializing web release at $WEB_NEW..."
mkdir -p "$WEB_NEW"
git --git-dir="$APP/repo" --work-tree="$WEB_NEW" checkout -f "${REF:-main}"

cd "$WEB_NEW"

if [[ -d "$APP/web/shared/node_modules" ]]; then
  rm -rf node_modules
  cp -al "$APP/web/shared/node_modules" ./node_modules
fi

log "Running pnpm install (web)..."
pnpm install --frozen-lockfile --prod --ignore-scripts 2>&1 | tail -10

log "Refreshing shared node_modules cache (web)..."
rm -rf "$APP/web/shared/node_modules"
cp -al ./node_modules "$APP/web/shared/node_modules"

# IMPORTANT: NEXT_PUBLIC_* values must be present in the build environment.
# We source them from web/shared/.env.production before `next build`.
log "Building Next.js (web)..."
set -a
# shellcheck disable=SC1091
source "$APP/web/shared/.env.production"
set +a
NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
NEXT_PUBLIC_OSM_TILE_URL="$NEXT_PUBLIC_OSM_TILE_URL" \
NEXT_PUBLIC_UMAMI_WEBSITE_ID="$NEXT_PUBLIC_UMAMI_WEBSITE_ID" \
UMAMI_URL="$UMAMI_URL" \
  pnpm --filter @xovenmart/web build 2>&1 | tail -10

if [[ ! -d "$WEB_NEW/apps/web/.next" ]]; then
  err "Web build did not produce .next/ — aborting"
  exit 1
fi

log "Swapping web current → $TS..."
ln -sfn "$WEB_NEW" "$APP/web/current"

log "Reloading PM2 (web)..."
pm2 reload ecosystem.config.js --only xovenmart-web --update-env || {
  err "pm2 reload (web) failed — rolling back"
  PREV_WEB=$(ls -1t $WEB_RELEASES | grep -v "^$TS$" | head -1)
  [[ -n "$PREV_WEB" ]] && ln -sfn "$WEB_RELEASES/$PREV_WEB" "$APP/web/current"
  exit 1
}

# -----------------------------------------------------------------------------
# 5. Smoke test
# -----------------------------------------------------------------------------
log "Smoke test: GET http://127.0.0.1:3001/api/v1/health"
HEALTH=$(curl -fsS -m 10 http://127.0.0.1:3001/api/v1/health || echo "")
if [[ "$HEALTH" != *'"status":"ok"'* ]]; then
  err "health check failed — response: $HEALTH"
  err "rolling back"
  PREV_API=$(ls -1t $API_RELEASES | grep -v "^$TS$" | head -1)
  PREV_WEB=$(ls -1t $WEB_RELEASES | grep -v "^$TS$" | head -1)
  [[ -n "$PREV_API" ]] && ln -sfn "$API_RELEASES/$PREV_API" "$APP/api/current" && pm2 reload xovenmart-api
  [[ -n "$PREV_WEB" ]] && ln -sfn "$WEB_RELEASES/$PREV_WEB" "$APP/web/current" && pm2 reload xovenmart-web
  exit 1
fi
log "smoke OK: $HEALTH"

# -----------------------------------------------------------------------------
# 6. Cleanup old releases (keep last KEEP_RELEASES)
# -----------------------------------------------------------------------------
log "Pruning old releases (keeping last $KEEP_RELEASES)..."
for app_dir in api web; do
  RELEASES_PATH="$APP/$app_dir/releases"
  COUNT=$(ls -1t "$RELEASES_PATH" 2>/dev/null | wc -l)
  if (( COUNT > KEEP_RELEASES )); then
    ls -1t "$RELEASES_PATH" | tail -n +$((KEEP_RELEASES + 1)) | while read -r OLD; do
      rm -rf "${RELEASES_PATH:?}/$OLD"
      log "  deleted ${app_dir}/releases/$OLD"
    done
  fi
done

# Persist ecosystem config so PM2 re-creates apps on next pm2 resurrect.
pm2 save --force >/dev/null

log "✓ deploy complete: $TS"
