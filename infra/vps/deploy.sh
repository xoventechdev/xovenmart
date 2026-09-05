#!/usr/bin/env bash
# =============================================================================
# XovenMart — VPS deploy script (called by GitHub Actions over SSH)
# =============================================================================
# Usage:  bash deploy.sh <ref>
#
#   <ref>  — either "manual-bootstrap" (initial deploy, no git fetch)
#            or a tag/branch/SHA the working clone should check out.
#
# Layout (created by bootstrap.sh):
#
#   /var/www/xovenmart/
#   ├── repo/                       working clone (depth=50, origin authed)
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
# 0. Fetch latest code
# -----------------------------------------------------------------------------
if [[ "$REF" != "manual-bootstrap" ]]; then
  log "Fetching latest from origin..."
  git -C "$APP/repo" remote update origin --prune
  # Verify the ref resolves (GitHub sends a SHA; manual-bootstrap is a sentinel).
  if ! git -C "$APP/repo" rev-parse --verify "$REF^{commit}" >/dev/null 2>&1; then
    err "Ref '$REF' does not resolve to a commit"
    exit 1
  fi
  # Check out the ref in the working clone so the files we'll copy match.
  git -C "$APP/repo" checkout -f "$REF"
else
  log "manual-bootstrap mode: skipping git fetch (using whatever is checked out)"
fi

# -----------------------------------------------------------------------------
# Helper: copy a tree of files from $APP/repo into a fresh release dir.
# Excludes .git, node_modules, .next/cache, *.log so each release is light.
# -----------------------------------------------------------------------------
materialize_release() {
  local dst="$1"
  log "Materializing release at $dst..."
  mkdir -p "$dst"
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next/cache' \
    --exclude='*.log' \
    --exclude='.env*' \
    --exclude='!.env.example' \
    --exclude='!.env.production.example' \
    "$APP/repo/" "$dst/"
}

# -----------------------------------------------------------------------------
# 1. Materialize API release
# -----------------------------------------------------------------------------
materialize_release "$API_NEW"

cd "$API_NEW"

# Copy in node_modules from the previous release to avoid re-downloading
# every package on every deploy (most deps don't change).
if [[ -d "$APP/api/shared/node_modules" ]]; then
  rm -rf node_modules
  cp -al "$APP/api/shared/node_modules" ./node_modules
fi

# Install (idempotent; frozen lockfile).
# NOTE: we do NOT set NODE_ENV=production here — packages/db needs `prisma`
# (devDep) to run `prisma generate`, and apps/api needs `typescript` + `nest`
# to run `nest build`. Production-only install would skip all devDeps and
# the build would fail with "prisma: not found".
log "Running pnpm install..."
pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -10

# Refresh the shared node_modules cache so the next deploy gets a head start.
log "Refreshing shared node_modules cache..."
rm -rf "$APP/api/shared/node_modules"
cp -al ./node_modules "$APP/api/shared/node_modules"

# Generate Prisma client.
log "Generating Prisma client..."
DATABASE_URL_VAL="$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)"
DATABASE_URL="$DATABASE_URL_VAL" \
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
SCHEMA=""
for candidate in \
  "$API_NEW/deploy/schema.sql" \
  "$APP/repo/deploy/schema.sql" \
  "$API_NEW/apps/api/deploy/schema.sql" ; do
  if [[ -f "$candidate" ]]; then
    SCHEMA="$candidate"
    break
  fi
done

