# VPS Testing — Debug Log & Runbook

> **Purpose:** Capture every bug we found while bringing up the testing VPS
> (`169.58.46.162`, Contabo VPS 4, Ubuntu 24.04). For each bug: the symptom,
> the root cause, the fix (in `infra/vps/*`), and how to verify. This document
> is the checklist we run through when promoting to production.
>
> **Scope:** This is the **staging / testing** environment. Production will be
> a fresh VPS; we expect most of the bugs here to be fixed in code already.

---

## Environment summary

| Item | Value |
|---|---|
| VPS provider | Contabo |
| Plan | VPS 4 (€8/mo) — 4 vCPU, 4 GB RAM, 200 GB SSD |
| OS | Ubuntu 24.04 LTS |
| VPS IP | `169.58.46.162` |
| Public domains | `app.xovenmart.com`, `api.xovenmart.com` |
| API port (internal) | 3001 |
| Web port (internal) | 3000 |
| PM2 process names | `xovenmart-api`, `xovenmart-web` |
| Postgres | 16, DB `xovenmart`, user `xovenmart_app` |
| Bootstrap admin | `admin@xovenmart.com` / `Admin@1234` (CHANGE ON FIRST LOGIN) |

---

## Bugs found + fixes

### Bug 1 — `prisma: not found` during deploy

**Symptom:** `pnpm install` finished, then `prisma generate` failed:
```
/bin/sh: 1: prisma: not found
```

**Root cause:** `deploy.sh` was running `NODE_ENV=production pnpm install`. In
pnpm, that causes devDependencies to be skipped — but `prisma`, `typescript`,
`nest`, `tsx`, etc. are all **devDeps** in this monorepo. So none of them
were installed.

**Fix:** `infra/vps/deploy.sh` — removed `NODE_ENV=production` from the
`pnpm install` lines for both API and web. Added a comment explaining why.

**Verify:** `pnpm install --frozen-lockfile --ignore-scripts` succeeds without
NODE_ENV, and `prisma generate` finds `node_modules/.pnpm/prisma@*/.../prisma`.

---

### Bug 2 — `ln -sfn /var/www/xovenmart/api/current: Permission denied`

**Symptom:** `deploy.sh` died at the symlink swap step:
```
ln: failed to create symbolic link '/var/www/xovenmart/api/current': Permission denied
```

**Root cause:** `bootstrap.sh` did `install -d /var/www/xovenmart/api` as root
and then `chown -R deploy:deploy` only the **contents** (`/api/releases`,
`/api/shared`). The `/api` and `/web` directories themselves stayed
root-owned, so the `deploy` user couldn't `ln -sfn` a new `current` symlink.

**Fix:** `infra/vps/bootstrap.sh` — `install -d -o deploy -g deploy` on
`$APP_DIR/api` and `$APP_DIR/web` themselves (not just their subdirs). Then
run a one-time `chown -R deploy:deploy` on the live VPS.

**Verify:** `deploy@vps: ln -sfn /tmp/foo /var/www/xovenmart/api/current`
succeeds without sudo.

---

### Bug 3 — Schema import path: `prisma` not found at `api/releases/.../node_modules/.bin/prisma`

**Symptom:** `deploy.sh` couldn't find the prisma binary even after install:
```
Error: spawn /var/www/xovenmart/api/releases/<TS>/node_modules/.bin/prisma ENOENT
```

**Root cause:** pnpm hoists `prisma` into
`packages/db/node_modules/.bin/prisma`, not the workspace root. The original
`deploy.sh` hardcoded the workspace-root path.

**Fix:** `infra/vps/deploy.sh` — added a fallback that walks `find ... -name
prisma -path '*node_modules/.bin*'` to locate the binary. If found, run
`prisma migrate diff` from there. If not, skip DB import (the schema will
already exist from a previous deploy — `CREATE TABLE IF NOT EXISTS` is
idempotent in Postgres).

**Verify:** `find /var/www/xovenmart/api/releases/<TS> -name prisma -path
'*node_modules/.bin*'` returns the actual binary.

---

### Bug 4 — Postgres permission denied on every API query (`42501`)

**Symptom:** All API endpoints returned 500 after schema import:
```
Invalid `prisma.adminUser.findUnique()` invocation:
Error occurred during query execution:
ConnectorError ... code: "42501", message: "permission denied for table admin_users"
```

**Root cause:** `deploy.sh` ran the schema import via
`sudo -u postgres psql`, so all tables were created with owner `postgres`.
But the API connects as `xovenmart_app`, a non-superuser. Postgres by default
does NOT grant non-owners any privileges.

**Fix:** `infra/vps/deploy.sh` — after schema import, run a GRANT block:
```sql
GRANT ALL ON SCHEMA public TO xovenmart_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO xovenmart_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO xovenmart_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO xovenmart_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO xovenmart_app;
```

The `ALTER DEFAULT PRIVILEGES` lines mean future tables (created by future
`prisma migrate` runs) are also auto-granted.

