#!/bin/sh
# Container entrypoint for the API image.
#
# Two-step boot:
#   1. Auto-resolve any FAILED migration rows from a prior interrupted
#      deploy (specifically 20250919_bot_phase1, which left a stuck
#      "failed" row in _prisma_migrations that would otherwise block
#      every future `prisma migrate deploy` with P3009).
#   2. Run any pending migrations (idempotent — safe to re-run).
#   3. exec node dist/main.js.
#
# We deliberately don't use `set -e` or `set -o pipefail`. The Alpine
# runtime image's /bin/sh is BusyBox ash, which doesn't support
# `-o pipefail`. Even if it did, a migrate-deploy failure should NOT
# crash the API — the API still needs to come up so the operator can
# see what's happening and the storefront can keep serving cached
# pages. We capture each command's exit code by hand and surface it
# in the boot logs.

set -u

echo "--- [entrypoint] auto-resolving any failed migration rows ---"
if pnpm --filter @xovenmart/db exec prisma migrate resolve \
      --schema ./../../packages/db/prisma/schema.prisma \
      --rolled-back 20250919_bot_phase1 >/tmp/resolve.log 2>&1
then
  echo "--- [entrypoint] resolve: ok (cleared the failed row)"
else
  rc=$?
  echo "--- [entrypoint] resolve: exited $rc (likely no failed row to resolve — that's fine)"
  tail -3 /tmp/resolve.log
fi

echo "--- [entrypoint] running prisma migrate deploy ---"
if pnpm --filter @xovenmart/db exec prisma migrate deploy \
      --schema ./../../packages/db/prisma/schema.prisma >/tmp/deploy.log 2>&1
then
  echo "--- [entrypoint] deploy: ok"
  tail -10 /tmp/deploy.log
else
  rc=$?
  echo "--- [entrypoint] deploy: exited $rc — API will start anyway but expect schema drift"
  echo "--- [entrypoint] last 20 lines of deploy log:"
  tail -20 /tmp/deploy.log
fi

echo "--- [entrypoint] starting nest main ---"
exec node dist/main.js
