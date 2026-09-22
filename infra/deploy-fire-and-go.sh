#!/usr/bin/env bash
# =============================================================================
# XovenMart — fire-and-go non-interactive deploy
# =============================================================================
# Runs the entire migration unattended. Designed to be piped from curl
# when the operator can't sit at the terminal for 30+ minutes.
#
# What it does (no prompts, all defaults assumed):
#   1. Sanity check (root, Ubuntu, RAM >= 3.5 GB, dump present)
#   2. apt update + upgrade
#   3. Install Docker + Compose plugin (no-op if already present)
#   4. Clone repo to /var/www/xovenmart/repo (latest from main)
#   5. Write infra/.env with rotated secrets (POSTGRES_PASSWORD,
#      JWT_SECRET, JWT_REFRESH_SECRET, BACKUP_WEBHOOK_TOKEN,
#      SMTP_ENCRYPTION_KEY). Vendor keys (R2/SMS/FCM/Sentry) left
#      blank — operator fills them in stage 5.
#   6. Start postgres, wait for healthy
#   7. Restore /root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql
#   8. Print row-count verification
#   9. Start full stack (api/web/caddy/backup), wait for api healthy
#  10. Write /root/.xovenmart_post_bootstrap_notes with the EXACT
#      commands the operator needs to run after coming back:
#        - Reset an admin password (psql snippet)
#        - Paste vendor keys (nano + sed example)
#        - Repoint DNS (A record list)
#        - Verify TLS + end-to-end healthcheck
#
# Idempotent — safe to re-run.
#
# Usage (paste into SSH session):
#   bash <(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/deploy-fire-and-go.sh)
# =============================================================================

set -euo pipefail
trap 'rc=$?
  err "FAILED at line $LINENO (exit $rc). Last 40 lines of logs:"
  (cd /var/www/xovenmart/repo 2>/dev/null && docker compose -f /var/www/xovenmart/repo/infra/docker-compose.yml logs --tail=40 2>&1) || true
  exit $rc
' ERR

RST='\033[0m'; BOLD='\033[1m'
BLUE='\033[1;34m'; GREEN='\033[1;32m'
RED='\033[1;31m'; YELLOW='\033[1;33m'
log()  { printf "${BLUE}[fire-and-go]${RST} %s\n" "$*"; }
ok()   { printf "${GREEN}[fire-and-go]${RST} %s\n" "$*"; }
warn() { printf "${YELLOW}[fire-and-go]${RST} %s\n" "$*"; }
err()  { printf "${RED}[fire-and-go]${RST} %s\n" "$*" >&2; }

# ----- preflight -----
[[ $EUID -eq 0 ]] || { err "must run as root"; exit 1; }
VPS_IP=$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
log "VPS IP: $VPS_IP"

if [[ ! -f /root/.xovenmart_password_changed ]]; then
  err "Root password NOT changed yet."
  err "Run this BEFORE running fire-and-go:"
  err "  passwd"
  err "  touch /root/.xovenmart_password_changed"
  err "Then re-run this script."
  exit 1
fi

DUMP_FILE="${DUMP_FILE:-/root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql}"
if [[ ! -f "$DUMP_FILE" ]]; then
  err "DB dump not found at $DUMP_FILE"
  err "Upload it from your laptop first:"
  err "  scp 'xovenmart-manual-*.sql' root@$VPS_IP:/root/"
  exit 1
fi
ok "Dump present: $DUMP_FILE ($(du -h "$DUMP_FILE" | awk '{print $1}'))"

# Resource check
TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
DISK_FREE=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
if (( TOTAL_MB < 3500 )); then
  warn "RAM is ${TOTAL_MB}MB — bootstrap expects >= 3500MB. Will try anyway."
fi
if (( DISK_FREE < 5 )); then
  err "Disk free is ${DISK_FREE}GB — need >= 5GB for images. Aborting."
  exit 1
fi
ok "Resources OK (RAM=${TOTAL_MB}MB, disk=${DISK_FREE}GB free)"

# ----- 2. apt + 3. docker -----
log "apt update + upgrade..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker + Compose plugin..."
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ok "Docker installed: $(docker --version)"
else
  ok "Docker already installed: $(docker --version)"
fi

# ----- 4. clone repo -----
REPO_DIR="/var/www/xovenmart/repo"
mkdir -p /var/www/xovenmart
if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "Cloning repo to $REPO_DIR..."
  git clone --depth 50 https://github.com/xoventechdev/xovenmart.git "$REPO_DIR"
