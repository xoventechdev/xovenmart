#!/usr/bin/env bash
# =============================================================================
# cpanel-restart.sh — restart the XovenMart API after a fresh upload.
#
# Called by the GitHub Actions deploy workflow via:
#   1) SFTP upload of .deploy-trigger (or via a webhook)
#   2) This script is invoked through cPanel's Cron + a tiny "trigger watcher"
#      OR through cPanel's Terminal / SSH if available.
#
# What it does:
#   1. cd into the app directory
#   2. install production-only deps (uses lockfile)
#   3. run `prisma generate` so @prisma/client + engines match the schema
#   4. (optional) `prisma db push --skip-generate` to apply pending migrations
#   5. touch a tmp file so cPanel's Process Manager restarts the Node app
#      (CloudLinux "Setup Node.js App" auto-restarts on file changes)
#
# Required env (cPanel "Setup Node.js App" → Environment variables):
#   APP_DIR         /home/<cpanel-user>/xovenmart-api
#   PRISMA_DEPLOY   "true" if you want schema sync, "false" otherwise
#   NODE_ENV        production
#   DATABASE_URL    postgresql://user:pass@localhost:5432/xovenmart
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/home/<cpanel-user>/xovenmart-api}"
PRISMA_DEPLOY="${PRISMA_DEPLOY:-true}"
LOG="$APP_DIR/deploy.log"

log()  { printf "[%s] %s\n" "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*" | tee -a "$LOG"; }
fail() { log "ERROR: $*"; exit 1; }

[ -d "$APP_DIR" ] || fail "App directory $APP_DIR does not exist"
cd "$APP_DIR"

log "=== deploy start (PID $$) ==="
log "APP_DIR=$APP_DIR"
log "PRISMA_DEPLOY=$PRISMA_DEPLOY"

# ---------------------------------------------------------------------------
# 1) Install production deps + workspace package
# ---------------------------------------------------------------------------
log "[1/4] pnpm install --prod --frozen-lockfile"
# Use --ignore-scripts to skip any postinstall hooks that may not be needed
# in production (e.g. husky, copy-brand-assets). Re-enable per project.
pnpm install --prod --frozen-lockfile --ignore-scripts 2>&1 | tail -5 | tee -a "$LOG" \
  || fail "pnpm install failed"

# ---------------------------------------------------------------------------
# 2) Generate Prisma client (must run after install, before first request)
# ---------------------------------------------------------------------------
log "[2/4] prisma generate"
( cd packages/db && npx prisma generate ) 2>&1 | tail -5 | tee -a "$LOG" \
  || fail "prisma generate failed"

# ---------------------------------------------------------------------------
# 3) Push schema (optional — keep in sync with packages/db/prisma/schema)
# ---------------------------------------------------------------------------
if [ "$PRISMA_DEPLOY" = "true" ]; then
  log "[3/4] prisma db push --skip-generate"
  ( cd packages/db && npx prisma db push --skip-generate --accept-data-loss=false ) \
    2>&1 | tail -10 | tee -a "$LOG" \
    || fail "prisma db push failed"
else
  log "[3/4] skipped (PRISMA_DEPLOY=false)"
fi

# ---------------------------------------------------------------------------
# 4) Restart the Node app — touch a watched file so cPanel's Process Manager
#    notices. CloudLinux "Setup Node.js App" monitors src/ + package.json
#    by default. Touching package.json is the most reliable trigger.
# ---------------------------------------------------------------------------
log "[4/4] triggering restart"
touch "$APP_DIR/package.json"
# Give cPanel's passenger/process manager a moment to respawn
sleep 3

# Smoke-test the health endpoint
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/api/v1/health}"
log "smoke: GET $HEALTH_URL"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  log "smoke OK (HTTP $HTTP_CODE)"
else
  log "smoke WARN (HTTP $HTTP_CODE) — check app logs"
  # Don't fail here; restart might take a few seconds on shared hosting
fi

log "=== deploy done ==="