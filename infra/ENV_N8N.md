# n8n env vars + first-boot runbook

This file is the operator's checklist for bringing n8n online. The CI/CD
pipeline (`git push xovenmart main` → Coolify) does NOT auto-add new
services to a running compose stack — the operator SSHes in once and
runs the steps below after the first push that contains these files.

## What's in this deployment

| File                                        | What it does                              |
| ------------------------------------------- | ----------------------------------------- |
| `postgres-init/02-create-n8n-db.sql`        | Creates `xovenmart_n8n` DB + `n8n_user`   |
| `docker-compose.yml` (new `n8n` service)    | Runs the `n8nio/n8n:latest` container     |
| `docker-compose.yml` (new `n8n_data` vol)   | Persists workflows + credentials across restarts |
| `Caddyfile` (new `n8n.xovenmart.com` block) | TLS + basicauth for the n8n UI            |
| `backup.sh` (extended)                      | Also dumps `xovenmart_n8n` nightly to R2  |

## Threat-model reminder

`xovenmart_n8n` is a **physically separate database** from `xovenmart`.
`n8n_user` has ZERO grants on `xovenmart` tables and vice versa. An
n8n RCE (malicious workflow node, credential-stealing template, etc.)
cannot read or write product/order/user data — it can only reach
workflow definitions and execution history.

## Step 0 — DNS (one-time, before first Caddy boot)

The Caddy block uses Cloudflare's DNS-01 challenge, so we just need
the A record in place before the cert is issued. (We do NOT need BD
ISP outbound :80 to be reachable.)

In Cloudflare DNS for `xovenmart.com`:

| Type | Name | Content              | Proxy |
| ---- | ---- | -------------------- | ----- |
| A    | n8n  | `<Hetzner VPS IP>`   | ON    |