else
  log "Repo exists, fast-forwarding to latest main..."
  cd "$REPO_DIR"
  git fetch --depth 50 origin main
  git reset --hard origin/main
fi
ok "Repo at HEAD: $(cd "$REPO_DIR" && git log -1 --oneline)"

# ----- 5. write .env -----
ENV_FILE="$REPO_DIR/infra/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Writing $ENV_FILE with rotated secrets..."
  # The docker-compose template lives at the repo root as .env.example
  # (apps/api/env.production.example is for cPanel and lacks DATABASE_URL).
  [[ -f "$REPO_DIR/.env.example" ]] || { err ".env.example missing at repo root"; exit 1; }
  cp "$REPO_DIR/.env.example" "$ENV_FILE"

  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-kFCJORSKAZ7QNfWRo0DVUFMr}"
  BACKUP_WEBHOOK_TOKEN="${BACKUP_WEBHOOK_TOKEN:-7c45706b0391b5a155432df0aa7271e85d14598e631c65f7e1fdbdbbee66d71d}"
  SMTP_ENCRYPTION_KEY="${SMTP_ENCRYPTION_KEY:-hxpDfl0MyW7FYgybKZcraFyZjchpZBB9yBujAnX6tws=}"
  JWT_SECRET_NEW="$(openssl rand -base64 48 | tr -d '\n')"
  JWT_REFRESH_SECRET_NEW="$(openssl rand -base64 48 | tr -d '\n')"

  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed -i "s|^BACKUP_WEBHOOK_TOKEN=.*|BACKUP_WEBHOOK_TOKEN=${BACKUP_WEBHOOK_TOKEN}|" "$ENV_FILE"
  sed -i "s|^SMTP_ENCRYPTION_KEY=.*|SMTP_ENCRYPTION_KEY=${SMTP_ENCRYPTION_KEY}|" "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_NEW}|" "$ENV_FILE"
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET_NEW}|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  # Save rotated secrets off the VPS-readable path
  cat > /root/.xovenmart_secrets_rotated <<EOF
# Generated by fire-and-go on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# SAVE OFF-BOX — needed to recover sessions / decrypt SMTP creds.
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
BACKUP_WEBHOOK_TOKEN=${BACKUP_WEBHOOK_TOKEN}
SMTP_ENCRYPTION_KEY=${SMTP_ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET_NEW}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET_NEW}
EOF
  chmod 600 /root/.xovenmart_secrets_rotated
  ok "Wrote $ENV_FILE + /root/.xovenmart_secrets_rotated"
else
  warn "$ENV_FILE already exists, not regenerating. Delete it to force re-rotation."
fi

# ----- 6. postgres -----
log "Starting postgres..."
cd "$REPO_DIR"
# Use -f explicitly so the script works regardless of cwd. The compose file
# lives in infra/, not at the repo root, so a plain `docker compose up`
# would fail with "no configuration file provided".
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.yml"
[[ -f "$COMPOSE_FILE" ]] || { err "compose file missing at $COMPOSE_FILE"; exit 1; }
docker compose -f "$COMPOSE_FILE" up -d postgres
log "Waiting for postgres healthcheck..."
for i in {1..60}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xovenmart-postgres 2>/dev/null || echo "starting")
  if [[ "$STATUS" == "healthy" ]]; then ok "postgres healthy"; break; fi
  if [[ $i -eq 60 ]]; then err "postgres did not become healthy in 60s"; docker logs --tail=60 xovenmart-postgres; exit 1; fi
  sleep 1
done

# ----- 7. restore dump -----
log "Restoring DB dump via psql..."
if [[ "$DUMP_FILE" == *.sql ]]; then
  docker exec -i xovenmart-postgres psql \
    -U xovenmart -d xovenmart \
    -v ON_ERROR_STOP=0 --single-transaction \
    < "$DUMP_FILE" 2>&1 | tail -10 || warn "some restore warnings (usually non-fatal)"
else
  docker exec -i xovenmart-postgres pg_restore \
    -U xovenmart -d xovenmart \
    --no-owner --no-privileges --role=xovenmart --clean --if-exists \
    < "$DUMP_FILE" 2>&1 | tail -10 || warn "some restore warnings (usually non-fatal)"
fi
ok "DB restore finished"

