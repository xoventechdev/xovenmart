#!/usr/bin/env bash
# =============================================================================
# XovenMart — VPS seed runner (standalone)
# =============================================================================
# Run the Prisma seed against the LIVE database from the currently-active
# release. Idempotent — safe to run multiple times.
#
# Usage (on the VPS, as the deploy user):
#   bash /var/www/xovenmart/run-seed.sh
#
# What it does:
#   1. Reads DATABASE_URL from /var/www/xovenmart/api/shared/.env
#   2. cd's into the active API release (api/current)
#   3. Runs `pnpm --filter @xovenmart/db seed` against that DATABASE_URL
#
# The seed:
#   - Creates 10 root + 24 sub-categories (idempotent by slug)
#   - Creates 50+ products with bilingual BN/EN names + Unsplash cover photos
#   - Creates delivery zones, coupons, banners, FAQs, etc.
#   - Does NOT delete any existing data
# =============================================================================

set -euo pipefail

APP=/var/www/xovenmart
ENV_FILE="$APP/api/shared/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[run-seed] $ENV_FILE missing — has bootstrap.sh been run?"
  exit 1
fi

if [[ ! -d "$APP/api/current" ]]; then
  echo "[run-seed] $APP/api/current missing — has any deploy happened?"
  exit 1
fi

DATABASE_URL_VAL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
if [[ -z "$DATABASE_URL_VAL" ]]; then
  echo "[run-seed] DATABASE_URL not set in $ENV_FILE"
  exit 1
fi

cd "$APP/api/current"
echo "[run-seed] running seed against: $(echo "$DATABASE_URL_VAL" | sed -E 's#://[^:]+:[^@]+@#://***:***@#')"

DATABASE_URL="$DATABASE_URL_VAL" \
  pnpm --filter @xovenmart/db seed 2>&1 | tail -60

echo "[run-seed] done ✓"
