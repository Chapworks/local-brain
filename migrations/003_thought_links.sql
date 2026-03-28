-- Thought connections / graph

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
