#!/usr/bin/env bash
# =============================================================================
# XovenMart — daily Postgres backup
# =============================================================================
# Cron'd at 03:00 by bootstrap.sh. Produces a gzipped pg_dump in
# /var/www/xovenmart/backups/postgres/, keeps last 7 days, logs to
# /var/log/xovenmart/backup.log.
# =============================================================================

set -euo pipefail

APP=/var/www/xovenmart
BACKUP_DIR=$APP/backups/postgres
LOG=/var/log/xovenmart/backup.log
KEEP_DAYS=7

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
mkdir -p "$BACKUP_DIR" "$(dirname "$LOG")"

if [[ ! -f "$APP/api/shared/.env" ]]; then
  log "ERROR: $APP/api/shared/.env missing — cannot read DATABASE_URL"
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$APP/api/shared/.env" | cut -d= -f2-)
if [[ -z "$DATABASE_URL" ]]; then
  log "ERROR: DATABASE_URL is empty in $APP/api/shared/.env"
  exit 1
fi

FNAME="$BACKUP_DIR/xovenmart-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql.gz"
log "starting pg_dump → $FNAME"

# pg_dump reads the connection string directly; no need to split out user/pass.
pg_dump "$DATABASE_URL" --no-owner --clean --if-exists | gzip > "$FNAME"

if [[ ! -s "$FNAME" ]]; then
  log "ERROR: backup file is empty — $FNAME"
  rm -f "$FNAME"
  exit 1
fi

SIZE=$(du -h "$FNAME" | cut -f1)
log "backup OK ($SIZE)"

# Prune old backups.
DELETED=$(find "$BACKUP_DIR" -name 'xovenmart-*.sql.gz' -mtime +"$KEEP_DAYS" -delete -print | wc -l)
if (( DELETED > 0 )); then
  log "pruned $DELETED old backup(s) (>$KEEP_DAYS days)"
fi

# Also vacuum analyze to keep the DB healthy.
log "vacuumdb..."
sudo -u postgres vacuumdb --analyze --quiet xovenmart 2>&1 | tail -3 || log "WARN: vacuumdb failed"

log "done."