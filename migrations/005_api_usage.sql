-- Migration 005: API usage tracking for cost monitoring

CREATE TABLE IF NOT EXISTS api_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES brain_users(id),
    operation TEXT NOT NULL,  -- 'embedding', 'metadata', 'embedding:search', 'embedding:import'
    model TEXT NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_operation ON api_usage (operation);
