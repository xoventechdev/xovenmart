#!/bin/sh
# ============================================================
# XovenMart — nightly Postgres backup → Cloudflare R2
# Run inside the `backup` container, scheduled via cron
#
# Backs up BOTH databases:
#   1. xovenmart     (app data — products, orders, users)
#   2. xovenmart_n8n (workflow definitions, credentials, 7d execution log)
# Losing 7 days of n8n execution history is annoying for debugging, so we
# dump it nightly. n8n's schema is stable; we use --schema-only=false to
# keep the full data.
# ============================================================

set -e

R2_BASE="s3://${R2_BUCKET_NAME}/postgres"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Dump a single DB → R2. Args: <db_name> <user>
dump_db() {
  DB_NAME="$1"
  DB_USER="$2"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  FILENAME="${DB_NAME}_${TIMESTAMP}.dump"
  TMPFILE="/tmp/${FILENAME}"

  echo "[$(date)] Starting backup of ${DB_NAME} → ${FILENAME}"

  # pg_dump (custom format, compressed)
  pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -Fc \
    -Z 9 \
    --no-owner \
    --no-privileges \
    -f "${TMPFILE}"

  # Upload to R2 (S3-compatible)
  AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
  AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
  aws s3 cp "${TMPFILE}" \
    "${R2_BASE}/${FILENAME}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --only-show-errors

  rm -f "${TMPFILE}"
}

# 1. Main app DB
dump_db "${POSTGRES_DB}" "${POSTGRES_USER}"

# 2. n8n DB (separate creds — see infra/postgres-init/02-create-n8n-db.sql)
if [ -n "${N8N_DB_USER}" ] && [ -n "${N8N_DB_PASSWORD}" ]; then
  PGPASSWORD="${N8N_DB_PASSWORD}" dump_db "xovenmart_n8n" "${N8N_DB_USER}"
else
  echo "[$(date)] WARN: N8N_DB_USER / N8N_DB_PASSWORD not set — skipping xovenmart_n8n backup"
fi

# 3. Prune old backups (keep last N days)
CUTOFF_DATE=$(date -d "-${BACKUP_KEEP_DAYS} days" +%Y%m%d 2>/dev/null || date -v -${BACKUP_KEEP_DAYS}d +%Y%m%d)

AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 ls "${R2_BASE}/" \
  --endpoint-url "${R2_ENDPOINT}" \
  | while read -r line; do
    FILE_DATE=$(echo "$line" | awk '{print $4}' | grep -oE '[0-9]{8}' | head -1)
    if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF_DATE" ]; then
      OLD_FILE=$(echo "$line" | awk '{print $4}')
      echo "[$(date)] Pruning old backup: ${OLD_FILE}"
      AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
      AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
      aws s3 rm "${R2_BASE}/${OLD_FILE}" \
        --endpoint-url "${R2_ENDPOINT}" \
        --only-show-errors
    fi
  done

echo "[$(date)] Backup complete"