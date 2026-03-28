#!/bin/sh
# Local Brain — PostgreSQL backup script
#
# 1. Dumps the database to a compressed file
# 2. Optionally encrypts with a passphrase (BACKUP_ENCRYPTION_KEY)
# 3. Optionally uploads to cloud storage via rclone (RCLONE_REMOTE)
# 4. Prunes old local backups beyond BACKUP_RETAIN_COUNT
#
# Called by the db-backup container on a cron schedule.
# See BACKUPS.md for setup instructions.

set -e

BACKUP_DIR="/backups"
MAX_BACKUPS="${BACKUP_RETAIN_COUNT:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BASE_FILENAME="localbrain_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."

# --- Step 1: Dump and compress ---

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-acl \
  | gzip > "${BACKUP_DIR}/${BASE_FILENAME}"

SIZE=$(du -h "${BACKUP_DIR}/${BASE_FILENAME}" | cut -f1)
echo "[$(date)] Dump complete: ${BASE_FILENAME} (${SIZE})"

# --- Step 2: Encrypt (optional) ---

FINAL_FILENAME="$BASE_FILENAME"

if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --output "${BACKUP_DIR}/${BASE_FILENAME}.gpg" \
    "${BACKUP_DIR}/${BASE_FILENAME}"

  rm "${BACKUP_DIR}/${BASE_FILENAME}"
  FINAL_FILENAME="${BASE_FILENAME}.gpg"
  echo "[$(date)] Encrypted: ${FINAL_FILENAME}"
fi

# --- Step 3: Upload to cloud (optional) ---

if [ -n "$RCLONE_REMOTE" ]; then
  REMOTE_PATH="${RCLONE_REMOTE}/${FINAL_FILENAME}"
  echo "[$(date)] Uploading to ${REMOTE_PATH}..."

  if rclone copyto "${BACKUP_DIR}/${FINAL_FILENAME}" "${REMOTE_PATH}" 2>&1; then
    echo "[$(date)] Upload complete."

    # Prune old remote backups
    if [ -n "$BACKUP_CLOUD_RETAIN_COUNT" ]; then
      CLOUD_RETAIN="${BACKUP_CLOUD_RETAIN_COUNT}"
    else
      CLOUD_RETAIN=30
    fi

    # List remote files oldest-first, delete beyond retention count
    REMOTE_COUNT=$(rclone ls "$RCLONE_REMOTE" 2>/dev/null | grep -c "localbrain_" || true)
    if [ "$REMOTE_COUNT" -gt "$CLOUD_RETAIN" ]; then
      REMOTE_REMOVE=$((REMOTE_COUNT - CLOUD_RETAIN))
      echo "[$(date)] Pruning ${REMOTE_REMOVE} old remote backup(s)..."
      rclone ls "$RCLONE_REMOTE" 2>/dev/null \
        | grep "localbrain_" \
        | sort \
        | head -n "$REMOTE_REMOVE" \
        | awk '{print $2}' \
        | while read -r f; do
            rclone deletefile "${RCLONE_REMOTE}/${f}" 2>/dev/null && \
              echo "[$(date)] Pruned remote: ${f}"
          done
    fi
  else
    echo "[$(date)] WARNING: Cloud upload failed. Local backup preserved."
  fi
fi

# --- Step 4: Prune old local backups ---

PATTERN="${BACKUP_DIR}/localbrain_*.sql.gz"
if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
  PATTERN="${BACKUP_DIR}/localbrain_*.sql.gz.gpg"
fi

TOTAL=$(ls -1 ${PATTERN} 2>/dev/null | wc -l)
if [ "$TOTAL" -gt "$MAX_BACKUPS" ]; then
  REMOVE=$((TOTAL - MAX_BACKUPS))
  ls -1t ${PATTERN} | tail -n "$REMOVE" | while read -r f; do
    echo "[$(date)] Pruning local: $(basename "$f")"
    rm "$f"
  done
fi

REMAINING=$(ls -1 ${PATTERN} 2>/dev/null | wc -l)
echo "[$(date)] Local backups: ${REMAINING}/${MAX_BACKUPS}"
echo "[$(date)] Done."
