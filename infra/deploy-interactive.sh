#!/usr/bin/env bash
# =============================================================================
# XovenMart — interactive deploy helper (runs ON the VPS)
# =============================================================================
# Walks the operator through 6 stages with explicit pause-for-confirm at
# each. Designed so the assistant can guide the user step-by-step from a
# chat session — each stage prints its outputs and the operator pastes
# them back.
#
#   ssh root@103.72.65.188
#   bash <(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/deploy-interactive.sh)
#
# Idempotent — safe to re-run; each stage checks "already done?" first.
# =============================================================================

set -euo pipefail

RST='\033[0m'; BOLD='\033[1m'
BLUE='\033[1;34m'; GREEN='\033[1;32m'
RED='\033[1;31m'; YELLOW='\033[1;33m'
CYAN='\033[1;36m'

step()  { printf "\n${CYAN}════════════════════════════════════════════════════════════${RST}\n${CYAN}  STAGE %s${RST}\n${CYAN}════════════════════════════════════════════════════════════${RST}\n\n" "$1"; }
ok()    { printf "${GREEN}[OK]${RST} %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${RST} %s\n" "$*"; }
err()   { printf "${RED}[ERR]${RST} %s\n" "$*" >&2; }
ask()   { printf "${BOLD}%s${RST} " "$*"; }

pause() {
  ask "Press ENTER to continue (or Ctrl+C to abort)..."
  read -r _
}

# Pre-flight
[[ $EUID -eq 0 ]] || { err "must run as root"; exit 1; }

step "0/6 — Verify environment"
echo "Detected:"
echo "  OS:      $(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"')"
echo "  Kernel:  $(uname -r)"
echo "  CPUs:    $(nproc)"
echo "  Total RAM: $(free -h | awk '/^Mem:/ {print $2}')"
echo "  Disk free: $(df -h / | awk 'NR==2 {print $4}')"
echo "  Time:    $(date)"
echo "  IP:      $(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo
warn "If RAM < 3.5 GB or disk free < 5 GB, abort and resize the VPS first."
pause

step "1/6 — Set timezone + change root password"
echo "Current timezone: $(timedatectl | grep 'Time zone' | awk '{print $3}')"
if [[ "$(timedatectl | grep 'Time zone' | awk '{print $3}')" != "Asia/Dhaka" ]]; then
  timedatectl set-timezone Asia/Dhaka
  ok "Timezone set to Asia/Dhaka"
else
  ok "Timezone already Asia/Dhaka"
fi

if [[ -f /etc/issue ]] && grep -q "root password" /etc/motd 2>/dev/null; then
  warn "Default-password motd detected. You probably haven't run 'passwd' yet."
fi

if [[ ! -f /root/.xovenmart_password_changed ]]; then
  ask "Run 'passwd' now to change the root password? (y/n)"
  read -r REPLY
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
    passwd
    touch /root/.xovenmart_password_changed
    ok "Password changed (you'll need to reconnect if SSH dropped)."
    warn "If disconnected, reconnect with: ssh root@$(curl -fsS --max-time 5 ifconfig.me)"
    exit 0
  fi
else
  ok "Password already changed (marker file exists)"
fi
pause

step "2/6 — Verify DB dump is in place"
DUMP="/root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql"
if [[ ! -f "$DUMP" ]]; then
  err "DB dump NOT found at $DUMP"
  echo
  echo "On your LAPTOP (Windows PowerShell), run:"
  echo "  scp \"H:\\Personal\\Coding\\AI Project\\XovenMart\\tech\\xovenmart-manual-2026-09-16T18-16-55-354Z.sql\" root@$(curl -fsS --max-time 5 ifconfig.me):/root/"
  echo
  echo "Or use WinSCP / FileZilla to drag it to /root/."
  echo "Re-run this script after the file lands."
  exit 1
fi
ok "Found: $DUMP"
echo "  Size: $(du -h "$DUMP" | awk '{print $1}')"
echo "  First line: $(head -1 "$DUMP")"
echo "  pg_dump version (from header): $(grep -m1 'Dumped by pg_dump' "$DUMP" | sed 's/.*pg_dump version //')"
pause

