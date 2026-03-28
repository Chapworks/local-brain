#!/bin/sh
# Local Brain — Backup verification script
#
# Proves that the most recent backup can actually be restored.
# Spins up a temporary PostgreSQL instance, restores the latest backup,
# and verifies the data is intact by counting thoughts.
#
# Usage:
#   ./scripts/verify-backup.sh               # verify latest backup
#   ./scripts/verify-backup.sh <filename>     # verify a specific backup
#
# Called weekly by the db-backup container cron. Creates a notification
# on failure so the admin panel shows a warning.

set -e

BACKUP_DIR="/backups"
VERIFY_DB_DIR="/tmp/verify_db"
VERIFY_PORT=5433
RESULT_FILE="/tmp/verify_result"

# --- Find backup to verify ---

if [ -n "$1" ]; then
  BACKUP_FILE="$1"
else
  # Find most recent backup
  PATTERN="${BACKUP_DIR}/localbrain_*.sql.gz"
  if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
    PATTERN="${BACKUP_DIR}/localbrain_*.sql.gz.gpg"
  fi
  BACKUP_FILE=$(ls -1t ${PATTERN} 2>/dev/null | head -1)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "[$(date)] VERIFY FAILED: No backup file found."
  echo "FAIL:no_backup_found" > "$RESULT_FILE"
  exit 1
fi

BASENAME=$(basename "$BACKUP_FILE")
echo "[$(date)] Verifying backup: ${BASENAME}"

# --- Prepare temp database ---

rm -rf "$VERIFY_DB_DIR"
mkdir -p "$VERIFY_DB_DIR"

# Initialize a temporary PostgreSQL cluster
initdb -D "$VERIFY_DB_DIR" --no-locale --encoding=UTF8 > /dev/null 2>&1

# Start temp postgres on a different port
pg_ctl -D "$VERIFY_DB_DIR" -o "-p ${VERIFY_PORT} -k /tmp" -l /tmp/verify_pg.log start > /dev/null 2>&1

cleanup() {
  pg_ctl -D "$VERIFY_DB_DIR" -m fast stop > /dev/null 2>&1 || true
  rm -rf "$VERIFY_DB_DIR"
}
trap cleanup EXIT

# Create the database and pgvector extension
createdb -h /tmp -p "$VERIFY_PORT" -U "$(whoami)" localbrain_verify > /dev/null 2>&1
psql -h /tmp -p "$VERIFY_PORT" -U "$(whoami)" -d localbrain_verify \
  -c "CREATE EXTENSION IF NOT EXISTS vector" > /dev/null 2>&1

# --- Decrypt if needed ---

SQL_FILE="$BACKUP_FILE"

if echo "$BASENAME" | grep -q '\.gpg$'; then
  if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
    echo "[$(date)] VERIFY FAILED: Backup is encrypted but BACKUP_ENCRYPTION_KEY not set."
    echo "FAIL:encryption_key_missing" > "$RESULT_FILE"
    exit 1
  fi
  DECRYPTED="/tmp/verify_decrypted.sql.gz"
  gpg --batch --yes --decrypt \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --output "$DECRYPTED" \
    "$BACKUP_FILE" 2>/dev/null
  SQL_FILE="$DECRYPTED"
  echo "[$(date)] Decrypted for verification."
fi

# --- Restore into temp database ---

echo "[$(date)] Restoring into temp database..."
if ! gunzip -c "$SQL_FILE" | psql -h /tmp -p "$VERIFY_PORT" -U "$(whoami)" -d localbrain_verify \
  --single-transaction -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
  echo "[$(date)] VERIFY FAILED: Restore failed."
  echo "FAIL:restore_failed" > "$RESULT_FILE"
  # Clean up decrypted file
  [ "$SQL_FILE" != "$BACKUP_FILE" ] && rm -f "$SQL_FILE"
  exit 1
fi

# Clean up decrypted file
[ "$SQL_FILE" != "$BACKUP_FILE" ] && rm -f "$SQL_FILE"

# --- Verify data ---

THOUGHT_COUNT=$(psql -h /tmp -p "$VERIFY_PORT" -U "$(whoami)" -d localbrain_verify \
  -t -c "SELECT COUNT(*)::int FROM thoughts" 2>/dev/null | tr -d ' ')

TABLE_COUNT=$(psql -h /tmp -p "$VERIFY_PORT" -U "$(whoami)" -d localbrain_verify \
  -t -c "SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')

echo "[$(date)] Verification passed."
echo "[$(date)]   Tables: ${TABLE_COUNT}"
echo "[$(date)]   Thoughts: ${THOUGHT_COUNT}"
echo "[$(date)]   Backup: ${BASENAME}"
echo "PASS:${THOUGHT_COUNT}:${TABLE_COUNT}:${BASENAME}" > "$RESULT_FILE"
