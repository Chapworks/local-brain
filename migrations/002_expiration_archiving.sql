-- Thought expiration and archiving

ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_thoughts_expires_at ON thoughts (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thoughts_archived ON thoughts (archived) WHERE archived = TRUE;
