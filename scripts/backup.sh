#!/usr/bin/env bash
# Daily pg_dump of the external PostgreSQL, with 7-day retention.
# Run from host cron, e.g.:  0 2 * * * /opt/finfolio/scripts/backup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; [ -f .env.prod ] && . ./.env.prod; set +a
BACKUP_DIR="${BACKUP_DIR:-./.backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/finfolio-$STAMP.sql.gz"
find "$BACKUP_DIR" -name 'finfolio-*.sql.gz' -mtime +7 -delete
echo "Backup written to $BACKUP_DIR/finfolio-$STAMP.sql.gz"
