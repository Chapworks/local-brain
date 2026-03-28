-- Notifications for admin panel alerts (backup failures, system warnings, etc.)

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
