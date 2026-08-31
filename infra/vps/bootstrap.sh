#!/usr/bin/env bash
# =============================================================================
# XovenMart VPS bootstrap — Ubuntu 24.04 LTS
# =============================================================================
# Run ONCE as root on a fresh Contabo (or any Ubuntu 24.04) VPS:
#
#   ssh root@<VPS_IP>
#   git clone https://github.com/xoventechdev/xovenmart.git /tmp/xm
#   bash /tmp/xm/infra/vps/bootstrap.sh
#
# Idempotent — safe to re-run. Takes ~5-8 minutes on a fresh VPS.
#
# What it installs:
#   - nginx + postgresql-16 + certbot + ufw + fail2ban + logwatch
#   - Node.js 22 via NodeSource
#   - pnpm@9 via corepack
#   - PM2 via npm (with systemd startup hook)
#
# What it sets up:
#   - deploy user (sudoer, used by GitHub Actions)
#   - /var/www/xovenmart/{api,web,repo,backups} layout
#   - bare git repo at /var/www/xovenmart/repo
#   - Postgres database + role (random password printed at the end)
#   - UFW firewall (22, 80, 443 open; 5432, 3000, 3001 blocked from public)
#   - fail2ban SSH jail
#   - cron entry for daily Postgres backups (7-day retention)
#
# After this script finishes, follow README.md → "Step 2: configure secrets"
# and "Step 3: first deploy".
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; }
require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "must run as root (try: sudo bash $0)"
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------
require_root

if ! grep -q 'Ubuntu' /etc/os-release; then
  warn "this script is tuned for Ubuntu 24.04. Continuing anyway..."
fi

log "Updating apt..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# -----------------------------------------------------------------------------
# System packages
# -----------------------------------------------------------------------------
log "Installing system packages (nginx, postgres, certbot, ufw, fail2ban)..."
apt-get install -y -qq \
  nginx \
  postgresql \
  postgresql-contrib \
  certbot \
  python3-certbot-nginx \
  ufw \
  fail2ban \
  logwatch \
  curl \
  wget \
  git \
  rsync \
  openssl \
  ca-certificates \
  apt-transport-https \
  gnupg \
  software-properties-common \
  build-essential

# -----------------------------------------------------------------------------
# Node.js 22 + pnpm + PM2
# -----------------------------------------------------------------------------
log "Installing Node.js 22 via NodeSource..."
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | cut -d. -f1 | tr -d v)"
  if [[ "${NODE_MAJOR}" -ge 22 ]]; then
    NEED_NODE=0
    log "Node $(node -v) already installed, skipping"
  fi
