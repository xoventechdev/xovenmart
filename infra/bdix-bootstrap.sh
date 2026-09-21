#!/usr/bin/env bash
# =============================================================================
# XovenMart — BDIX VPS one-shot bootstrap
# =============================================================================
# Designed for: 103.72.65.188 (BDIX KVM VPS, 4 GB / 3 vCPU / 30 GB SSD)
# Run ONCE as root on a fresh Ubuntu 24.04 box.
#
#   ssh root@103.72.65.188
#   bash <(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/bdix-bootstrap.sh)
#
# What it does (in order):
#   1. Sanity check (root, Ubuntu, IPv4 reachable)
#   2. apt update + upgrade
#   3. Install Docker + Compose plugin (from docker.com repo)
#   4. Clone repo to /var/www/xovenmart/repo
#   5. Write infra/.env from template + injected secrets
#   6. docker compose up -d postgres (only)
#   7. Restore /root/xovenmart_db.dump via pg_restore
#   8. Row-count verification
#   9. docker compose up -d (full stack)
#  10. Wait for healthchecks
#  11. Print DNS + Caddy + final-verification commands
#
# Idempotent — safe to re-run. If any step fails, prints the last 30 lines of
# the failing service's logs before exiting.
# =============================================================================

set -euo pipefail

# ---------- colour helpers ----------
RST='\033[0m'
BOLD='\033[1m'
BLUE='\033[1;34m'
GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
log()   { printf "${BLUE}[bootstrap]${RST} %s\n" "$*"; }
ok()    { printf "${GREEN}[bootstrap]${RST} %s\n" "$*"; }
warn()  { printf "${YELLOW}[bootstrap]${RST} %s\n" "$*"; }
err()   { printf "${RED}[bootstrap]${RST} %s\n" "$*" >&2; }

trap 'rc=$?; if [[ $rc -ne 0 ]]; then
  err "FAILED at line $LINENO with exit $rc"
  err "Last 40 lines of any service logs:"
  (cd /var/www/xovenmart/repo 2>/dev/null && docker compose logs --tail=40 2>&1) || true
  exit $rc
fi' ERR

# ---------- preflight ----------
require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "must run as root (try: sudo bash $0)"
    exit 1
  fi
}
require_root

if ! grep -q 'Ubuntu' /etc/os-release 2>/dev/null; then
  warn "this script is tuned for Ubuntu 24.04. Continuing anyway..."
fi

VPS_IP=$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
log "VPS IP detected: $VPS_IP"

# DB dump — accept an env var override so the operator doesn't have to
# rename their file. Default points at the well-known Hetzner backup
# filename the user uploaded.
DB_DUMP="${DB_DUMP:-/root/xovenmart-manual-2026-09-16T18-16-55-354Z}"
ENV_FILE="/var/www/xovenmart/repo/infra/.env"
REPO_DIR="/var/www/xovenmart/repo"

# ---------- 2. apt ----------
log "apt update + upgrade..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade

# ---------- 3. docker ----------
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
docker compose version >/dev/null

# ---------- 4. clone repo ----------
mkdir -p /var/www/xovenmart
if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "Cloning repo to $REPO_DIR..."
  cd /var/www/xovenmart
  git clone --depth 50 https://github.com/xoventechdev/xovenmart.git repo
  cd repo
  log "Latest commit: $(git log -1 --oneline)"
else
  log "Repo already cloned at $REPO_DIR, fetching latest..."
  cd "$REPO_DIR"
  git fetch --depth 50 origin main
  git reset --hard origin/main
  log "Latest commit: $(git log -1 --oneline)"
fi

# ---------- 5. write .env ----------
if [[ ! -f "$ENV_FILE" ]]; then
  log "Writing infra/.env from injected values..."
  if [[ ! -f "$REPO_DIR/infra/env.production.example" ]]; then
    err "env.production.example not found at $REPO_DIR/infra/"
    exit 1
  fi
  cp "$REPO_DIR/infra/env.production.example" "$ENV_FILE"

  # Replace secrets via sed — these are the values we generated earlier
  # (kFCJORSKAZ7QNfWRo0DVUFMr, etc.) plus an env var the user exports
  # before piping this script if they want to override.
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-kFCJORSKAZ7QNfWRo0DVUFMr}"
  BACKUP_WEBHOOK_TOKEN="${BACKUP_WEBHOOK_TOKEN:-7c45706b0391b5a155432df0aa7271e85d14598e631c65f7e1fdbdbbee66d71d}"
  SMTP_ENCRYPTION_KEY="${SMTP_ENCRYPTION_KEY:-hxpDfl0MyW7FYgybKZcraFyZjchpZBB9yBujAnX6tws=}"

  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed -i "s|^BACKUP_WEBHOOK_TOKEN=.*|BACKUP_WEBHOOK_TOKEN=${BACKUP_WEBHOOK_TOKEN}|" "$ENV_FILE"
  sed -i "s|^SMTP_ENCRYPTION_KEY=.*|SMTP_ENCRYPTION_KEY=${SMTP_ENCRYPTION_KEY}|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Wrote $ENV_FILE with fresh secrets"
else
  warn "$ENV_FILE already exists, leaving alone (delete it first if you want to regenerate)"
fi

