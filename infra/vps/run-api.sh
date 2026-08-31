#!/usr/bin/env bash
# Source the .env file then exec the API. Used by PM2 ecosystem.config.js so
# that DATABASE_URL, JWT secrets, etc. are reliably injected into the Node
# process regardless of which pm2 version is running.
#
# This script is installed by bootstrap.sh at /var/www/xovenmart/api/shared/run-api.sh
# and is owned by deploy. The API entrypoint is the release-specific compiled JS,
# so we re-resolve the symlink each time the script runs.
set -eu

ENV_FILE="/var/www/xovenmart/api/shared/.env"
API_ROOT="/var/www/xovenmart/api/current"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE missing" >&2
  exit 1
fi

if [[ ! -f "$API_ROOT/apps/api/dist/main.js" ]]; then
  echo "FATAL: $API_ROOT/apps/api/dist/main.js missing (no API release checked out?)" >&2
  exit 1
fi

# Load env vars (skip comments + blank lines, ignore inline comments)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Ensure core runtime vars are set (env file should have them, but be defensive).
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3001}"

cd "$API_ROOT"
exec node apps/api/dist/main.js
