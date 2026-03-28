-- Multi-user support: brain_users table and user_id on thoughts

CREATE TABLE IF NOT EXISTS brain_users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mcp_key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brain_users_name ON brain_users (name);
CREATE INDEX IF NOT EXISTS idx_brain_users_key_prefix ON brain_users (key_prefix);

-- Add user_id column (nullable first for migration)
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES brain_users(id);
CREATE INDEX IF NOT EXISTS idx_thoughts_user_id ON thoughts (user_id);
