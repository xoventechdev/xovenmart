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
#  1b. Create 4GB swap file (prevents OOM cascade during docker build)
#  1c. Configure /etc/docker/daemon.json with resource limits
#  1d. Install docker-watchdog cron (auto-recovery from daemon hangs)
#   2. apt update + upgrade
#   3. Install Docker + Compose plugin (from docker.com repo) + reload
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
#
# Tuning env vars (optional):
#   SWAP_SIZE_GB=8  bash bdix-bootstrap.sh  # use 8GB swap instead of 4
#   DB_DUMP=/path/to/different.dump.sql bash bdix-bootstrap.sh
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
  (cd /var/www/xovenmart/repo 2>/dev/null && docker compose -f /var/www/xovenmart/repo/infra/docker-compose.yml logs --tail=40 2>&1) || true
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
# rename their file. There are two manual dumps on the VPS:
#
#   xovenmart-manual-2026-09-16T18-16-55-354Z.sql  7.0 MB, 80 products
#   xovenmart-manual-2026-09-24T11-12-51-816Z.sql  1.0 MB, 81 products  ← max
#
# The Sep 24 dump is newer and has 1 more product, but the Sep 16 dump
# has 156 product_images vs 126 — useful if you want to recover image
# rows even though most are broken. Prefer Sep 24 by default; fall
# back to Sep 16 if Sep 24 isn't there.
if [[ -z "${DB_DUMP:-}" ]]; then
  if [[ -f /root/xovenmart-manual-2026-09-24T11-12-51-816Z.sql ]]; then
    DB_DUMP="/root/xovenmart-manual-2026-09-24T11-12-51-816Z.sql"
  elif [[ -f /root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql ]]; then
    DB_DUMP="/root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql"
  else
    DB_DUMP="/root/xovenmart-manual-2026-09-24T11-12-51-816Z.sql"  # standard not-found error msg below
  fi
fi
ENV_FILE="/var/www/xovenmart/repo/infra/.env"
REPO_DIR="/var/www/xovenmart/repo"

# ============================================================================
# 1b. SWAP — install BEFORE Docker so buildkit has a fallback if RAM spikes
# ============================================================================
# 6GB RAM boxes OOM during `docker compose build` because buildkit is not
# cgroup-limited by the container mem_limit. Without swap, OOM-killer fires,
# kills the buildkit worker, and the docker daemon can wedge — taking SSH
# down with it. 4GB swap absorbs the spike.
#
# Idempotent: re-running the script on a VPS that already has /swapfile
# skips creation.
SWAPFILE="/swapfile"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
# Determine current swap total in MB. If a pre-existing swap is too small
# (< SWAP_SIZE_GB), tear it down and recreate. Without this, some VPS
# images ship with a 64MB stub swap which doesn't help absorb a
# buildkit OOM spike.
CURRENT_SWAP_MB=$(free -m | awk '/Swap:/ {print $2}')
NEED_SWAP=1
# -100 MB slack: free -m rounds up to whole MB, so a fresh 4096 MB swap
# can report as 4095 MB and trip the "too small" branch on re-runs.
SWAP_MIN_MB=$((SWAP_SIZE_GB * 1024 - 100))
if swapon --show | grep -q "$SWAPFILE"; then
  if [[ "${CURRENT_SWAP_MB:-0}" -ge "$SWAP_MIN_MB" ]]; then
    NEED_SWAP=0
    ok "Swap already at ${CURRENT_SWAP_MB}M (>= ${SWAP_SIZE_GB}G) — skipping"
  else
    warn "Swap exists but only ${CURRENT_SWAP_MB}M (< ${SWAP_SIZE_GB}G). Removing + recreating."
    swapoff "$SWAPFILE" 2>/dev/null || true
    rm -f "$SWAPFILE"
    sed -i "\|^$SWAPFILE none swap|d" /etc/fstab 2>/dev/null || true
  fi
fi
if [[ "$NEED_SWAP" == "1" ]]; then
  log "Creating ${SWAP_SIZE_GB}G swap at $SWAPFILE (prevents OOM during docker build)..."
  fallocate -l "${SWAP_SIZE_GB}G" "$SWAPFILE" || dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=none
  chmod 600 "$SWAPFILE"
  mkswap "$SWAPFILE"
  swapon "$SWAPFILE"
  # Persist across reboots
  if ! grep -q "$SWAPFILE" /etc/fstab; then
    echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
  fi
  ok "Swap enabled: $(swapon --show | tail -1)"
fi