# Fallback: generate schema.sql on the VPS from the Prisma schema using the
# just-installed prisma binary. Same trick as the cPanel workflow.
if [[ -z "$SCHEMA" ]]; then
  log "schema.sql not found in release tree — generating from Prisma schema..."
  SCHEMA="/tmp/schema.sql"
  GENERATED=""
  for schemapath in \
    "$API_NEW/packages/db/prisma/schema.prisma" \
    "$API_NEW/apps/api/prisma/schema.prisma" ; do
    if [[ -f "$schemapath" ]]; then
      GEN_DIR="$(dirname "$schemapath")"
      (
        cd "$GEN_DIR"
        DATABASE_URL_VAL="$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)"
        DATABASE_URL="$DATABASE_URL_VAL" \
          "$API_NEW/node_modules/.bin/prisma" migrate diff \
            --from-empty \
            --to-schema-datamodel schema.prisma \
            --script > "$SCHEMA" 2>/tmp/schema-gen.log
      ) && GENERATED="yes"
      break
    fi
  done
  if [[ "$GENERATED" != "yes" ]] || [[ ! -s "$SCHEMA" ]]; then
    warn "could not generate schema.sql ($(tail -3 /tmp/schema-gen.log 2>/dev/null)) — skipping DB import"
    SCHEMA=""
  else
    # Prepend the pg_trgm extension. We do NOT seed the admin user here —
    # admin_users doesn't exist yet when CREATE TYPE/CREATE TABLE run, and
    # the INSERT would silently fail. The admin user is seeded AFTER the
    # schema import, in the block below (idempotent ON CONFLICT).
    TMP="${SCHEMA}.tmp"
    {
      echo "-- Generated locally on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
      cat "$SCHEMA"
    } > "$TMP"
    mv "$TMP" "$SCHEMA"
    log "schema.sql generated locally: $(wc -l < "$SCHEMA") lines"
  fi
fi

if [[ -n "$SCHEMA" ]] && [[ -f "$SCHEMA" ]]; then
  DATABASE_URL_VAL="$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)"
  DB_PASS="$(printf '%s' "$DATABASE_URL_VAL" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')"
  DB_USER="$(printf '%s' "$DATABASE_URL_VAL" | sed -E 's#^postgresql://([^:]+):.*#\1#')"
  cd "$APP/api"
  PGPASSWORD="$DB_PASS" sudo -u postgres --preserve-env=PGPASSWORD \
    psql -d xovenmart -v ON_ERROR_STOP=0 -f "$SCHEMA" >/tmp/schema-import.log 2>&1 \
    && log "schema.sql imported as user=$DB_USER" \
    || warn "schema.sql had some errors (likely 'already exists' — continuing): $(tail -5 /tmp/schema-import.log)"
  cd "$API_NEW"

  # ── Bug fix #1 ─────────────────────────────────────────────────────────
  # BUG: psql imported the schema as the `postgres` superuser, so all tables
  # were owned by `postgres`. The API connects as `xovenmart_app` (non-owner)
  # and gets `42501 permission denied` on every query.
  # FIX: grant all on schema + tables + sequences + set default privileges so
  # future tables (e.g. from prisma migrate) are also granted automatically.
  log "Granting schema/table/sequence privileges to $DB_USER..."
  PGPASSWORD="$DB_PASS" sudo -u postgres --preserve-env=PGPASSWORD \
    psql -d xovenmart -v ON_ERROR_STOP=0 >/tmp/schema-grants.log 2>&1 <<EOF || warn "grants had warnings: $(tail -5 /tmp/schema-grants.log)"
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

  # ── Bug fix #2 ─────────────────────────────────────────────────────────
  # BUG: my original "auto-generate" schema.sql prepend tried to INSERT into
  # Generate a random 24-char admin password at deploy time. The password
  # is written once to /root/.xovenmart-bootstrap-admin.txt (mode 0600)
  # and printed in the deploy log so the operator can fetch it via SSH.
  # NEVER bake a default password into a script that might run in prod.
  log "Seeding bootstrap admin user (idempotent)..."
  BCryptJS=$(find "$API_NEW/node_modules" -maxdepth 6 -name 'bcryptjs' -type d 2>/dev/null | grep -v '@types' | head -1)
  if [[ -n "$BCryptJS" ]]; then
    ADMIN_BOOTSTRAP_PWD=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 24)
    ADMIN_HASH=$(node -e "const b=require('$BCryptJS'); console.log(b.hashSync(process.env.ADMIN_BOOTSTRAP_PWD,10));" ADMIN_BOOTSTRAP_PWD="$ADMIN_BOOTSTRAP_PWD" 2>/dev/null | tail -1)
    if [[ "$ADMIN_HASH" =~ ^\$2[ayb]\$ ]]; then
      PGPASSWORD="$DB_PASS" sudo -u postgres --preserve-env=PGPASSWORD \
        psql -d xovenmart -v ON_ERROR_STOP=0 >/tmp/admin-seed.log 2>&1 <<EOF || warn "admin seed warning: $(tail -3 /tmp/admin-seed.log)"
