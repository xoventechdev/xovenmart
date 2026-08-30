#!/bin/sh
# ============================================================
# XovenMart — nightly Postgres backup → Cloudflare R2
# Run inside the `backup` container, scheduled via cron
# ============================================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="xovenmart_${TIMESTAMP}.dump"
TMPFILE="/tmp/${FILENAME}"

echo "[$(date)] Starting backup → ${FILENAME}"

# 1. pg_dump (custom format, compressed)
pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -Fc \
  -Z 9 \
  --no-owner \
  --no-privileges \
  -f "${TMPFILE}"

# 2. Upload to R2 (S3-compatible)
AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 cp "${TMPFILE}" \
  "s3://${R2_BUCKET_NAME}/postgres/${FILENAME}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --only-show-errors

# 3. Remove local file
rm -f "${TMPFILE}"

# 4. Prune old backups (keep last N days)
CUTOFF_DATE=$(date -d "-${BACKUP_KEEP_DAYS} days" +%Y%m%d 2>/dev/null || date -v -${BACKUP_KEEP_DAYS}d +%Y%m%d)

AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 ls "s3://${R2_BUCKET_NAME}/postgres/" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  | while read -r line; do
    FILE_DATE=$(echo "$line" | awk '{print $4}' | grep -oE '[0-9]{8}' | head -1)
    if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF_DATE" ]; then
      OLD_FILE=$(echo "$line" | awk '{print $4}')
      echo "[$(date)] Pruning old backup: ${OLD_FILE}"
      AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
      AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
      aws s3 rm "s3://${R2_BUCKET_NAME}/postgres/${OLD_FILE}" \
        --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
        --only-show-errors
    fi
  done

echo "[$(date)] Backup complete"