# ----- 8. row counts -----
log "Row counts:"
docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
  SELECT
    (SELECT COUNT(*) FROM \"Product\")      AS products,
    (SELECT COUNT(*) FROM \"Order\")        AS orders,
    (SELECT COUNT(*) FROM \"AdminUser\")    AS admins,
    (SELECT COUNT(*) FROM \"ProductImage\") AS images;
" 2>&1 | tee /root/.xovenmart_row_counts.txt

# ----- 9. boot stack -----
log "Booting full stack..."
docker compose -f "$COMPOSE_FILE" up -d
log "Waiting for api healthcheck..."
for i in {1..90}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xovenmart-api 2>/dev/null || echo "starting")
  if [[ "$STATUS" == "healthy" ]]; then ok "api healthy"; break; fi
  if [[ $i -eq 90 ]]; then err "api did not become healthy in 90s"; docker logs --tail=80 xovenmart-api; exit 1; fi
  sleep 1
done

# Container status
log "Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep xovenmart || true

# ----- 10. write post-bootstrap notes -----
cat > /root/.xovenmart_post_bootstrap_notes.md <<EOF
# XovenMart — Post-Bootstrap Checklist (do these when you're back)

Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
VPS IP:    ${VPS_IP}

## 1. Save rotated secrets OFF the VPS

  scp root@${VPS_IP}:/root/.xovenmart_secrets_rotated ~/

This file is the ONLY copy of the rotated JWT secrets. If the VPS dies,
every customer + admin session becomes invalid.

## 2. Reset at least one admin password (since email-reset won't work)

List admin emails:
  docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c \\
    'SELECT id, email, role, "isActive" FROM "AdminUser";'

Reset one:
  docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
    UPDATE \"AdminUser\"
    SET password_hash = crypt('NEW_PASSWORD_HERE', gen_random_bytes(6))
    WHERE email = 'you@example.com';
  "

## 3. Paste vendor keys (R2, BULKSMSBD, FCM, Sentry)

  nano /var/www/xovenmart/repo/infra/.env

Fill the blank R2_*, BULKSMSBD_*, FCM_*, SENTRY_DSN lines
(get fresh keys from each vendor's dashboard — the old keys were
on the lost old .env).

Then restart:
  cd /var/www/xovenmart/repo
  docker compose up -d

## 4. Repoint DNS

At your domain registrar, update A records:
  api.xovenmart.com    A  ${VPS_IP}
  xovenmart.com         A  ${VPS_IP}
  www.xovenmart.com     A  ${VPS_IP}
  admin.xovenmart.com   A  ${VPS_IP}

If TTL was lowered to 300s, propagation: ~5 min.
If old TTL was 3600s: ~1 hour.

## 5. Verify TLS + end-to-end

After DNS resolves:
  docker logs xovenmart-caddy 2>&1 | grep -i "certificate obtained"

Final:
  curl -I https://api.xovenmart.com/api/v1/health

Expected: HTTP/2 200

## 6. Save rotated secrets

  scp root@${VPS_IP}:/root/.xovenmart_secrets_rotated ~/

## 7. When all verified, cancel old Hetzner subscription

(after at least 24h to confirm everything stable)
EOF
chmod 644 /root/.xovenmart_post_bootstrap_notes.md

# ----- final summary -----
cat <<EOF

${GREEN}================================================================${RST}
${GREEN} FIRE-AND-GO COMPLETE${RST}
${GREEN}================================================================${RST}

What ran unattended:
  - apt update + upgrade
  - Docker + Compose plugin installed (or already there)
  - Repo cloned to /var/www/xovenmart/repo
  - /var/www/xovenmart/repo/infra/.env written with rotated secrets
  - Postgres started + healthy
  - DB dump restored (${DUMP_FILE})
  - Row counts printed (also at /root/.xovenmart_row_counts.txt)
  - Full stack (api/web/caddy/backup) started + api healthy

What YOU still need to do (saved at /root/.xovenmart_post_bootstrap_notes.md):
  1. scp /root/.xovenmart_secrets_rotated off the VPS
  2. Reset an admin password via direct psql
  3. Paste vendor keys (R2/SMS/FCM/Sentry) into infra/.env
  4. Repoint DNS A records to ${VPS_IP}
  5. Verify TLS + curl -I https://api.xovenmart.com/api/v1/health

If something went wrong, the trap handler prints the last 40 lines of
docker logs on exit. Re-run any time — it's idempotent.

EOF
ok "Done. Run 'cat /root/.xovenmart_post_bootstrap_notes.md' to see the checklist."