fi
if [[ "${NEED_NODE}" -eq 1 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v
npm -v

log "Enabling pnpm@9 via corepack..."
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm -v

log "Installing PM2 globally..."
npm install -g pm2 --silent
pm2 -v

# -----------------------------------------------------------------------------
# deploy user (for GitHub Actions SSH)
# -----------------------------------------------------------------------------
APP_USER="deploy"
APP_DIR="/var/www/xovenmart"

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating $APP_USER user..."
  adduser --disabled-password --gecos "" "$APP_USER"
fi

# Allow deploy to:
#   - reload pm2 (their own processes)
#   - read /var/log/xovenmart
#   - restart nginx + certbot renew
#   - run the deploy script
# Limit sudo to specific commands. No password required.
cat > /etc/sudoers.d/xovenmart-deploy <<'SUDOERS'
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
deploy ALL=(ALL) NOPASSWD: /usr/bin/certbot renew
deploy ALL=(ALL) NOPASSWD: /usr/sbin/service postgresql restart
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart postgresql
deploy ALL=(ALL) NOPASSWD: /usr/local/bin/npm
deploy ALL=(ALL) NOPASSWD: /usr/bin/pnpm
deploy ALL=(ALL) NOPASSWD: /usr/bin/psql
deploy ALL=(ALL) NOPASSWD: /usr/bin/pg_dump
SUDOERS
chmod 0440 /etc/sudoers.d/xovenmart-deploy

# SSH directory for deploy user (we'll add their pubkey later)
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
touch "/home/$APP_USER/.ssh/authorized_keys"
chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
chmod 0600 "/home/$APP_USER/.ssh/authorized_keys"

# Copy root's authorized_keys into deploy user's (so the operator's key works
# for both root and deploy; remove this line if you want deploy to have a
# separate key from the start).
if [[ -f /root/.ssh/authorized_keys ]] && [[ -s /root/.ssh/authorized_keys ]]; then
  cat /root/.ssh/authorized_keys >> "/home/$APP_USER/.ssh/authorized_keys"
  log "Copied root's SSH public key(s) to $APP_USER"
fi

# -----------------------------------------------------------------------------
# Filesystem layout
# -----------------------------------------------------------------------------
log "Creating /var/www/xovenmart layout..."
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/api/releases"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/api/shared"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/web/releases"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/web/shared"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/backups/postgres"
install -d -m 0755 -o "$APP_USER" -g "$APP_USER" /var/log/xovenmart

# -----------------------------------------------------------------------------
# Bare git repo (mirror of GitHub)
# -----------------------------------------------------------------------------
# If GH_PAT is exported in the environment, persist it as git credentials so
# subsequent `git clone`, `git fetch`, and `git remote update` (in deploy.sh)
# work without an interactive prompt. Required for private repos.
if [[ -n "${GH_PAT:-}" ]]; then
  AUTH_URL="https://oauth2:${GH_PAT}@github.com/xoventechdev/xovenmart.git"
  PUBLIC_URL="https://github.com/xoventechdev/xovenmart.git"
  # Write credential file (0600, root-owned) so git picks it up via the
  # `store` helper. Use the URL with creds; helper matches on host.
  install -d -m 0700 /root/.git-creds
  printf 'https://oauth2:%s@github.com\n' "$GH_PAT" > /root/.git-creds/.git-credentials
  chmod 0600 /root/.git-creds/.git-credentials
  git config --global credential.helper "store --file=/root/.git-creds/.git-credentials"
  # Also seed deploy user's git config + credentials so deploy.sh works for them.
  sudo -u "$APP_USER" bash -c "
    install -d -m 0700 \$HOME/.git-creds
    printf 'https://oauth2:${GH_PAT}@github.com\n' > \$HOME/.git-creds/.git-credentials
    chmod 0600 \$HOME/.git-creds/.git-credentials
    git config --global credential.helper 'store --file='\$HOME'/.git-creds/.git-credentials'
  "
  REPO_URL="$AUTH_URL"
else
  REPO_URL="https://github.com/xoventechdev/xovenmart.git"
fi

if [[ ! -d "$APP_DIR/repo" ]]; then
  log "Initializing working clone at $APP_DIR/repo (for nginx configs etc.)..."
  sudo -u "$APP_USER" git clone --depth 50 "$REPO_URL" "$APP_DIR/repo"
else
  log "Working clone already exists at $APP_DIR/repo (skipping clone)"
fi

# -----------------------------------------------------------------------------
# Postgres: create role + database
# -----------------------------------------------------------------------------
log "Creating Postgres role + database..."
DB_NAME="xovenmart"
DB_USER="xovenmart_app"
# Random password generated once and written to a file the operator reads.
# Never put it in shell history.
DB_PASS_FILE="/root/.xovenmart_db_password"
if [[ ! -f "$DB_PASS_FILE" ]]; then
  openssl rand -base64 24 | tr -d '/+=' > "$DB_PASS_FILE"
  chmod 0600 "$DB_PASS_FILE"
fi
DB_PASS="$(cat "$DB_PASS_FILE")"

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'DB exists' WHERE EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}');
SQL

DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || echo "")
if [[ "$DB_EXISTS" != "1" ]]; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  log "Created database $DB_NAME owned by $DB_USER"
else
  log "Database $DB_NAME already exists"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<SQL
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER SCHEMA public OWNER TO ${DB_USER};
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL

# Print the DATABASE_URL the operator needs in api/shared/.env.
# We URL-encode the password defensively (handles %, &, +, =, ?).
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"${DB_PASS}\"))" 2>/dev/null || printf '%s' "$DB_PASS")
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASS}@127.0.0.1:5432/${DB_NAME}"

cat > "$APP_DIR/api/shared/.env" <<ENV
# Generated by bootstrap.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# DO NOT COMMIT. Edit on the VPS only.
NODE_ENV=production
PORT=3001
API_PREFIX=api/v1
DATABASE_URL=${DATABASE_URL}

PUBLIC_SITE_URL=https://app.xovenmart.com
PUBLIC_API_URL=https://api.xovenmart.com

# CORS allowlist — comma-separated. Update with your real frontend origins.
CORS_ORIGIN=https://app.xovenmart.com,https://xovenmart.com,https://www.xovenmart.com,https://admin.xovenmart.com

# JWT secrets — random 48-byte base64. REPLACE before going live.
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000

# BulkSMS BD (OTP SMS) — REPLACE with your real key or leave blank to disable OTP.
BULKSMSBD_API_KEY=
BULKSMSBD_SENDER_ID=
BULKSMSBD_BASE_URL=https://api.bulksmsbd.com/api/v1/

# bKash / Nagad merchant — REPLACE before going live.
BKASH_MERCHANT_NUMBER=
BKASH_MERCHANT_NAME=
NAGAD_MERCHANT_NUMBER=

# Cloudflare R2 (product images) — REPLACE before going live.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=xovenmart-media
R2_PUBLIC_URL=https://cdn.xovenmart.com

# Firebase Cloud Messaging (push notifications) — REPLACE before going live.
FCM_PROJECT_ID=
FCM_PRIVATE_KEY=
FCM_CLIENT_EMAIL=

# Email provider (Brevo or Resend). At least one is required.
BREVO_API_KEY=
RESEND_API_KEY=

