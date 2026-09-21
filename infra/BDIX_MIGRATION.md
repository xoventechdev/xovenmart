# XovenMart — BDIX VPS Migration Runbook

**Source:** Hetzner CPX21 (Nuremberg, DE) — `169.58.46.162` (terminated)
**Target:** BDIX KVM VPS — `103.72.65.188` (root / `1111111111`)
**Stack:** Docker Compose + Caddy + Postgres (NOT the Contabo/PM2 stack in `infra/vps/bootstrap.sh` — do NOT run that script)

> **TL;DR — one-shot bootstrap:** If you have the DB dump at `/root/xovenmart_db.dump` on the new VPS already, you can skip this whole runbook and run the one-shot bootstrap script:
>
> ```bash
> ssh root@103.72.65.188
> passwd                           # change root password from 1111111111
> # from your LOCAL machine:
> scp ./xovenmart_db.dump root@103.72.65.188:/root/
> # back on the VPS:
> bash <(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/bdix-bootstrap.sh)
> ```
>
> That single curl runs everything below (apt update, Docker install, repo clone, .env write, postgres start, DB restore, full stack boot, healthcheck). It's idempotent.

---

## 0. Pre-flight (do this BEFORE touching the new VPS)

- [ ] Confirm the production DB dump file is on your LOCAL machine (not just the old VPS). User says: "I have backup of database (production)".
- [ ] Lower DNS TTL to **300s** on every A record at the registrar:
  - `api.xovenmart.com`
  - `xovenmart.com` (apex)
  - `www.xovenmart.com`
  - `admin.xovenmart.com`
  - Wait **≥ 24 hours** before cutover so the old TTL expires and DNS moves fast.
- [ ] Save the existing `infra/.env` and `infra/env.production.example` from the OLD VPS to LOCAL disk:
  ```bash
  scp root@169.58.46.162:/var/www/xovenmart/repo/infra/.env ./xovenmart.env.old
  ```
- [ ] Save the R2 bucket contents (the `api_uploads` volume) if any uploads weren't pushed to R2 yet. For now the migration plan below assumes R2 is the source of truth for image files and ONLY the DB is restored.

---

## 1. Connect to the new BDIX VPS

```bash
ssh root@103.72.65.188
# password: 1111111111
```

**First thing on a new box — change the root password:**
```bash
passwd
```
Enter a strong password (or paste from a password manager). Do not keep `1111111111`.

**Set the timezone to Asia/Dhaka:**
```bash
timedatectl set-timezone Asia/Dhaka
```

**Update the system:**
```bash
apt-get update && apt-get -y upgrade
```

---

## 2. Install Docker + Compose plugin

```bash
apt-get install -y ca-certificates curl gnupg

# Docker GPG key + repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify
docker --version
docker compose version
```

---

## 3. Cloned repo at `/var/www/xovenmart/repo`

```bash
# As root (we'll fix ownership after)
mkdir -p /var/www/xovenmart
cd /var/www/xovenmart
git clone https://github.com/xoventechdev/xovenmart.git repo
cd repo
git log --oneline -5   # confirm HEAD is the KIE fix commit or later
```

**Confirm the latest commit is at least `feb4215`** (the `/admin/ai/debug-last-failure` endpoint). If not:
```bash
git pull --rebase
git log --oneline -5
```

---

## 4. Write the `.env` file

