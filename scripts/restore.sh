#!/bin/sh
# Local Brain — Database restore script
#
# Restores from a local or cloud backup file.
#
# Usage:
#   ./scripts/restore.sh <backup-file>
#   ./scripts/restore.sh localbrain_20260328_030000.sql.gz
#   ./scripts/restore.sh localbrain_20260328_030000.sql.gz.gpg
#
# If RCLONE_REMOTE is set and the file isn't found locally,
# it will be downloaded from cloud storage first.
#
# See BACKUPS.md for full restore instructions.

set -e

if [ -z "$1" ]; then
  echo "Usage: restore.sh <backup-filename>"
  echo ""
  echo "Local backups:"
  ls -1t /backups/localbrain_*.sql.gz* 2>/dev/null | while read -r f; do
    SIZE=$(du -h "$f" | cut -f1)
    echo "  $(basename "$f")  ($SIZE)"
  done
  if [ -n "$RCLONE_REMOTE" ]; then
    echo ""
    echo "Cloud backups (RCLONE_REMOTE=$RCLONE_REMOTE):"
    rclone ls "$RCLONE_REMOTE" 2>/dev/null | grep "localbrain_" | sort -r | while read -r size name; do
      echo "  ${name}"
    done
  fi
  exit 1
fi

FILENAME="$1"
BACKUP_DIR="/backups"
WORKFILE="${BACKUP_DIR}/${FILENAME}"

# --- Step 1: Get the file ---

if [ ! -f "$WORKFILE" ]; then
  if [ -n "$RCLONE_REMOTE" ]; then
    echo "[$(date)] File not found locally. Downloading from ${RCLONE_REMOTE}..."
    rclone copyto "${RCLONE_REMOTE}/${FILENAME}" "$WORKFILE"
    echo "[$(date)] Downloaded."
  else
    echo "Error: ${WORKFILE} not found and RCLONE_REMOTE not configured."
    exit 1
  fi
fi

# --- Step 2: Decrypt if needed ---

SQL_FILE="$WORKFILE"

if echo "$FILENAME" | grep -q '\.gpg$'; then
  if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
    echo "Error: File is encrypted but BACKUP_ENCRYPTION_KEY is not set."
    exit 1
  fi
  DECRYPTED="${WORKFILE%.gpg}"
  echo "[$(date)] Decrypting..."
  gpg --batch --yes --decrypt \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --output "$DECRYPTED" \
    "$WORKFILE"
  SQL_FILE="$DECRYPTED"
  echo "[$(date)] Decrypted to $(basename "$DECRYPTED")"
fi

# --- Step 3: Restore ---

echo "[$(date)] Restoring to ${DB_NAME}@${DB_HOST}..."
echo "[$(date)] WARNING: This will overwrite the current database contents."
echo ""

gunzip -c "$SQL_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --single-transaction \
  -v ON_ERROR_STOP=1 \
  2>&1

echo ""
echo "[$(date)] Restore complete."

# Clean up decrypted temp file
if [ "$SQL_FILE" != "$WORKFILE" ] && [ -f "$SQL_FILE" ]; then
  rm "$SQL_FILE"
fi
