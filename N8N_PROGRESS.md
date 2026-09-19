# n8n Chat Automation — Progress Snapshot

> **Captured**: 2026-09-19
> **Status**: Phase 1 ✅ shipped to production. Phase 2 ✅ code-complete,
> awaiting operator one-time VPS actions. Phase 3 (Messenger workflow)
> not yet started. **Also**: upload-persistence fix done today (in-flight
> until operator deploys).
> **Full plan**: `C:\Users\Mr Kamal Hosen\.puku-cli\plans\virtual-purring-oasis.md`
> (also: `infra/ENV_N8N.md` for n8n ops, `infra/UPLOAD_PERSISTENCE.md`
> for upload recovery).

This file is the real context — read it (plus `infra/ENV_N8N.md`) before
resuming any n8n work. The plan file at `~/.puku-cli/plans/` is the
authoritative design doc; this file is the **implementation status**.

---

## What's done

### Phase 1 — API bot-facing surface (shipped, live in prod)

All 11 bot endpoints live in `apps/api/src/modules/bot/` and serve from
`https://api.xovenmart.com/api/v1/bot/*` (bot-action, JWT-authenticated)
and `/api/v1/bot/webhooks/*` (signature-verified).

**Key files:**
- `apps/api/src/modules/bot/bot.module.ts` — DI wiring (imports `CheckoutModule`)
- `apps/api/src/modules/bot/bot.controller.ts` — webhook receivers + bot actions
- `apps/api/src/modules/bot/bot.service.ts` — orchestration
- `apps/api/src/modules/bot/bot-pricing.service.ts` — wraps `CheckoutService.place`
- `apps/api/src/modules/bot/bot-customer.service.ts` — phone → user lookup (READ ONLY)
- `apps/api/src/modules/bot/bot-events.service.ts` — appends to `BotEvent` audit table
- `apps/api/src/modules/bot/bot-conversation.service.ts` — conversation control
- `apps/api/src/modules/bot/guards/bot-service.guard.ts` — `audience=BOT` JWT check
- `apps/api/src/modules/bot/guards/bot-webhook.guard.ts` — HMAC/token verification

**Critical gotcha — raw body for webhook HMAC:** NestJS's
`bodyParser.json()` destroys the raw bytes needed for HMAC verification.
Fixed in `apps/api/src/main.ts` with `express.raw()` middleware
registered BEFORE global pipes for `/api/v1/bot/webhooks`. The guard
reads `req.rawBody` and uses `crypto.timingSafeEqual` to compare against
the provider's signature header.

**Database schema** (Prisma migration `20250919_bot_*`):
- `OrderSource` enum extended: `MESSENGER | WHATSAPP_CLOUD | WHATSAPP_GREEN`
- `orders.botChannel`, `botSenderId`, `botConversationId` columns
- `products.botVisible BOOLEAN NOT NULL DEFAULT true` (web/admin see all,
  bot module filters on this)
- New tables: `bot_events`, `bot_idempotency`, `bot_conversations`

**Schema diagnostic endpoint:** `GET /api/v1/health/schema` returns
column/table/enum/migration presence without auth — see
`apps/api/src/shared/health/health.controller.ts`. Used heavily to triage
"catalog 500 — is the migration applied?" without SSHing in.

**Bot-endpoint inventory** (live in prod, return 401 without `aud=BOT` JWT):

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET  | `/bot/webhooks/messenger`     | HMAC      | Meta GET handshake |
| POST | `/bot/webhooks/messenger`     | HMAC      | Forward to n8n |
| GET  | `/bot/webhooks/whatsapp-cloud`| HMAC      | Meta GET handshake |
| POST | `/bot/webhooks/whatsapp-cloud`| HMAC      | Forward to n8n |
| POST | `/bot/webhooks/whatsapp-green`| Token     | Green API events |
| GET  | `/bot/customer/lookup?phone=` | Bot JWT   | Phone → user (read-only) |
| GET  | `/bot/catalog/search?q=`     | Bot JWT   | Wrapper around `/catalog/search` (≤5 hits) |
| GET  | `/bot/catalog/product/:slug` | Bot JWT   | Compact product detail |
| GET  | `/bot/delivery/quote?lat&lng&subtotal=` | Bot JWT | Delivery fee |
| POST | `/bot/orders/place`           | Bot JWT   | Place order with idempotency |
| GET  | `/bot/conversation/:senderId` | Bot JWT   | Read last N turns |
| POST | `/bot/conversation/:senderId/handoff` | Bot JWT | Mark for human |

