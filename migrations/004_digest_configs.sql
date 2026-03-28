-- Scheduled digests

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