The new BDIX box never had the old `.env`. Build it from the old one + new DB password (we'll set a new one in step 6).

```bash
cd /var/www/xovenmart/repo
cp infra/env.production.example infra/.env
nano infra/.env
```

Fill these values (from your `xovenmart.env.old` plus new values):

| Variable | Source |
|---|---|
| `PUBLIC_SITE_URL` | `https://xovenmart.com` |
| `PUBLIC_API_URL` | `https://api.xovenmart.com` |
| `DATABASE_URL` | `postgresql://xovenmart:NEW_PASSWORD@127.0.0.1:5432/xovenmart` (set NEW_PASSWORD below) |
| `JWT_SECRET` | copy from old `.env` — DO NOT regenerate (would invalidate all existing user sessions) |
| `JWT_ACCESS_TTL_SECONDS` | 900 |
| `JWT_REFRESH_TTL_SECONDS` | 2592000 |
| `BULKSMSBD_*` | copy from old |
| `BKASH_*` / `NAGAD_*` | copy from old |
| `NEXT_PUBLIC_OSM_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `R2_*` | copy from old |
| `FCM_*` | copy from old |
| `NEXT_PUBLIC_UMAMI_*` / `UMAMI_*` | copy from old |
| `SENTRY_DSN` | copy from old |
| `SMTP_ENCRYPTION_KEY` | **REGENERATE** (this key encrypts SMTP creds in the DB at rest, but you can leave SMTP providers reconfigured by admin login anyway) |
| `SMTP_DEV_*` | leave empty (not used in prod) |
| `BACKUP_*` | from `infra/.env.example` |
| **NEW** `POSTGRES_PASSWORD` | generate fresh — see step 5 |
| **NEW** `POSTGRES_USER` | `xovenmart` |
| **NEW** `POSTGRES_DB` | `xovenmart` |

Save and `chmod 600 infra/.env`.

---

## 5. Generate fresh POSTGRES password

```bash
openssl rand -base64 24
# Paste that as POSTGRES_PASSWORD in .env
```

---

## 6. Restore the production DB dump

The user has the dump file locally. Copy it to the new VPS:

```bash
# From YOUR LOCAL MACHINE
scp ./xovenmart_db.dump root@103.72.65.188:/root/xovenmart_db.dump
```

Then on the VPS, start ONLY postgres first (no api/web — they shouldn't be up while we restore):

```bash
cd /var/www/xovenmart/repo
docker compose up -d postgres
# wait for healthy
docker compose ps postgres   # should show "Up (healthy)" in ~10s
```

Restore the dump. The dump was made with `pg_dump -Fc` (custom format), so use `pg_restore`:

```bash
docker exec -i xovenmart-postgres pg_restore \
  -U xovenmart \
  -d xovenmart \
  --no-owner \
  --no-privileges \
  --role=xovenmart \
  --clean --if-exists \
  < /root/xovenmart_db.dump
```

If you see `ERROR: role "xovenmart" already exists` — ignore it (the dump has CREATE ROLE).
If you see `WARNING: errors ignored on restore: N` — check N. Common non-fatal warnings are PL/pgSQL extension mismatches.

**Verify row counts match expectation:**
```bash
docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
  SELECT
    (SELECT COUNT(*) FROM \"Product\") AS products,
    (SELECT COUNT(*) FROM \"Order\") AS orders,
    (SELECT COUNT(*) FROM \"AdminUser\") AS admins,
    (SELECT COUNT(*) FROM \"ProductImage\") AS images;
"
```

Compare with the row counts you had on the old VPS (run the same query on Hetzner before shutdown if you haven't already; the user's 173 image count suggests `ProductImage = 173`, orders/products you know).

---

## 7. Boot the full stack

```bash
cd /var/www/xovenmart/repo
docker compose up -d
docker compose ps   # all 5 services should be Up + healthy within ~30s
```

What you should see:
```
xovenmart-postgres  Up (healthy)
xovenmart-api       Up (healthy)
xovenmart-web       Up (healthy)
xovenmart-caddy     Up
xovenmart-backup    Up
```

**Verify API health from inside the container:**
```bash
docker exec xovenmart-api wget -qO- http://localhost:3001/api/v1/health
```

**Verify external reachability (after DNS is pointed):**
```bash
curl -I https://api.xovenmart.com/api/v1/health
curl -I https://xovenmart.com
```

---

## 8. DNS cutover

**Only after step 7 works AND DNS TTL is ≤ 300s on the old records:**

Repoint every A record at the registrar to `103.72.65.188`:
- `api.xovenmart.com`  → `103.72.65.188`
- `xovenmart.com`       → `103.72.65.188`
- `www.xovenmart.com`   → `103.72.65.188`
- `admin.xovenmart.com` → `103.72.65.188`

**Watch the propagation:**
```bash
watch -n 30 'dig +short api.xovenmart.com @8.8.8.8'
```
When it flips from the old Hetzner IP to `103.72.65.188`, propagation is done.

**Issue TLS cert via Caddy (auto-TLS via Cloudflare DNS challenge):**
Caddy auto-issues certs when it sees traffic, but only if the DNS A records already point to the box. So after propagation:
```bash
docker compose logs caddy | grep -i "certificate"
# Should show "obtained certificate" for each domain within 30s of first request
```

---

## 9. Tear down the old Hetzner VPS

**After DNS has fully propagated (≥ 1 hour) AND prod works on the BDIX box:**

1. Snapshot the old Hetzner VPS (Hetzner has a snapshot button — gives you a final fallback image).
2. Cancel the Hetzner subscription in their control panel.

Don't DELETE the snapshot for at least 30 days — keep the safety net.

---

## 10. Post-migration checks

- [ ] `curl -I https://xovenmart.com` → 200
- [ ] `curl -I https://api.xovenmart.com/api/v1/health` → 200
- [ ] `curl -I https://admin.xovenmart.com` → 200 (Next.js serves the admin UI)
- [ ] Log in to admin panel with existing admin password
- [ ] Verify product listing shows the same products as before
- [ ] Verify AI provider list is intact (Settings → AI Providers)
- [ ] Trigger the broken KIE provider test once → check `GET /admin/ai/debug-last-failure` shows the cause JSON (we shipped this in `feb4215`)
- [ ] Verify customer cart works on a fresh browser session (cookies don't survive a domain change)
- [ ] Check backup cron: `cat /etc/cron.d/xovenmart-backup` (should already exist if `infra/vps/backup.sh` ran)
- [ ] Wait 24h, verify R2 backup landed: log into Cloudflare → R2 → `xovenmart-backups` bucket

---

## Memory note: VPS is 4 GB / 3 vCPU / 30 GB SSD

The Hetzner box was the same 4 GB / 3 CPU spec; current `docker-compose.yml` Postgres tuning (`shared_buffers=256MB, effective_cache_size=1GB`) was sized for 4 GB total. BDIX box is 4 GB / 30 GB so:
- **RAM**: Same tuning works. Same mem_limits total (`1g postgres + 1g api + 1g web + 256m caddy + 256m backup` = ~3.5 GB hard cap).
- **Disk**: 30 GB instead of 80 GB. Monitor with `df -h /var/lib/docker` after a week. If `postgres_data` grows past 8 GB, prune the backup retention from `BACKUP_KEEP_DAYS=14` to `7`.

---

## Rollback plan (if the new VPS fails)

As long as the OLD Hetzner snapshot exists (step 9), restore it on Hetzner and repoint DNS back. Total time: ~30 min for the Hetzner restore + DNS TTL refresh.

If the snapshot was already deleted and the new VPS is broken, restore the DB dump on a brand-new VPS using steps 1-7 again. The schema is in `packages/db/prisma/schema.prisma` — running `docker compose up` rebuilds + migrates automatically via `docker-entrypoint.sh`.
