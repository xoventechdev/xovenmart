#!/bin/sh
# ============================================================
# XovenMart — nightly local backup
# Dumps Postgres to /backups and snapshots the api uploads volume
# alongside. Keeps the last N days (BACKUP_KEEP_DAYS, default 14)
# of tarballs and prunes the rest.
#
# Why no R2/AWS: operator runs this on a fresh VPS with no S3-
# compatible bucket configured, and the previous R2 path had the
# `aws` CLI missing from the image, the bucket name wrong
# (xovenmart-images instead of xovenmart-backups), and the R2
# credentials blank. Local-only backup until the operator wires
# up remote storage — restore is just:
#   gunzip -c xovenmart_*.sql.gz | psql -U xovenmart -d xovenmart
#   tar -xzf uploads_*.tar.gz -C /uploads-restore
# ============================================================

set -eu

# Where we write backups (must exist; docker-compose bind-mounts it).
BACKUP_DIR="/backups"
mkdir -p "${BACKUP_DIR}"

# Postgres connection. POSTGRES_HOST defaults to the docker-compose
# service name; override with BACKUP_PGHOST if you ever point this
# container at a remote DB.
POSTGRES_HOST="${BACKUP_PGHOST:-postgres}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAYDIR="${BACKUP_DIR}/$(date +%Y-%m-%d)"
mkdir -p "${DAYDIR}"

DB_FILE="${DAYDIR}/xovenmart_${TIMESTAMP}.sql.gz"
UPLOADS_FILE="${DAYDIR}/uploads_${TIMESTAMP}.tar.gz"

echo "[$(date)] === Backup starting ==="

# 1. pg_dump via TCP to the postgres service. --clean --if-exists so
#    the SQL is restorable as-is into a fresh DB. --no-owner /
#    --no-privileges keep ownership neutral on restore (operator may
#    not have the same postgres role on the new host).
echo "[$(date)] Dumping database → ${DB_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -p 5432 \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | gzip -9 > "${DB_FILE}"

DB_BYTES=$(stat -c '%s' "${DB_FILE}" 2>/dev/null || stat -f '%z' "${DB_FILE}")
echo "[$(date)] DB dump complete: ${DB_BYTES} bytes"

# 2. Snapshot the api's persistent uploads volume. The volume is
#    bind-mounted at /uploads-snapshot inside this container by
#    docker-compose; tar it up so we can restore product images +
#    brand assets alongside the DB.
UPLOADS_SRC="/uploads-snapshot"
if [ -d "${UPLOADS_SRC}" ]; then
  echo "[$(date)] Snapshotting uploads → ${UPLOADS_FILE}"
  tar -czf "${UPLOADS_FILE}" -C "${UPLOADS_SRC}" . 2>/dev/null || \
    echo "[$(date)] WARN: uploads snapshot incomplete"
  UPLOAD_BYTES=$(stat -c '%s' "${UPLOADS_FILE}" 2>/dev/null || stat -f '%z' "${UPLOADS_FILE}")
  echo "[$(date)] Uploads snapshot complete: ${UPLOAD_BYTES} bytes"
else
  echo "[$(date)] WARN: ${UPLOADS_SRC} not mounted — skipping uploads snapshot"
fi

# 3. Prune old daily directories. Keep BACKUP_KEEP_DAYS days.
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
echo "[$(date)] Pruning backups older than ${KEEP_DAYS} days"
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -mtime +"${KEEP_DAYS}" -exec rm -rf {} \; 2>/dev/null || true

# Old tarballs that landed directly in $BACKUP_DIR (legacy layout):
find "${BACKUP_DIR}" -maxdepth 1 -type f \
  -mtime +"${KEEP_DAYS}" -delete 2>/dev/null || true

REMAINING=$(find "${BACKUP_DIR}" -type f -not -name '.last-backup-ran' | wc -l)
echo "[$(date)] === Backup complete (${REMAINING} files retained) ==="

# Touch a heartbeat file so a watchdog can confirm the cron is alive
# even when stdout goes nowhere.
date +%s > "${BACKUP_DIR}/.last-backup-ran"

# 4. Tell the API a fresh file landed so it:
#    - inserts a row in the `backups` table (so it shows in the admin UI)
#    - fires the CRON_SCAN email path (BACKUP_NOTIFY_EMAILS)
# Without this step the operator would have to click "Scan disk" in the
# admin panel for the new file to appear + email to be sent.
if [ -n "${BACKUP_API_URL:-}" ] && [ -n "${BACKUP_WEBHOOK_TOKEN:-}" ]; then
  echo "[$(date)] Notifying API → ${BACKUP_API_URL}/admin/system/backups/scan/webhook"
  WEBHOOK_BODY=$(mktemp)
  WEBHOOK_URL="${BACKUP_API_URL}/admin/system/backups/scan/webhook"
  HTTP_CODE=000
  if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -sS -o "${WEBHOOK_BODY}" -w '%{http_code}' \
      -X POST \
      -H "x-backup-webhook-token: ${BACKUP_WEBHOOK_TOKEN}" \
      --max-time 30 \
      "${WEBHOOK_URL}" 2>/dev/null) || HTTP_CODE=000
  elif command -v wget >/dev/null 2>&1; then
    # BusyBox wget (the default in postgres:18-alpine) — supports
    # POST + custom header via --post-data + --header. We use a
    # single-space body since the webhook is auth-only and ignores
    # request bodies; we capture the response body in WEBHOOK_BODY.
    if wget -q -O "${WEBHOOK_BODY}" \
         --header="x-backup-webhook-token: ${BACKUP_WEBHOOK_TOKEN}" \
         --post-data=' ' \
         --timeout=30 \
         "${WEBHOOK_URL}" 2>/dev/null; then
      HTTP_CODE=200
    fi
  else
    echo "[$(date)] WARN: neither curl nor wget present — skipping webhook"
  fi
  if [ "${HTTP_CODE}" = "200" ]; then
    echo "[$(date)] API notified OK: $(cat "${WEBHOOK_BODY}")"
  else
    echo "[$(date)] WARN: API webhook returned HTTP ${HTTP_CODE}: $(cat "${WEBHOOK_BODY}")"
  fi
  rm -f "${WEBHOOK_BODY}"
else
  echo "[$(date)] Skipping API notify (BACKUP_API_URL or BACKUP_WEBHOOK_TOKEN not set)"
fi
