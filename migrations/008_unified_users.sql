-- Migration 008: Unified user model
-- Merges brain_users + admin_users into a single users table with role-based access.

BEGIN;

-- 1. Create the unified users table
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    mcp_key_hash VARCHAR(255) NOT NULL DEFAULT '',
    key_prefix VARCHAR(8) NOT NULL DEFAULT '',
    secondary_key_hash VARCHAR(255),
    secondary_key_prefix VARCHAR(8),
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    key_created_at TIMESTAMPTZ,
    secondary_key_created_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate brain_users into users (preserve IDs for FK integrity)
INSERT INTO users (id, name, username, mcp_key_hash, key_prefix,
    secondary_key_hash, secondary_key_prefix, is_active,
    key_created_at, secondary_key_created_at, created_at, updated_at)
SELECT id, name, LOWER(REPLACE(name, ' ', '-')),
    mcp_key_hash, key_prefix,
    secondary_key_hash, secondary_key_prefix, is_active,
    key_created_at, secondary_key_created_at, created_at, updated_at
FROM brain_users;

-- Advance sequence past existing brain_users IDs
SELECT setval('users_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1));

-- 3. Merge admin_users: match by username where possible

-- 3a. Matched admin users → update existing row with password and superuser flag
UPDATE users u
SET password_hash = a.password_hash,
    is_superuser = TRUE,
    updated_at = CURRENT_TIMESTAMP
FROM admin_users a
WHERE u.username = a.username;

-- 3b. Unmatched admin users → insert as new rows (no MCP key)
INSERT INTO users (name, username, password_hash, is_superuser, is_active)
SELECT a.username, a.username, a.password_hash, TRUE, TRUE
FROM admin_users a
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.username = a.username
);

-- 4. Indexes
CREATE INDEX idx_users_key_prefix ON users (key_prefix) WHERE key_prefix != '';
CREATE INDEX idx_users_secondary_key_prefix ON users (secondary_key_prefix)
    WHERE secondary_key_prefix IS NOT NULL;
CREATE INDEX idx_users_is_active ON users (is_active) WHERE is_active = TRUE;

-- 5. Re-point foreign keys from brain_users to users
ALTER TABLE thoughts DROP CONSTRAINT IF EXISTS thoughts_user_id_fkey;
ALTER TABLE thoughts ADD CONSTRAINT thoughts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE digest_configs DROP CONSTRAINT IF EXISTS digest_configs_user_id_fkey;
ALTER TABLE digest_configs ADD CONSTRAINT digest_configs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE api_usage DROP CONSTRAINT IF EXISTS api_usage_user_id_fkey;
ALTER TABLE api_usage ADD CONSTRAINT api_usage_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

-- 6. Ensure at least one superuser exists
-- If no admin_users were matched, promote the first user
UPDATE users SET is_superuser = TRUE
WHERE id = (SELECT MIN(id) FROM users)
AND NOT EXISTS (SELECT 1 FROM users WHERE is_superuser = TRUE);

-- 7. Drop old tables
DROP TABLE IF EXISTS admin_users;
DROP TABLE IF EXISTS brain_users;

COMMIT;
