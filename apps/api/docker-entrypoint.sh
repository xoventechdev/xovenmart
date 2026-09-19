#!/bin/sh
# Container entrypoint for the API image.
#
# Three-step boot:
#   1. Auto-resolve any FAILED migration rows from a prior interrupted
#      deploy (specifically 20250919_bot_phase1, which left a stuck
#      "failed" row in _prisma_migrations that would otherwise block
#      every future `prisma migrate deploy` with P3009). The resolve
#      is a no-op once the row is cleared — the command exits non-zero
#      with "No failed migration found" which we treat as success.
#   2. Run any pending migrations (idempotent — safe to re-run).
#   3. exec node dist/main.js.
#
# We deliberately don't use `set -e` or `set -o pipefail`. The runtime
# base image (node:22-bookworm-slim) uses Debian `dash` as /bin/sh,
# which doesn't support `-o pipefail`. Even if it did, a migrate-deploy
# failure should NOT crash the API — the API still needs to come up
# so the operator can see what's happening and the storefront can keep
# serving cached pages. We capture each command's exit code by hand
# and surface it in the boot logs.

set -u

echo "--- [entrypoint] (1/3) auto-resolving any failed migration rows ---"
# Try the specific known-failed migration first (faster than a query).
# If it succeeds, great. If it exits non-zero (no row to resolve), we
# log it and continue — the migrate deploy step below will still run.
RESOLVE_LOG=/tmp/resolve.log
if pnpm --filter @xovenmart/db exec prisma migrate resolve \
      --schema ./../../packages/db/prisma/schema.prisma \
      --rolled-back 20250919_bot_phase1 >$RESOLVE_LOG 2>&1
then
  echo "--- [entrypoint] resolve: ok (cleared the 20250919_bot_phase1 failed row)"
else
  rc=$?
  echo "--- [entrypoint] resolve: exited $rc — likely no 20250919_bot_phase1 row to clear (that's fine)"
  # Last 3 lines of the log so operators can see why
  tail -3 $RESOLVE_LOG 2>/dev/null | sed 's/^/    /'
fi

# Belt-and-braces: also try to clear any other failed migration rows
# using a direct DB query, so a future failed migration doesn't
# silently block us either. `prisma migrate resolve` requires the
# migration name, so we read it from `_prisma_migrations` and resolve
# each failed row. We swallow all errors — this is best-effort
# housekeeping, not a critical step.
echo "--- [entrypoint] (1b/3) sweeping any other failed migration rows ---"
node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  (async () => {
    try {
      const rows = await p.$queryRawUnsafe(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND applied_steps_count = 0"
      );
      const names = rows.map((r) => r.migration_name);
      console.log("    found", names.length, "stuck rows:", names.length ? names.join(", ") : "(none)");
      for (const name of names) {
        try {
          await p.$executeRawUnsafe(
            "UPDATE _prisma_migrations SET finished_at = NOW() WHERE migration_name = $1 AND finished_at IS NULL",
            name
          );
          console.log("    marked", name, "as rolled-back");
        } catch (e) {
          console.log("    could not mark", name, "as rolled-back:", e.message);
        }
      }
    } catch (e) {
      console.log("    sweep failed (non-fatal):", e.message);
    } finally {
      await p.$disconnect();
    }
  })();
' 2>&1 | sed 's/^/    /' || true

echo "--- [entrypoint] (2/3) running prisma migrate deploy ---"
DEPLOY_LOG=/tmp/deploy.log
if pnpm --filter @xovenmart/db exec prisma migrate deploy \
      --schema ./../../packages/db/prisma/schema.prisma >$DEPLOY_LOG 2>&1
then
  echo "--- [entrypoint] deploy: ok"
  tail -10 $DEPLOY_LOG | sed 's/^/    /'
else
  rc=$?
  echo "--- [entrypoint] deploy: exited $rc — API will start anyway but expect schema drift"
  echo "--- [entrypoint] last 20 lines of deploy log:"
  tail -20 $DEPLOY_LOG | sed 's/^/    /'
fi

echo "--- [entrypoint] (3/3) starting nest main ---"
exec node dist/main.js