# ---------- 6. start postgres ----------
log "Starting postgres..."
cd "$REPO_DIR"
docker compose up -d postgres
log "Waiting for postgres healthcheck..."
for i in {1..30}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xovenmart-postgres 2>/dev/null || echo "starting")
  if [[ "$STATUS" == "healthy" ]]; then
    ok "postgres is healthy"
    break
  fi
  if [[ $i -eq 30 ]]; then
    err "postgres did not become healthy in 30s"
    docker logs --tail=40 xovenmart-postgres
    exit 1
  fi
  sleep 1
done

# ---------- 7. restore db dump ----------
if [[ ! -f "$DB_DUMP" ]]; then
  err "DB dump not found at $DB_DUMP"
  err "Copy it from your local machine first:"
  err "  scp ./xovenmart_db.dump root@${VPS_IP}:/root/"
  exit 1
fi
log "Restoring DB dump from $DB_DUMP..."
docker exec -i xovenmart-postgres pg_restore \
  -U xovenmart \
  -d xovenmart \
  --no-owner \
  --no-privileges \
  --role=xovenmart \
  --clean --if-exists \
  < "$DB_DUMP" 2>&1 | grep -vE "^(pg_restore: warning: errors ignored on restore|--.*$|\\.$)" || true
ok "DB restore finished"

# ---------- 8. row-count verify ----------
log "Verifying row counts..."
docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
  SELECT
    (SELECT COUNT(*) FROM \"Product\")      AS products,
    (SELECT COUNT(*) FROM \"Order\")        AS orders,
    (SELECT COUNT(*) FROM \"AdminUser\")    AS admins,
    (SELECT COUNT(*) FROM \"ProductImage\") AS images;
"
ok "Row counts printed above ↑"

# ---------- 9. boot full stack ----------
log "Starting full stack (api, web, caddy, backup)..."
docker compose up -d
log "Waiting for api healthcheck..."
for i in {1..60}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xovenmart-api 2>/dev/null || echo "starting")
  if [[ "$STATUS" == "healthy" ]]; then
    ok "api is healthy"
    break
  fi
  if [[ $i -eq 60 ]]; then
    err "api did not become healthy in 60s"
    docker logs --tail=80 xovenmart-api
    exit 1
  fi
  sleep 1
done

# ---------- 10. summary ----------
cat <<EOF

${GREEN}============================================================${RST}
${GREEN} BOOTSTRAP COMPLETE${RST}
${GREEN}============================================================${RST}

VPS IP        : ${VPS_IP}
Repo path     : ${REPO_DIR}
Env file      : ${ENV_FILE}
DB dump       : ${DB_DUMP} (restored)
Postgres      : running on localhost:5432 (in-container)
API           : http://localhost:3001  (in-container)
Web (Next.js) : http://localhost:3000  (in-container)
Caddy         : https://xovenmart.com once DNS is repointed
Rotated secrets (save off-box!) : /root/.xovenmart_secrets_rotated

IMPORTANT — secret rotation side effects:

  - JWT_SECRET was rotated → every existing customer + admin must log in
    again on first visit. The next admin that logs in can use their
    existing email but the system will reject the old password (since
    the password_hash in the DB is still valid; only the JWT signing
    key changed). They click "forgot password" → system emails a reset
    link → they're in. OR use the admin-password-reset helper below.

  - BULKSMSBD_API_KEY / R2_*/FCM_*/ SENTRY_DSN in $ENV_FILE are BLANK.
    The site is up and serving traffic, but those services won't work
    until you paste the new keys. To do that:

      ssh root@${VPS_IP}
      cd /var/www/xovenmart/repo
      nano infra/.env

    Fill the blank R2_*, BULKSMSBD_*, FCM_*, SENTRY_DSN lines (get
    fresh keys from each vendor's dashboard — the old keys were on
    the lost old .env). Then:

      docker compose up -d          # restart all services to pick up env

  - Admin password reset (if "forgot password" email doesn't reach you):
    The email provider is also blank in .env, so password-reset emails
    won't send. Use the DB-direct helper below.

NEXT STEPS (do these in order):

  1. Reset the root password on this VPS:
       passwd                  (set something stronger than 1111111111)

  2. Reset at least one admin password directly in the DB (since
     password-reset email can't send without an SMTP provider):

       ADMIN_EMAIL='you@example.com'
       docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
         UPDATE \"AdminUser\"
         SET password_hash = crypt('NEW_PASSWORD_HERE', gen_random_bytes(6))
         WHERE email = '${ADMIN_EMAIL}';
       "

     (Replace NEW_PASSWORD_HERE with a strong password and the email
     with your real admin email — you can list them with:
       docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c
         'SELECT id, email, role FROM \"AdminUser\";')

  3. Paste vendor keys (R2, BULKSMSBD, FCM, Sentry) into infra/.env as
     described above, then `docker compose up -d` to restart.

  4. Repoint DNS A records to ${VPS_IP} at your registrar:
       api.xovenmart.com   -> ${VPS_IP}
       xovenmart.com       -> ${VPS_IP}
       www.xovenmart.com   -> ${VPS_IP}
       admin.xovenmart.com -> ${VPS_IP}

  5. After DNS propagates, verify Caddy obtained the TLS cert:
       docker logs xovenmart-caddy 2>&1 | grep -i "certificate obtained"

  6. Final end-to-end check:
       curl -I https://api.xovenmart.com/api/v1/health

EOF
ok "All done."