INSERT INTO admin_users (id, email, password_hash, name, role, is_active, created_at, updated_at)
VALUES ('c-bootstr4d', 'admin@xovenmart.com', '$ADMIN_HASH', 'Site Admin', 'ADMIN', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW();
EOF
      # Stash the password for one-time retrieval. Operator MUST change it
      # on first login and delete the file.
      echo "$ADMIN_BOOTSTRAP_PWD" > /root/.xovenmart-bootstrap-admin.txt
      chmod 600 /root/.xovenmart-bootstrap-admin.txt
      log "bootstrap admin user ready (email=admin@xovenmart.com). One-time random password written to /root/.xovenmart-bootstrap-admin.txt — copy it, sign in, change it, then delete the file."
    else
      warn "could not generate bcrypt hash; admin user not seeded. bcryptjs output: ${ADMIN_HASH:0:30}"
    fi
  else
    warn "bcryptjs not found in node_modules; admin user not seeded"
  fi
fi

# -----------------------------------------------------------------------------
# 3. Swap API symlink + reload PM2
# -----------------------------------------------------------------------------
log "Swapping API current → $TS..."
ln -sfn "$API_NEW" "$APP/api/current"

log "Reloading PM2 (api)..."
# ecosystem.config.js lives at $APP/api/ecosystem.config.js (installed by bootstrap.sh).
cd "$APP/api"
# pm2 reload keeps the same process name, gracefully restarts workers.
# --update-env makes sure .env changes are picked up.
pm2 reload ecosystem.config.js --only xovenmart-api --update-env || {
  err "pm2 reload failed — rolling back symlink"
  PREV=$(ls -1t "$API_RELEASES" | grep -v "^$TS$" | head -1)
  [[ -n "$PREV" ]] && ln -sfn "$API_RELEASES/$PREV" "$APP/api/current"
  exit 1
}

# -----------------------------------------------------------------------------
# 4. Materialize Web release (mirror of API)
# -----------------------------------------------------------------------------
materialize_release "$WEB_NEW"

cd "$WEB_NEW"

if [[ -d "$APP/web/shared/node_modules" ]]; then
  rm -rf node_modules
  cp -al "$APP/web/shared/node_modules" ./node_modules
fi

log "Running pnpm install (web)..."
# NOTE: no NODE_ENV=production — apps/web needs `next` (devDep) for build,
# and other devDeps are needed for the build toolchain.
pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -10

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
cd "$APP/api"
pm2 reload ecosystem.config.js --only xovenmart-web --update-env || {
  err "pm2 reload (web) failed — rolling back"
  PREV_WEB=$(ls -1t "$WEB_RELEASES" | grep -v "^$TS$" | head -1)
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
  PREV_API=$(ls -1t "$API_RELEASES" | grep -v "^$TS$" | head -1)
  PREV_WEB=$(ls -1t "$WEB_RELEASES" | grep -v "^$TS$" | head -1)
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
cd "$APP/api"
pm2 save --force >/dev/null

# -----------------------------------------------------------------------------
# 7. Optional seed (only when RUN_SEED=1 is exported by the operator)
#
# The seed script lives at packages/db/prisma/seed.ts. Running it against the
# live DB is safe (idempotent — uses upsert by slug/email/code), but it can
# be slow against a large DB and is unnecessary on every deploy.
#
# Trigger with:
#   sudo -u deploy RUN_SEED=1 bash /var/www/xovenmart/deploy.sh <ref>
# -----------------------------------------------------------------------------
if [[ "${RUN_SEED:-0}" == "1" ]]; then
  log "RUN_SEED=1 — running Prisma seed against live DB..."
  cd "$API_NEW"
  DATABASE_URL_VAL="$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)"
  DATABASE_URL="$DATABASE_URL_VAL" \
    pnpm --filter @xovenmart/db seed 2>&1 | tail -40 \
    && log "seed complete (check above for counts)" \
    || warn "seed had warnings (continuing deploy)"
else
  log "skipping seed (set RUN_SEED=1 to run packages/db/prisma/seed.ts)"
fi

log "✓ deploy complete: $TS"