# Observability (optional)
SENTRY_DSN=
OTP_HIDE_DEV_CODE=
ENV

chown "$APP_USER:$APP_USER" "$APP_DIR/api/shared/.env"
chmod 0600 "$APP_DIR/api/shared/.env"
log "Wrote $APP_DIR/api/shared/.env"

cat > "$APP_DIR/web/shared/.env.production" <<ENV
# Generated by bootstrap.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# NEXT_PUBLIC_* values are baked into the Next.js bundle at BUILD time —
# changing them later requires a rebuild, not just a server restart.
NEXT_PUBLIC_API_URL=https://api.xovenmart.com
NEXT_PUBLIC_OSM_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
UMAMI_URL=
ENV

chown "$APP_USER:$APP_USER" "$APP_DIR/web/shared/.env.production"
chmod 0644 "$APP_DIR/web/shared/.env.production"
log "Wrote $APP_DIR/web/shared/.env.production"

# -----------------------------------------------------------------------------
# Nginx: placeholder site (we enable SSL later via certbot)
# -----------------------------------------------------------------------------
log "Installing nginx site config (HTTP-only, will add SSL after certbot)..."
install -m 0644 "$APP_DIR/repo/infra/vps/nginx-no-ssl.conf" /etc/nginx/sites-available/xovenmart
ln -sf /etc/nginx/sites-available/xovenmart /etc/nginx/sites-enabled/xovenmart
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# -----------------------------------------------------------------------------
# PM2 ecosystem config — copied to /var/www/xovenmart/api/ecosystem.config.js
# so deploy.sh can run `pm2 reload ecosystem.config.js` from any cwd.
# -----------------------------------------------------------------------------
log "Installing PM2 ecosystem config..."
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/api"
install -m 0644 "$APP_DIR/repo/infra/vps/ecosystem.config.js" "$APP_DIR/api/ecosystem.config.js"
chown "$APP_USER:$APP_USER" "$APP_DIR/api/ecosystem.config.js"

# -----------------------------------------------------------------------------
# PM2 startup
# -----------------------------------------------------------------------------
log "Setting up PM2 systemd startup..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1
sudo -u "$APP_USER" pm2 ls >/dev/null 2>&1 || true

# -----------------------------------------------------------------------------
# Firewall + fail2ban
# -----------------------------------------------------------------------------
log "Configuring UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP (Certbot + redirect to HTTPS)"
ufw allow 443/tcp comment "HTTPS"
# 3000 (web) and 3001 (api) stay bound to 127.0.0.1 — no public exposure.
ufw --force enable
ufw status

log "Configuring fail2ban (sshd jail)..."
cat > /etc/fail2ban/jail.d/sshd.local <<JAIL
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = %(sshd_log)s
maxretry = 5
bantime = 1h
findtime = 10m
JAIL
systemctl enable --now fail2ban

# -----------------------------------------------------------------------------
# Daily Postgres backups
# -----------------------------------------------------------------------------
log "Installing daily pg_dump cron job..."
install -m 0755 "$APP_DIR/repo/infra/vps/backup.sh" /usr/local/bin/xovenmart-backup.sh
# 03:00 daily, as deploy user
cat > /etc/cron.d/xovenmart-backup <<CRON
# m h dom mon dow user  command
0 3 * * * ${APP_USER} /usr/local/bin/xovenmart-backup.sh >> /var/log/xovenmart/backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/xovenmart-backup

# -----------------------------------------------------------------------------
# Done. Print next-steps summary.
# -----------------------------------------------------------------------------
cat <<EOF

==============================================================================
 Bootstrap complete
==============================================================================

VPS IP        : $(curl -s --max-time 5 ifconfig.me || echo "<run: curl ifconfig.me>")
Deploy user   : $APP_USER (sudoer, key already copied from root)
App dir       : $APP_DIR
Postgres DB   : $DB_NAME
Postgres user : $DB_USER
DB password   : stored in $DB_PASS_FILE (one-time read)

Next steps (run these in order):

  1) Update env vars on the VPS (replace the blanks):
       sudo nano /var/www/xovenmart/api/shared/.env
       sudo nano /var/www/xovenmart/web/shared/.env.production

  2) Point DNS A records to this VPS:
       api.xovenmart.com        -> $(curl -s --max-time 5 ifconfig.me || echo "VPS_IP")
       app.xovenmart.com        -> VPS_IP
       xovenmart.com (optional) -> VPS_IP
       www.xovenmart.com        -> VPS_IP
       admin.xovenmart.com      -> VPS_IP

  3) Wait 60-120s for DNS, then issue SSL cert:
       sudo certbot --nginx \\
         -d api.xovenmart.com \\
         -d app.xovenmart.com \\
         --agree-tos -m you@example.com --redirect

  4) Run the first deploy (manual):
       cd /var/www/xovenmart/repo && bash infra/vps/deploy.sh manual-bootstrap

  5) Verify:
       curl https://api.xovenmart.com/api/v1/health

==============================================================================
EOF