step "3/6 — Run the one-shot bootstrap"
# The bootstrap is destructive (creates Docker + repos). Only run if not done.
if [[ -f /var/www/xovenmart/repo/infra/.env ]]; then
  ok ".env already exists — bootstrap already ran. Skipping."
else
  ask "Run bdix-bootstrap.sh now? It will: install Docker, clone repo, write .env, restore DB, boot full stack. Takes 5-10 min. (y/n)"
  read -r REPLY
  [[ "$REPLY" =~ ^[Yy]$ ]] || { warn "Skipped. Run manually later with: bash <(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/bdix-bootstrap.sh)"; pause; }
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
    bash <(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/bdix-bootstrap.sh)
  fi
fi
pause

step "4/6 — Reset an admin password directly in the DB"
echo "Existing admin users:"
docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c 'SELECT id, email, role, "isActive" FROM "AdminUser";' 2>&1 || {
  err "Cannot query AdminUser. Is postgres running? Try: docker compose -f /var/www/xovenmart/repo/infra/docker-compose.yml ps"
  exit 1
}
echo
ask "Enter the admin email you want to reset (or blank to skip):"
read -r ADMIN_EMAIL
if [[ -n "$ADMIN_EMAIL" ]]; then
  ask "Enter the new password for $ADMIN_EMAIL:"
  read -rs NEW_PASS
  echo
  docker exec xovenmart-postgres psql -U xovenmart -d xovenmart -c "
    UPDATE \"AdminUser\"
    SET password_hash = crypt('${NEW_PASS}', gen_random_bytes(6))
    WHERE email = '${ADMIN_EMAIL}';
  "
  ok "Password updated. Try logging in at https://admin.xovenmart.com with this password (after DNS + TLS are ready)."
fi
pause

step "5/6 — Fill in vendor keys (R2, BULKSMSBD, FCM, Sentry)"
ENV_FILE="/var/www/xovenmart/repo/infra/.env"
echo "Current blank values in $ENV_FILE:"
grep -E "^(R2_|BULKSMSBD_|FCM_|SENTRY_)" "$ENV_FILE" | sed 's/=.*/=<BLANK>/'
echo
ask "Edit .env now to fill vendor keys? (y/n)"
read -r REPLY
if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  nano "$ENV_FILE"
  ask "Restart all containers to pick up new env? (y/n)"
  read -r REPLY2
  if [[ "$REPLY2" =~ ^[Yy]$ ]]; then
    cd /var/www/xovenmart/repo
    docker compose -f /var/www/xovenmart/repo/infra/docker-compose.yml up -d
    ok "Containers restarted."
  fi
fi
pause

step "6/6 — Final verification + DNS reminder"
echo "Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep xovenmart || true
echo
echo "API health (in-container):"
docker exec xovenmart-api wget -qO- http://localhost:3001/api/v1/health 2>&1 || warn "api not reachable yet"
echo
echo "════════════════════════════════════════════════════════════"
echo "  Last step (DNS) is OUTSIDE this VPS — do it from your laptop:"
echo "════════════════════════════════════════════════════════════"
echo
VPS_IP=$(curl -fsS --max-time 5 ifconfig.me)
echo "  Go to your domain registrar and update A records:"
echo "    api.xovenmart.com    A  $VPS_IP"
echo "    xovenmart.com         A  $VPS_IP"
echo "    www.xovenmart.com     A  $VPS_IP"
echo "    admin.xovenmart.com   A  $VPS_IP"
echo
echo "  After DNS propagates (~5 min if you set 300s TTL), check TLS:"
echo "    docker logs xovenmart-caddy 2>&1 | grep -i 'certificate obtained'"
echo
echo "  Final end-to-end check from your laptop:"
echo "    curl -I https://api.xovenmart.com/api/v1/health"
echo
echo "  When that returns 200, paste the output to the assistant."
echo
ok "All stages complete. Save rotated secrets: cat /root/.xovenmart_secrets_rotated"