### Phase 2 — n8n deployment infrastructure (code-complete, awaiting VPS ops)

All files committed-ready. Operator SSH actions pending.

**New files:**
- `infra/postgres-init/02-create-n8n-db.sql` — creates `xovenmart_n8n`
  DB + `n8n_user` role with zero cross-grants to `xovenmart`
- `infra/ENV_N8N.md` — full operator runbook (DNS, secrets, init-script
  password baking, `.env` updates, push, `docker compose up -d n8n`,
  smoke tests, rotation procedures)
- `apps/n8n-workflows/` — empty directory, will hold Phase 3 exports

**Modified files:**
- `infra/docker-compose.yml` — new `n8n` service + `n8n_data` volume +
  `caddy` now depends on `n8n` + Caddy receives `N8N_ADMIN_USER` /
  `N8N_ADMIN_PASSWORD_HASHED` env vars
- `infra/Caddyfile` — new `n8n.xovenmart.com` site block with Caddy
  basicauth (replaces n8n's own login screen)
- `infra/backup.sh` — refactored to `dump_db()` function, also dumps
  `xovenmart_n8n` with separate creds
- `.env.example` — documents all new env vars with generation commands

**Architectural decisions (and why):**

1. **Separate Postgres DB for n8n.** An n8n RCE (malicious workflow
   node, credential-stealing template) must NOT reach product/order
   tables. `xovenmart_n8n` is physically separate from `xovenmart`;
   `n8n_user` has zero grants on `xovenmart` and vice versa. See
   `infra/postgres-init/02-create-n8n-db.sql` for the explicit
   `REVOKE ALL ... FROM PUBLIC` belt-and-braces.

2. **Caddy basicauth, not n8n's built-in login.** `N8N_BASIC_AUTH_ACTIVE=false`
   in n8n's env means one password system (Caddy). The Caddyfile
   uses `${N8N_ADMIN_USER}` / `${N8N_ADMIN_PASSWORD_HASHED}`
   placeholders, resolved by Caddy from its own environment (which
   the docker-compose `caddy` service receives). Both vars have no
   defaults — if either is missing, `docker compose up` fails loud.

3. **`N8N_PROXY_HOPS=1`**, not `N8N_TRUST_PROXY=true`. The correct
   n8n env var is `N8N_PROXY_HOPS` (number of reverse proxies ahead).
   We have exactly one (Caddy → n8n).

4. **`EXECUTIONS_DATA_MAX_AGE=168` (7 days).** n8n's execution
   history is held in-process AND in DB; pruning keeps the `xovenmart_n8n`
   DB small. The nightly R2 backup also captures the DB, so losing
   older history is fine — losing 7 days of debug would be annoying.

5. **Memory cap 1g on n8n.** Generous because the queue + execution
   history is held in-process. Combined with the other services
   (postgres 1g, api 1g, web 1g, caddy 256m, backup 256m), we're at
   ~4.5 GB on a 4 GB box. Tight but workable. If OOM under load,
   upgrade VPS to CPX31 (8 GB) before tuning service limits.

---

## What's pending (operator-side, one-time)

These are **not code changes** — they're VPS actions that only the
operator can do. Full detail in `infra/ENV_N8N.md`.

1. **DNS**: Add Cloudflare A record `n8n.xovenmart.com → <Hetzner VPS IP>`
   (proxy ON). Without this, Caddy ACME DNS-01 challenge fails.

2. **Generate secrets** (5 commands): `N8N_DB_PASSWORD` (base64 24),
   `N8N_ENCRYPTION_KEY` (hex 32), `N8N_ADMIN_PASSWORD_HASHED` (via
   `caddy hash-password`), `N8N_BOT_SERVICE_TOKEN` (hex 32),
   `N8N_INGEST_SECRET` (hex 32). Also `META_VERIFY_TOKEN` (hex 24).

3. **Bake `N8N_DB_PASSWORD`** into `infra/postgres-init/02-create-n8n-db.sql`
   replacing `'CHANGE_ME_N8N_DB_PASSWORD'`. **CRITICAL ORDER**: this
   must be committed BEFORE the first boot of a fresh `postgres_data`
   volume (otherwise you have to wipe the volume to re-run init).

4. **Update VPS `.env`** with all new vars (same values as above).

5. **Push & deploy**: `git push xovenmart main` → Coolify rebuilds
   api/web/caddy (n8n does NOT auto-add to running stack).

6. **Bring up n8n**: SSH in, `docker compose -f infra/docker-compose.yml up -d n8n`.

7. **Smoke test**: `curl -I https://n8n.xovenmart.com/` → expect HTTP/2 401.

---

## What's done (today, 2026-09-19, apart from n8n)

### Upload-persistence fix (in-flight, awaiting operator deploy)

Some product images disappeared from other devices after every API
container restart. Root cause: the new `POST /admin/media/upload-file`
endpoint writes files to `/repo/apps/api/uploads/` inside the API
container — which has NO persistent volume. Every Coolify redeploy
wipes the directory.

**Fix applied:** added named `api_uploads` volume to `infra/docker-compose.yml`
+ explicit `UPLOAD_DIR=/repo/apps/api/uploads` env var so the API's
walk-up-from-CWD heuristic isn't relied on.

**Recovery of existing files:** the running API container still has
any uploaded files in its writable layer — but they're LOST as soon
as the new volume takes effect (container is recreated). See
`infra/UPLOAD_PERSISTENCE.md` for the 4-step salvage procedure:

1. Tar files out of the running container to host scratch dir
2. Deploy the new volume
3. `docker cp` (or tar-pipe) the salvaged files back into the new volume
4. Verify a previously-broken URL now returns 200

**NOT yet done (Phase 4 follow-up):** migrate legacy `data:image/...`
rows in `ProductImage.url` to file-on-disk (smaller DB, faster catalog
queries, removable via DELETE). Script not written yet.

---

## What's pending (Phase 3 — Messenger workflow)

Not yet started. Approximate structure per the plan:

**Files to create:**
- `apps/n8n-workflows/messenger-inbound.json` — exported n8n workflow
- `apps/n8n-workflows/system-prompt.txt` — future LLM-node prompt

**Workflow shape** (8 nodes):
1. **Webhook** trigger at `/messenger-inbound` (POST), validates
   `X-Internal-Secret: ${N8N_INGEST_SECRET}` (defense in depth).
2. **HTTP Request** → `GET https://graph.facebook.com/v19.0/<PSID>` for
   sender name (uses `META_PAGE_ACCESS_TOKEN` from n8n credential).
3. **HTTP Request** → `GET https://api.xovenmart.com/api/v1/bot/catalog/search?q=<text>&limit=5`
   with bot JWT.
4. **Switch** on regex-classified intent (greeting / price / order /
   handoff / fallback).
5. **Price branch**: `GET /bot/catalog/product/:slug` → reply via Meta Send API.
6. **Order branch**: multi-turn state machine → `POST /bot/orders/place`
   with `idempotencyKey=<uuid>` → reply with orderNo.
7. **Handoff branch**: reply with admin phone from `/settings/public/general`
   + `POST /bot/conversation/:senderId/handoff`.
8. **All branches**: append `BotEvent` audit row via the API.

**Operator actions for Phase 3** (after workflow is exported):
1. Import the JSON via n8n UI (or CLI headless).
2. Create n8n credentials:
   - "Meta Page" — `META_PAGE_ACCESS_TOKEN`
   - "XovenMart Bot" — `Authorization: Bearer ${N8N_BOT_SERVICE_TOKEN}`
   - "n8n Ingest" — `X-Internal-Secret: ${N8N_INGEST_SECRET}`
3. Configure Meta App webhook at
   `https://app.xovenmart.com/api/v1/bot/webhooks/messenger`
   (or `api.xovenmart.com/api/v1/bot/webhooks/messenger` — both reach
   the same controller via different Caddy routes).
4. Subscribe to `messages` and `messaging_postbacks`.

---

## Gotchas / decisions log

| Date | Issue | Resolution |
| --- | --- | --- |
| 2026-09-19 | Prisma migration stuck — `ALTER TYPE ... ADD VALUE` cannot run in transaction block | Split into `20250919_bot_order_source_enum/` (non-transactional, auto-detected) + `20250919_bot_schema/` (transactional). |
| 2026-09-19 | NestJS DI error: `BotPricingService` couldn't resolve `CheckoutService` | Added `exports: [CheckoutService]` to `CheckoutModule`. |
| 2026-09-19 | Shell error `sh: 1: set: Illegal option -o pipefail` | Debian `dash` doesn't support `-o pipefail`. Removed pipefail; used `set -u` + manual exit code capture in `apps/api/docker-entrypoint.sh`. |
| 2026-09-19 | Windows CRLF line endings in `docker-entrypoint.sh` | Added `.gitattributes` with `*.sh text eol=lf` + `Dockerfile* text eol=lf`. |
| 2026-09-19 | Catalog/products 500 after deploy (schema drift on prod) | Robust entrypoint: auto-resolves stuck `20250919_bot_phase1` row, sweeps any other failed rows via direct UPDATE, runs `migrate deploy` (non-fatal — API still boots), added `GET /health/schema` diagnostic. |
| 2026-09-19 | `bodyParser.json()` destroyed raw bytes for HMAC | Registered `express.raw({ type: "*/*", limit: "1mb" })` BEFORE global pipes, only on `/api/v1/bot/webhooks/*`. |
| 2026-09-19 | (Phase 2) `N8N_TRUST_PROXY` is not a real n8n env var | Correct var is `N8N_PROXY_HOPS` (number of reverse proxies ahead). |
| 2026-09-19 | Some product images 404 from other devices after a deploy | Two parallel upload paths: legacy `POST /admin/media/upload` stores base64 data URLs in DB (always renders), new `POST /admin/media/upload-file` writes to container-local disk (vanishes on restart). Fixed by binding `/repo/apps/api/uploads` to a named `api_uploads` docker volume + explicit `UPLOAD_DIR` env var. Recovery of in-flight files documented in `infra/UPLOAD_PERSISTENCE.md`. |

---

## Key file index (for context-resume speed)

**API bot module:**
- `apps/api/src/modules/bot/` — full module
- `apps/api/src/main.ts` — raw-body middleware registration
- `apps/api/src/shared/jwt/token.service.ts:7` — `JwtAudience.BOT` enum
- `apps/api/src/shared/health/health.controller.ts` — `/health/schema` diagnostic
- `apps/api/src/modules/checkout/dto.ts:170` — relaxed `source` validator
- `apps/api/docker-entrypoint.sh` — robust migration recovery
- `apps/api/Dockerfile.coolify` — uses entrypoint script (not inline CMD)

**Prisma schema:**
- `packages/db/prisma/schema.prisma` — `OrderSource` enum, `bot_*` tables, `botVisible` column
- `packages/db/prisma/migrations/20250919_bot_*/` — applied migrations
- `packages/db/prisma/migrations/20250919_RECOVERY.md` — recovery runbook (already solved)

**Infra (Phase 2):**
- `infra/postgres-init/02-create-n8n-db.sql` — n8n DB + user
- `infra/docker-compose.yml` — n8n service + n8n_data volume + Caddy env
- `infra/Caddyfile` — `n8n.xovenmart.com` basicauth block
- `infra/backup.sh` — also dumps `xovenmart_n8n`
- `infra/ENV_N8N.md` — **the operator runbook** (read this first)
- `.env.example` — documents all new vars

**Pending (Phase 3):**
- `apps/n8n-workflows/` — empty, awaiting `messenger-inbound.json` + `system-prompt.txt`

---

## Resuming work

**If you're the operator:** open `infra/ENV_N8N.md` and follow it
top-to-bottom. Total time ≈ 30 min if you have Cloudflare and SSH access.

**If you're a future AI session continuing Phase 3:** the workflow
shape is documented above in "What's pending (Phase 3 — Messenger
workflow)". The first node is the webhook receiver — you'll need to
export it from a running n8n instance (or hand-craft the JSON, which
is tedious). Easier path: ask the operator to do it via n8n's UI and
share the exported JSON for you to commit.

**If you're a future AI session debugging Phase 2:** the diagnostic
endpoints are `GET https://api.xovenmart.com/api/v1/health/schema` and
`docker logs xovenmart-n8n`. The n8n DB lives at `xovenmart_n8n` with
the `n8n_user` role — connect with `PGPASSWORD=$N8N_DB_PASSWORD psql -h
postgres -U n8n_user -d xovenmart_n8n`.