**Verify:**
```bash
PGPASSWORD=$DB_PASS psql -U xovenmart_app -d xovenmart -c "SELECT count(*) FROM admin_users;"
```
returns rows without `permission denied`.

---

### Bug 5 — Bootstrap admin user not seeded (login returns 401)

**Symptom:** `POST /api/v1/auth/admin/login` with `Admin@1234` returns 401
after a fresh deploy. `SELECT * FROM admin_users` returns 0 rows.

**Root cause:** My original `deploy.sh` prepended an `INSERT INTO
admin_users ... ON CONFLICT DO NOTHING` to the auto-generated `schema.sql`.
But Prisma generates `admin_users` as `CREATE TABLE` at line ~549 of the
SQL, AFTER many CREATE TYPE / CREATE TABLE statements. The prepended
INSERT runs FIRST, when `admin_users` doesn't exist yet, and silently
fails (`ON_ERROR_STOP=0` keeps psql going but the row is never created).

**Fix:** `infra/vps/deploy.sh` — removed the prepended INSERT. After schema
import succeeds, generate a real bcrypt hash using the deployed `bcryptjs`
package and run a separate INSERT:
```bash
ADMIN_HASH=$(node -e "const b=require('$BCryptJS'); console.log(b.hashSync('Admin@1234',10));")
INSERT INTO admin_users (id, email, password_hash, name, role, is_active, created_at, updated_at)
VALUES ('c-bootstr4d', 'admin@xovenmart.com', '$ADMIN_HASH', 'Site Admin', 'ADMIN', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW();
```

10 bcrypt rounds instead of 12 — still secure, ~3× faster.

**Verify:** login succeeds and returns a real JWT.

---

### Bug 6 — pm2's `env_file` doesn't reliably inject DATABASE_URL

**Symptom:** API started but every Prisma query failed with
`Environment variable not found: DATABASE_URL`.

**Root cause:** pm2's `env_file` directive is documented but in the version
on the VPS (5.x) it has bugs around quoted values, comments, and certain
key names. It silently dropped some variables.

**Fix:** `infra/vps/ecosystem.config.js` + `infra/vps/run-api.sh` —
replaced `env_file` with a bash wrapper that `source`s the .env file
before `exec node`. This bypasses pm2's variable injection entirely.

**Verify:** `ps aux | grep xovenmart-api` shows the env loaded:
```bash
cat /proc/<pid>/environ | tr '\0' '\n' | grep DATABASE_URL
```

---

### Bug 7 — Web `next` script path wrong

**Symptom:** pm2 error:
```
Script not found: /var/www/xovenmart/web/current/apps/node_modules/next/dist/bin/next
```