(Caddy reads the cert at first `docker compose up`, which happens in
Step 4. If the DNS isn't there yet, Caddy will retry until it is.)

## Step 1 — Generate secrets

From the VPS, in the repo root:

```bash
# n8n Postgres user password. MUST match what we bake into
# infra/postgres-init/02-create-n8n-db.sql (see Step 2 below).
openssl rand -base64 24

# n8n's at-rest credential-encryption key.
# LOSS OF THIS KEY = LOSS OF ALL N8N CREDENTIALS (incl. Meta tokens,
# the bot service token). Back this up to your password manager
# alongside JWT_SECRET.
openssl rand -hex 32

# Caddy basic-auth password (the one you'll TYPE in the browser).
# Pick a memorable password, then hash it:
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-plaintext-password'
# → outputs something like $2a$14$abc...xyz
# COPY THAT HASH — that's what goes into N8N_ADMIN_PASSWORD_HASHED.

# Bot service token (long-lived JWT with aud=BOT, used by n8n to call
# the API's bot/* endpoints). Could be the API itself that mints this,
# but for first boot we generate it here and write to AppSetting later.
openssl rand -hex 32

# Internal ingest secret (API → n8n webhook auth).
openssl rand -hex 32

# Meta verify token (any string you choose — Meta echoes it back on
# the GET handshake to confirm ownership).
openssl rand -hex 24
```

## Step 2 — Bake the Postgres password

The init script runs ONCE on first Postgres boot, before any service
sees the DB. We have to hard-code the password there.

Edit `infra/postgres-init/02-create-n8n-db.sql` and replace
`'CHANGE_ME_N8N_DB_PASSWORD'` with the `openssl rand -base64 24`
output from Step 1.

> ⚠️ Commit this change BEFORE the first boot that triggers the init.
> If you SSH in and run `docker compose up -d postgres` first, the init
> has already run and you'll have to wipe the `postgres_data` volume
> to re-run it.

The `.env` file on the VPS gets the same value as `N8N_DB_PASSWORD`
(see Step 3).

## Step 3 — Update the VPS `.env`

On the VPS (`/var/www/xovenmart/api/shared/.env` per the existing
Coolify setup, or wherever your compose `.env` lives):

```env
# n8n
N8N_DB_PASSWORD=<same as Step 2>
N8N_ENCRYPTION_KEY=<openssl rand -hex 32>
N8N_ADMIN_USER=admin
N8N_ADMIN_PASSWORD_HASHED=<caddy hash-password output>

# Bot
N8N_BOT_SERVICE_TOKEN=<openssl rand -hex 32>
N8N_INGEST_SECRET=<openssl rand -hex 32>

# Messenger (we'll fill these in when we ship the workflow — leave
# blank for now and the webhooks will 401 until they're set)
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=
META_VERIFY_TOKEN=<openssl rand -hex 24>
```

## Step 4 — Push, then start the new services

```bash
# From dev machine — push the new files:
git add infra/postgres-init/02-create-n8n-db.sql \
        infra/docker-compose.yml \
        infra/Caddyfile \
        infra/backup.sh \
        .env.example
git commit -m "feat(infra): add n8n service for chat automation (Phase 2)"
git push xovenmart main

# Coolify will rebuild and restart the existing 5 services. n8n won't
# come up automatically because Coolify doesn't auto-add new services
# to a running compose stack — we have to bring it up ourselves.

# On the VPS:
cd /opt/xovenmart   # or wherever your infra/ dir lives
docker compose -f infra/docker-compose.yml up -d n8n
```

The first boot of `n8n`:
1. Waits for `postgres` healthcheck (already up).
2. Connects to `xovenmart_n8n` DB with the n8n_user role.
3. Runs its schema migrations (creates workflowentity, credentialsentity, etc.).
4. Starts the editor on port 5678.

Caddy will pick up the new site block on its next reload (auto-reloads
when the file changes — `caddy:2-alpine` watches `/etc/caddy/Caddyfile`).

## Step 5 — Smoke test

```bash
# 1. The UI should 401 with the basic-auth prompt:
curl -I https://n8n.xovenmart.com/
# → HTTP/2 401
# → Www-Authenticate: Basic realm="restricted"

# 2. With auth:
curl -I -u admin:your-plaintext-password https://n8n.xovenmart.com/
# → HTTP/2 200

# 3. n8n connected to the right DB:
docker logs xovenmart-n8n 2>&1 | grep -i 'database\|migration'
# → "Migrations completed" or similar

docker exec -it xovenmart-n8n n8n --version
# → 1.x.x

# 4. The bot API still works (no regression):
curl -k https://api.xovenmart.com/api/v1/health
```

## Step 6 — Set up the bot service token

Once n8n is up, we need to give it a real bot service token. Two options:

### Option A (recommended): Let the API mint it at boot

The API already issues one at boot (`apps/api/src/modules/bot/.../bot-auth.service.ts`).
The plaintext lives in `process.env.N8N_BOT_SERVICE_TOKEN` and the same
value is written to `AppSetting.bot.serviceToken` for rotation.

So if Step 3 set `N8N_BOT_SERVICE_TOKEN` to a hex string, the API
already has it. The challenge is getting it INTO n8n. In n8n:

1. Go to Credentials → New → "Header Auth".
2. Name: `XovenMart API Bot`.
3. Header name: `Authorization`.
4. Header value: `Bearer <N8N_BOT_SERVICE_TOKEN from .env>`.
5. Save.

### Option B: Skip the env var, write directly to AppSetting

If you prefer to manage rotation via `POST /api/v1/bot/auth/rotate`
(no env redeploy needed), start the API without `N8N_BOT_SERVICE_TOKEN`
set — the API will throw on boot because the token isn't optional.

(Today Option A is the only supported path. Option B is Phase 4.)

## Step 7 — Meta webhook setup (defer until Phase 3)

For Messenger to work, we need the Meta App to point its webhook at
`https://xovenmart.com/api/v1/bot/webhooks/messenger` (using the main
site's Caddy block — which already routes /api/* to the API via Next.js,
or will once we add the direct-route option, see Phase 1 README).

The webhook URL is configured in Phase 3 when we import the workflow.

## Rotating the n8n encryption key

**Don't.** If you lose `N8N_ENCRYPTION_KEY`, every credential stored in
n8n becomes permanently unreadable — including the bot service token,
Meta page access token, and any future Telegram/WhatsApp creds. You
must re-enter them all manually.

The 7-day execution history in `EXECUTIONS_DATA_MAX_AGE` does NOT
depend on this key — those are plain JSON.

## Rotating the n8n DB password

If `N8N_DB_PASSWORD` is leaked:

```bash
# 1. Generate new password
openssl rand -base64 24

# 2. Update the Postgres role (live, doesn't restart anything)
docker exec -it xovenmart-postgres \
  psql -U xovenmart -d postgres \
  -c "ALTER USER n8n_user WITH PASSWORD 'new-password';"

# 3. Update the VPS .env: N8N_DB_PASSWORD=new-password
#    AND the backup container's N8N_DB_PASSWORD (same value).

# 4. Restart n8n to pick up the new env
docker compose -f infra/docker-compose.yml restart n8n

# 5. Restart backup to pick up the new env
docker compose -f infra/docker-compose.yml restart backup
```

The `02-create-n8n-db.sql` does NOT need to be re-edited — it only
runs on first boot of a fresh `postgres_data` volume.