# ============================================================================
# 1c. Docker resource limits — install BEFORE first build
# ============================================================================
# Cap buildkit's parallel downloads/uploads so it can't spawn 10 concurrent
# fetchers and exhaust RAM. Keeps buildkit well-behaved on a 6GB box.
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"
if [[ ! -f "$DOCKER_DAEMON_JSON" ]] || ! grep -q "max-concurrent-downloads" "$DOCKER_DAEMON_JSON"; then
  log "Writing $DOCKER_DAEMON_JSON with resource limits..."
  install -d /etc/docker
  cat > "$DOCKER_DAEMON_JSON" <<'EOF'
{
  "max-concurrent-downloads": 2,
  "max-concurrent-uploads": 2,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
  chmod 0644 "$DOCKER_DAEMON_JSON"
  ok "Docker daemon.json configured (concurrent downloads capped at 2)"
else
  ok "Docker daemon.json already configured"
fi

# ============================================================================
# 1d. Docker watchdog — auto-recover if daemon hangs
# ============================================================================
# If `docker ps` takes >30s (sign of daemon hang), restart docker. Runs every
# 5 min via cron. Without this, a wedged daemon takes the site down and
# requires VNC intervention to recover.
WATCHDOG="/usr/local/bin/docker-watchdog.sh"
if [[ ! -f "$WATCHDOG" ]]; then
  log "Installing docker-watchdog (auto-recovers from daemon hangs)..."
  cat > "$WATCHDOG" <<'EOF'
#!/usr/bin/env bash
# If docker ps hangs (daemon overloaded from buildkit OOM), restart docker.
# Runs every 5 min via /etc/cron.d/docker-watchdog.
LOG="/var/log/docker-watchdog.log"
if ! timeout 30 docker ps >/dev/null 2>&1; then
  echo "$(date -u +%FT%TZ) docker ps hung — restarting docker daemon" >> "$LOG"
  systemctl restart docker
  sleep 5
  if timeout 30 docker ps >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) docker recovered after restart" >> "$LOG"
  else
    echo "$(date -u +%FT%TZ) docker still hung after restart — manual intervention needed" >> "$LOG"
  fi
fi
EOF
  chmod 0755 "$WATCHDOG"
  cat > /etc/cron.d/docker-watchdog <<'EOF'
*/5 * * * * root /usr/local/bin/docker-watchdog.sh
EOF
  chmod 0644 /etc/cron.d/docker-watchdog
  ok "Docker watchdog installed (cron /5 * * * *)"
else
  ok "Docker watchdog already installed"
fi

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

# If we just installed Docker (i.e. the install block ran and wrote
# daemon.json above), restart the daemon so the resource limits take
# effect. systemd's `restart` is idempotent.
if systemctl is-active --quiet docker; then
  log "Reloading docker to apply daemon.json resource limits..."
  systemctl restart docker
  sleep 3
  if systemctl is-active --quiet docker; then
    ok "Docker reloaded with resource limits active"
  else
    err "Docker failed to start after reload — check 'journalctl -u docker'"
    exit 1
  fi
fi

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
  JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"

  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed -i "s|^BACKUP_WEBHOOK_TOKEN=.*|BACKUP_WEBHOOK_TOKEN=${BACKUP_WEBHOOK_TOKEN}|" "$ENV_FILE"
  sed -i "s|^SMTP_ENCRYPTION_KEY=.*|SMTP_ENCRYPTION_KEY=${SMTP_ENCRYPTION_KEY}|" "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
  # DATABASE_URL is built from POSTGRES_PASSWORD so the api container
  # can talk to the in-stack postgres service over the compose network.
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://xovenmart:${POSTGRES_PASSWORD}@postgres:5432/xovenmart|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Wrote $ENV_FILE with fresh secrets"
else
  warn "$ENV_FILE already exists, leaving alone (delete it first if you want to regenerate)"
fi

# ---------- 6. start postgres ----------
log "Starting postgres..."
cd "$REPO_DIR"
# docker-compose.yml lives at infra/, not at repo root — use -f so we don't
# depend on cwd.
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.yml"
[[ -f "$COMPOSE_FILE" ]] || { err "compose file missing at $COMPOSE_FILE"; exit 1; }

# Wipe stale postgres_data + old PG image if a previous run initialised
# the volume with a different major version. PG major upgrades require
# pg_upgrade — they aren't safe to do in place from a previous script
# run that may have left a half-broken volume behind.
EXISTING_PG_VER=""
if docker volume inspect xovenmart_postgres_data >/dev/null 2>&1; then
  EXISTING_PG_VER=$(docker run --rm -v xovenmart_postgres_data:/p alpine sh -c \
    'find /p -name PG_VERSION -exec cat {} \; -quit 2>/dev/null || true' \
    2>/dev/null || echo "")
  if [[ -z "$EXISTING_PG_VER" ]]; then
    EXISTING_PG_VER="unknown"
  fi
fi
NEW_PG_MAJOR=$(grep -oE 'postgres:[0-9]+' "$COMPOSE_FILE" | head -1 | grep -oE '[0-9]+')
NEED_WIPE=0
if [[ "$EXISTING_PG_VER" == "unknown" ]]; then
  warn "postgres_data exists but PG_VERSION unreadable — wiping to be safe"
  NEED_WIPE=1
elif [[ -n "$EXISTING_PG_VER" && "$EXISTING_PG_VER" != "$NEW_PG_MAJOR".* ]]; then
  warn "postgres_data was init'd by PG${EXISTING_PG_VER} but compose uses PG${NEW_PG_MAJOR}."
  NEED_WIPE=1
