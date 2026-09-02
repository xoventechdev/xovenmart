# XovenMart — Local Dev Runbook (Windows)

Run the API, admin panel, and user storefront all on your laptop, against a
local Postgres. Use this for development; use the VPS for staging/production.

---

## One-time setup

### 1. Install PostgreSQL 16 (skip if already installed)

Via winget (silent):
```
winget install --id PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements
```

When the installer asks for the **postgres superuser password**, set it to
`postgres` (or anything memorable — you only need it once in step 2).

When it asks for the **port**, leave as `5432` (default).

If the installer can't run silently, download from
https://www.enterprisedb.com/download-postgresql-binaries and run the
installer GUI.

### 2. Create the app DB + user

Open PowerShell:
```
psql -U postgres -h localhost
```
Enter the password you set in step 1 (`postgres`), then at the `psql` prompt:
```sql
CREATE USER xovenmart WITH PASSWORD 'xovenmart_dev' CREATEDB;
CREATE DATABASE xovenmart OWNER xovenmart;
GRANT ALL PRIVILEGES ON DATABASE xovenmart TO xovenmart;
\c xovenmart
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
\q
```

Verify:
```
psql -U xovenmart -h localhost -d xovenmart -c "SELECT current_user;"
```
Should print `current_user = xovenmart`.

### 3. Install Node.js 22 + pnpm 9 (skip if already installed)

```
winget install --id OpenJS.NodeJS.LTS --silent
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

### 4. Clone (skip if you already have the repo)

```
git clone https://github.com/xoventechdev/xovenmart.git
cd xovenmart
pnpm install
```

---

## Every-day dev workflow

### Terminal 1 — Postgres (auto-runs as a Windows service)

Postgres 16 installs itself as a service `postgresql-x64-16`. It starts
automatically on boot. If it's not running:
```
net start postgresql-x64-16
```

### Terminal 2 — API + Web (one command runs both)

From the repo root:
```
pnpm dev
```

That uses Turbo to start both:
- `@xovenmart/api` on **http://localhost:3001** (NestJS)
- `@xovenmart/web` on **http://localhost:3000** (Next.js, includes /admin)

The web app reads `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` (default in `apps/web/lib/api-server.ts`).

### First-time database setup (per machine, idempotent)

```
# Generate Prisma client (re-run after schema changes)
pnpm --filter @xovenmart/db prisma generate

# Push schema to local DB (no migrations history kept — fine for dev)
pnpm --filter @xovenmart/db prisma db push

# Seed demo data (admin users, products, categories, etc.)
pnpm --filter @xovenmart/db seed
```

The seed script is **idempotent** — re-running updates rather than duplicates.

---

## What's where

| Component | URL | Port | Process |
|---|---|---|---|
| User storefront + admin panel (one Next.js app) | http://localhost:3000 | 3000 | `next dev` |
| API | http://localhost:3001 | 3001 | `nest start --watch` |
| API docs (Swagger) | http://localhost:3001/api/docs | 3001 | (same) |
| Postgres | `localhost:5432` | 5432 | Windows service |

## Logins (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@xovenmart.com` | `Admin@1234` |
| Manager | `manager@xovenmart.com` | `Manager@1234` |
| Staff | `staff@xovenmart.com` | `Staff@1234` |
| Rider | `rider1@xovenmart.com` | `Rider@1234` |
| Customer | `customer1@example.com` | `Customer@1234` |

**Change all of these in production.**

---

## Reset the DB

If you want to wipe everything and start fresh:
```
psql -U postgres -h localhost -c "DROP DATABASE xovenmart;"
psql -U postgres -h localhost -c "CREATE DATABASE xovenmart OWNER xovenmart;"
psql -U postgres -h localhost -d xovenmart -c "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"
pnpm --filter @xovenmart/db prisma db push
pnpm --filter @xovenmart/db seed
```

---

## Push local changes to VPS

Once you've added real data locally and want to ship it to staging:

### Option A — only the schema

```
# local
pnpm --filter @xovenmart/db prisma migrate dev --name my-change
git add packages/db/prisma/migrations
git commit -m "db: my change"
git push xovenmart main
# GitHub Actions will trigger, or run the VPS deploy manually
```

### Option B — full data sync (pg_dump → psql)

```
# local
pg_dump -U xovenmart -h localhost -d xovenmart --no-owner --no-privileges > /tmp/xovenmart-data.sql

# upload to VPS (using the existing ssh.ps1 wrapper)
# .runtime/upload-file.ps1 /tmp/xovenmart-data.sql
#   /tmp/xovenmart-data.sql -> /tmp/xovenmart-data.sql on VPS

# on VPS
PGPASSWORD=<db_password> psql -U xovenmart_app -d xovenmart -f /tmp/xovenmart-data.sql
```
Get `<db_password>` from `/var/www/xovenmart/api/shared/.env` on the VPS
(grep for `DATABASE_URL`).

---

## Common gotchas

- **`Can't reach database server at localhost:5432`** — Postgres service
  not running. `net start postgresql-x64-16`.
- **API starts but every Prisma query fails** — schema not migrated. Run
  `pnpm --filter @xovenmart/db prisma db push`.
- **`Admin@1234` doesn't log in** — DB wasn't seeded. Run
  `pnpm --filter @xovenmart/db seed`.
- **CORS errors in browser** — make sure `pnpm dev` started BOTH api (3001)
  and web (3000). The web app calls the API at `localhost:3001`.
- **SMS OTP never arrives in dev** — that's expected. The auth service
  logs OTPs to the API console. Watch the terminal running `pnpm --filter @xovenmart/api dev`.
- **`EADDRINUSE` on port 3001 or 3000** — another app is using that port.
  `netstat -ano | findstr :3001` to find the PID, then `taskkill /PID <pid> /F`.

---

## Production vs local .env files

| File | Loaded by | Purpose |
|---|---|---|
| `.env` (repo root) | turbo / all workspaces | Local dev defaults |
| `packages/db/.env` | `prisma generate`, `prisma db push`, seed | Local dev DB |
| `infra/vps/api/shared/.env` | `apps/api` on VPS | Production secrets |
| `infra/vps/web/shared/.env.production` | `apps/web` on VPS at build time | Production `NEXT_PUBLIC_*` |

**Never commit secrets.** The root `.env` has dev defaults only — the
`JWT_SECRET` there is a placeholder. Real secrets live on the VPS only.
