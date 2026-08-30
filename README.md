# XovenMart

Single-vendor e-commerce platform for XovenMart (Mudaforgonj, Laksam, Cumilla, Bangladesh).

## Products in this repo (monorepo)

- `apps/api` — NestJS REST API (`/api/v1`)
- `apps/web` — Next.js 15 (public storefront + `/admin` route group)
- `apps/android-customer` — Kotlin + Jetpack Compose customer app (mirrors `apps/web`, consumes `/api/v1`)
- `packages/db` — Prisma schema, migrations, seed
- `packages/types` — Shared DTOs (Zod) consumed by API and Web

## Native clients

- **`apps/android-customer`** — Kotlin + Jetpack Compose customer app (in this repo).
  Mirrors `apps/web` for shoppers only (no admin). Talk to `/api/v1` via Retrofit.
  See `apps/android-customer/README.md` for setup.
- A separate rider Android app will be added as `apps/android-rider` later.

## Quick start

### Option A: One-command (recommended)

**Windows PowerShell:**
```powershell
.\scripts\start-dev.ps1
```

**macOS / Linux:**
```bash
bash scripts/start-dev.sh
```

This will:
1. Start Postgres + Adminer via Docker
2. Install deps (first run only)
3. Generate Prisma client + run migrations
4. Optionally seed the database
5. Start API + Web via Turbo

### Option B: Manual

```bash
# Install pnpm (one-time)
npm install -g pnpm

# Install deps
pnpm install

# Start Postgres locally (Docker required)
docker compose -f infra/docker-compose.dev.yml up -d
# (Adminer UI → http://localhost:8081)

# Generate Prisma client + run migrations
pnpm db:generate
pnpm db:migrate

# Seed sample data (admin@xovenmart.com / admin123)
pnpm db:seed

# Start everything
pnpm dev
```

### URLs after startup
- API → http://localhost:3001
- Web (storefront) → http://localhost:3000
- Admin Panel → http://localhost:3000/admin
- API Swagger docs → http://localhost:3001/docs
- Adminer (DB UI) → http://localhost:8081

### Login credentials (after seed)
| Role | Email | Password |
|---|---|---|
| Admin | admin@xovenmart.com | admin123 |
| Manager | manager@xovenmart.com | manager123 |
| Staff | staff@xovenmart.com | staff123 |
| Rider 1 | rider1@xovenmart.com | rider123 |
| Rider 2 | rider2@xovenmart.com | rider123 |
| Customer | +8801811234567 (phone OTP) | — |

## Live API smoke test

After the dev stack is up, verify every admin endpoint:

```bash
# Linux/Mac
bash scripts/smoke-test.sh

# Windows (Git Bash)
bash scripts/smoke-test.sh
```

Optional: target a non-local API:
```bash
bash scripts/smoke-test.sh https://api.xovenmart.com/api/v1
```

Output reports pass/fail per endpoint with a final summary.

## Useful scripts

```bash
# Reset DB and re-seed (drops all data)
bash scripts/reset-db.sh

# Open Prisma Studio
pnpm db:studio

# Run API in watch mode only
pnpm --filter @xovenmart/api dev

# Run web only
pnpm --filter @xovenmart/web dev

# Type-check everything
pnpm typecheck
```

### Android customer app

The Android client is a separate Gradle project at `apps/android-customer/`.
It's not orchestrated by Turbo (Gradle manages its own deps). Open the
folder directly in Android Studio, or from the CLI:

```bash
# From monorepo root (uses system `gradle` to bootstrap the wrapper)
pnpm android:build:debug
pnpm android:install:debug
```

Configure the API URL in `apps/android-customer/local.properties` (defaults
to `http://10.0.2.2:3001/api/v1/` for an emulator pointing at a backend on
the same host).
```

## Deploy

Three independent pipelines — most of the platform runs on free / low-cost
tiers, only the API lives on cPanel (which you already have).

| Surface | Host | Cost | Guide |
|---|---|---|---|
| Web storefront + Admin | Vercel (Hobby) | $0 | [`infra/DEPLOY_VERCEL.md`](infra/DEPLOY_VERCEL.md) |
| API (`apps/api`) | cPanel shared hosting (Passenger) | included in your plan | [`infra/DEPLOY_CPANEL.md`](infra/DEPLOY_CPANEL.md) |
| Android customer APK | GitHub Actions artifact (sideload) | $0 | [`infra/DEPLOY_ANDROID.md`](infra/DEPLOY_ANDROID.md) |

The CI workflows under `.github/workflows/` are pre-wired:

- `ci.yml` — type-check + build on every PR
- `deploy-api-cpanel.yml` — auto-deploys `apps/api` on push to `main` (FTP + SSH/webhook restart)
- `build-android.yml` — builds the APK on every release tag (`vX.Y.Z`)

## Architecture

See [plan file](../../XovenMart%20v1%20build%20plan.md) for full rationale.

Single-vendor — **no vendor table** in the schema. You are the operator:
sourcing products from suppliers and reselling. Vendor names are NEVER shown
to customers. Customers see only product names, prices, and discounts.