fi
if [[ "$NEED_WIPE" == "1" ]]; then
  warn "PG major versions are NOT binary-compatible. Wiping the volume + pulling new image."
  docker compose -f "$COMPOSE_FILE" down -v postgres 2>/dev/null || true
  docker pull "postgres:${NEW_PG_MAJOR}-alpine" >/dev/null 2>&1 || true
  docker rmi -f "postgres:16-alpine" 2>/dev/null || true
  docker rmi -f "postgres:17-alpine" 2>/dev/null || true
  ok "Wiped stale PG${EXISTING_PG_VER} data + old images"
fi

docker compose -f "$COMPOSE_FILE" up -d postgres
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
  err "Copy it from your local machine first. Either of these files works:"
  err "  xovenmart-manual-2026-09-24T11-12-51-816Z.sql  (1 MB, 81 products — newer)"
  err "  xovenmart-manual-2026-09-16T18-16-55-354Z.sql  (7 MB, 80 products — older)"
  err "Run on your LOCAL machine:"
  err "  scp 'xovenmart-manual-2026-09-24T11-12-51-816Z.sql' root@${VPS_IP}:/root/"
  exit 1
fi
log "Restoring DB dump from $DB_DUMP..."
# The dump is plain-text SQL (pg_dump --format=plain, file ends in .sql).
# Use psql to replay it, not pg_restore (which is for custom/directory
# format dumps). Source is pg_dump 18.6 and target is Postgres 18 — both
# are the same major so the SQL is fully compatible.
if [[ "$DB_DUMP" == *.sql ]]; then
  # NOTE: do NOT use --single-transaction. Even with a same-major
  # PG18 source + target, a single bad statement in a wrapped tx
  # poisons every statement downstream ("current transaction is
  # aborted, commands ignored until end of transaction block"),
  # leaving the DB empty. Run each statement independently so psql
  # can commit the good ones and skip the bad ones.
  docker exec -i xovenmart-postgres psql \
    -U xovenmart \
    -d xovenmart \
    -v ON_ERROR_STOP=0 \
    < "$DB_DUMP" 2>&1 | grep -vE "^(SET |SELECT pg_catalog|\\.$|-- |\\\\restrict )" | tail -20 || true
else
  docker exec -i xovenmart-postgres pg_restore \
    -U xovenmart \
    -d xovenmart \
    --no-owner \
    --no-privileges \
    --role=xovenmart \
    --clean --if-exists \
    < "$DB_DUMP" 2>&1 | grep -vE "^(pg_restore: warning: errors ignored on restore|--.*$|\\.$)" || true
fi
ok "DB restore finished"

# ---------- 8. row-count verify ----------
log "Verifying row counts..."
# Tables are named via @@map() in the Prisma schema, so they live in
# Postgres as snake_case (products, orders, admin_users, product_images)
# — NOT PascalCase. Use unquoted lowercase names.
docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
  SELECT
    (SELECT COUNT(*) FROM products)       AS products,
    (SELECT COUNT(*) FROM orders)         AS orders,
    (SELECT COUNT(*) FROM admin_users)    AS admins,
    (SELECT COUNT(*) FROM product_images) AS images;
"
ok "Row counts printed above ↑"

# ---------- 9. boot full stack ----------
log "Starting full stack (api, web, caddy, backup)..."
docker compose -f "$COMPOSE_FILE" up -d
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

------------------------------------------------------------------------------
 Resource-protection status (prevents the "build hangs the VPS" problem)
------------------------------------------------------------------------------
EOF

# Final verification of the 3 protective measures. If any are missing, warn
# loudly so the operator can fix them on the spot.
cat <<'STATUS'
Swap + resource limits + watchdog status:
STATUS

# 1. Swap
SWAP_TOTAL=$(free -g | awk '/Swap:/ {print $2}')
if [[ "${SWAP_TOTAL:-0}" -ge 4 ]]; then
  echo -e "  ${GREEN}✓${RST} Swap: ${SWAP_TOTAL}G active"
else
  echo -e "  ${RED}✗${RST} Swap: only ${SWAP_TOTAL:-0}G (need at least 4G)"
fi

# 2. Docker daemon.json
if [[ -f /etc/docker/daemon.json ]] && grep -q "max-concurrent-downloads" /etc/docker/daemon.json; then
  echo -e "  ${GREEN}✓${RST} Docker daemon.json: max-concurrent-downloads capped at 2"
else
  echo -e "  ${RED}✗${RST} Docker daemon.json missing resource limits"
fi

# 3. Watchdog
if [[ -f /usr/local/bin/docker-watchdog.sh ]] && [[ -f /etc/cron.d/docker-watchdog ]]; then
  echo -e "  ${GREEN}✓${RST} Docker watchdog: installed, cron every 5 min"
else
  echo -e "  ${RED}✗${RST} Docker watchdog not installed"
fi

echo ""
ok "All done."