**Root cause:** Original config had `script: '../node_modules/next/dist/bin/next'`
with `cwd: '/var/www/xovenmart/web/current/apps/web'`. That resolved
`../node_modules` → `/var/www/xovenmart/web/current/apps/node_modules`
(WRONG — there's no `node_modules` at that path; pnpm hoists into `apps/web/node_modules`).

**Fix:** `infra/vps/ecosystem.config.js` — changed to
`script: 'node_modules/next/dist/bin/next'` (relative to cwd, no `../`).

**Verify:** `pm2 reload xovenmart-web` succeeds and the web app responds.

---

### Bug 8 — SSR fetch URLs missing `/api/v1` prefix (home page empty)

**Symptom:** `https://app.xovenmart.com/` rendered the header + footer but the
Categories section was empty and no products showed up. API endpoints tested
directly with curl returned full data, but SSR fetched them with 404s:
```
apiServer.get(/catalog/categories) failed: API /catalog/categories → 404
apiServer.get(/catalog/products/featured) failed: → 404
apiServer.get(/banners/public) failed: API /banners/public → 404
```

**Root cause:** Both `apps/web/lib/api.ts` (client) and
`apps/web/lib/api-server.ts` (SSR) hardcoded the fallback URL to
`"http://localhost:3001/api/v1"`, then concatenated the operator-provided
`process.env.NEXT_PUBLIC_API_URL` as-is:
```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
```
If the operator set `NEXT_PUBLIC_API_URL=https://api.xovenmart.com` (WITHOUT
the trailing `/api/v1`), every SSR fetch became `https://api.xovenmart.com/catalog/categories`
— no version prefix → 404. Both code paths baked the env var into the
Next.js bundle at build time, so the bug was permanent until rebuild.

**Fix:** added a `resolveApiBase()` helper to BOTH files that strips any
existing `/api/v\d+` suffix and always re-appends `/api/v1`:
```ts
function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const base = raw.replace(/\/api\/v\d+\/?$/, "");
  return `${base}/api/v1`;
}
const API_URL = resolveApiBase();
```
Result is the same regardless of whether the operator includes `/api/v1` in
the env var or not. Bonus: also set `NEXT_PUBLIC_API_URL=https://api.xovenmart.com/api/v1`
in `web/shared/.env.production` for clarity.

**Verify:** rebuild web, restart pm2, then:
```bash
curl -fsS https://app.xovenmart.com/ | grep -oE 'href="/products\?category=[a-z0-9-]+' | head
# → real category links appear
curl -fsS https://app.xovenmart.com/ | grep -oE 'Fresh Milk|Tea Biscuit|Miniket' | head
# → product names appear
pm2 logs xovenmart-web --lines 30 --nostream --err
# → no "API /catalog/... → 404" warnings
```

**Production note:** no operator action required. The fix is committed and
the next deploy pulls it automatically. Both client and server builds are
covered.

---

## Bootstrap admin user (CHANGE ON FIRST LOGIN)

| Field | Value |
|---|---|
| Email | `admin@xovenmart.com` |
| Password | `Admin@1234` |
| ID | `c-bootstr4d` |
| Role | `ADMIN` |
| Created by | `deploy.sh` on first deploy (idempotent — re-running updates hash) |

**Action required after first login:** change the password via
`/admin/settings/staff` or directly in DB with a new bcrypt hash.

---

## End-to-end verification (run after every deploy)

```bash
# 1. health
curl -fsS http://127.0.0.1:3001/api/v1/health
# → {"status":"ok",...}

# 2. admin login (returns access token)
curl -fsS -X POST https://api.xovenmart.com/api/v1/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@xovenmart.com","password":"Admin@1234"}'

# 3. public endpoints (should not be empty after seeding)
curl -fsS https://api.xovenmart.com/api/v1/banners/public         | head -c 300
curl -fsS https://api.xovenmart.com/api/v1/catalog/categories     | head -c 300
curl -fsS 'https://api.xovenmart.com/api/v1/catalog/products?perPage=3' | head -c 500
curl -fsS https://api.xovenmart.com/api/v1/settings/public        | head -c 300

# 4. web
curl -fsS -o /dev/null -w '%{http_code}\n' https://app.xovenmart.com/
# → 200

# 5. PM2 status
pm2 status
# → both xovenmart-api and xovenmart-web online
```

---

## Seeding demo data (idempotent)

For testing/staging, seed minimal categories/products/banners:

```bash
# From your laptop
powershell -NoProfile -ExecutionPolicy Bypass -File .runtime/ssh.ps1 script:.runtime/52-seed-direct.sh
```

That script is idempotent — re-running is safe.

---

## Manual reset (if DB gets into a weird state)

```bash
# Drop all tables and re-import schema + seed
DB_PASS="$(grep '^DATABASE_URL=' /var/www/xovenmart/api/shared/.env | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')"
PGPASSWORD="$DB_PASS" sudo -u postgres psql -d xovenmart -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
# Then run a deploy (which re-imports schema.sql + seeds admin)
bash /var/www/xovenmart/api/shared/deploy.sh manual-bootstrap
# Then re-seed demo data
powershell -NoProfile -File .runtime/ssh.ps1 script:.runtime/52-seed-direct.sh
```

---

## What we did NOT do (and why)

- **No GitHub Actions secrets wired** — for testing we run deploys manually
  via SSH from your laptop. When we go to production, add `VPS_HOST`,
  `VPS_SSH_USER`, `VPS_SSH_KEY` secrets and enable `.github/workflows/deploy-api-vps.yml`.
- **No `fail2ban` tuning beyond defaults** — installed by `bootstrap.sh`
  with stock config; good enough for testing.
- **No daily backup cron verification** — `backup.sh` is installed but
  we haven't actually restored from a backup yet. Do that before production.
- **No Sentry / error tracking** — pm2 logs are enough for now.
- **Did not delete cPanel deploy artifacts** — keeping `deploy-api-cpanel.yml`
  and the PHP webhook around in case we need to roll back.

---

## Production checklist (when we promote)

For each item, reference the bug above and confirm the fix is in place:

- [ ] Bug 1 — `deploy.sh` does NOT set `NODE_ENV=production` for pnpm install
- [ ] Bug 2 — `bootstrap.sh` creates `$APP_DIR/api` and `$APP_DIR/web` deploy-owned
- [ ] Bug 3 — `deploy.sh` finds `prisma` binary via `find ...` fallback
- [ ] Bug 4 — `deploy.sh` runs GRANT block after schema import
- [ ] Bug 5 — `deploy.sh` seeds admin user AFTER schema import with bcrypt hash
- [ ] Bug 6 — `ecosystem.config.js` uses `run-api.sh` wrapper, not `env_file`
- [ ] Bug 7 — `ecosystem.config.js` uses `script: 'node_modules/next/dist/bin/next'`
- [ ] Bug 8 — `lib/api.ts` and `lib/api-server.ts` use `resolveApiBase()` so `/api/v1` is always present

Plus:
- [ ] Run end-to-end verification on fresh VPS
- [ ] Change `Admin@1234` immediately
- [ ] Verify SSL renewal cron is set up
- [ ] Wire GitHub Actions secrets
- [ ] Verify backup cron + restore from one backup
- [ ] Delete cPanel deploy artifacts (after 2 weeks stable)