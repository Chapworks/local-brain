-- Local Brain schema for self-hosted PostgreSQL + pgvector
-- Full schema for fresh installs. Existing installs use migrations/.

CREATE EXTENSION IF NOT EXISTS vector;

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Brain users (MCP client identities)
CREATE TABLE IF NOT EXISTS brain_users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mcp_key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL DEFAULT '',
    secondary_key_hash TEXT,
    secondary_key_prefix TEXT,
    key_created_at TIMESTAMPTZ,
    secondary_key_created_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brain_users_name ON brain_users (name);
CREATE INDEX IF NOT EXISTS idx_brain_users_key_prefix ON brain_users (key_prefix);

-- Thoughts
CREATE TABLE IF NOT EXISTS thoughts (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    user_id BIGINT REFERENCES brain_users(id),
    expires_at TIMESTAMPTZ,
    archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thoughts_created_at ON thoughts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thoughts_metadata ON thoughts USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_thoughts_user_id ON thoughts (user_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_expires_at ON thoughts (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thoughts_archived ON thoughts (archived) WHERE archived = TRUE;

-- Thought connections
CREATE TABLE IF NOT EXISTS thought_links (
    id BIGSERIAL PRIMARY KEY,
    source_id BIGINT NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    target_id BIGINT NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    similarity FLOAT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_thought_links_source ON thought_links (source_id);
CREATE INDEX IF NOT EXISTS idx_thought_links_target ON thought_links (target_id);

-- Digest configurations
CREATE TABLE IF NOT EXISTS digest_configs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES brain_users(id),
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
    delivery TEXT NOT NULL CHECK (delivery IN ('webhook')),
    webhook_url TEXT,
    last_sent_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES brain_users(id),
    operation TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_operation ON api_usage (operation);

-- Admin UI user accounts
CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Notifications (backup failures, system warnings, health alerts)
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system',
    link TEXT,
    dismissed BOOLEAN DEFAULT FALSE,
    dismissed_by TEXT,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications (dismissed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications (source);

-- System metadata (operational tracking — last export, backup verification, key fingerprints)
CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Mark all migrations as applied (fresh install has full schema)
INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5), (6), (7) ON CONFLICT DO NOTHING;
