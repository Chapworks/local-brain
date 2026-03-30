-- Migration 009: Self-service account management
-- Adds recovery codes, admin reset policy, must_change_password,
-- user soft-delete, and thought/link trash support.

BEGIN;

-- Users: recovery codes and admin reset policy
ALTER TABLE users ADD COLUMN recovery_code_hashes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN admin_reset_policy VARCHAR(20) NOT NULL DEFAULT 'reset_full';
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Users: soft-delete support
ALTER TABLE users ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN deleted_username VARCHAR(100);
ALTER TABLE users ADD COLUMN deleted_name VARCHAR(100);

-- Thoughts: trash support
ALTER TABLE thoughts ADD COLUMN trashed_at TIMESTAMPTZ;

-- Thought links: trash support
ALTER TABLE thought_links ADD COLUMN trashed_at TIMESTAMPTZ;

-- Indexes for efficient trash queries and cleanup
CREATE INDEX idx_thoughts_trashed_at ON thoughts (trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX idx_thought_links_trashed_at ON thought_links (trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX idx_users_is_deleted ON users (is_deleted) WHERE is_deleted = TRUE;

-- Track migration
INSERT INTO schema_migrations (version) VALUES (9);

COMMIT;
