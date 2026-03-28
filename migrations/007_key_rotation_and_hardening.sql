-- Key rotation: secondary MCP key support for zero-downtime rotation.
-- Encryption key fingerprint: stores hash of the encryption key so we can
-- detect if the key changes without being able to recover it.
-- Export tracking: records when data was last exported for anti-lock-in reminders.
-- Backup verification tracking: records when backups were last verified.

-- Secondary key for zero-downtime rotation
ALTER TABLE brain_users ADD COLUMN IF NOT EXISTS secondary_key_hash TEXT;
ALTER TABLE brain_users ADD COLUMN IF NOT EXISTS secondary_key_prefix TEXT;
ALTER TABLE brain_users ADD COLUMN IF NOT EXISTS key_created_at TIMESTAMPTZ;
ALTER TABLE brain_users ADD COLUMN IF NOT EXISTS secondary_key_created_at TIMESTAMPTZ;

-- System metadata (key-value store for operational tracking)
CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
