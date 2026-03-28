/**
 * Notification system for the admin panel.
 *
 * Notifications are stored in the database and displayed as a banner bar
 * at the top of every admin page. Sources include backup health checks,
 * system warnings, and cron job failures.
 */

import type { Pool } from "postgres";

export interface Notification {
  id: number;
  level: "info" | "warning" | "error";
  title: string;
  message: string;
  source: string;
  link: string | null;
  created_at: string;
}

/** Get all active (undismissed) notifications, newest first. */
export async function getActiveNotifications(pool: Pool): Promise<Notification[]> {
  const client = await pool.connect();
  try {
    const result = await client.queryObject<Notification>(
      `SELECT id, level, title, message, source, link, created_at
       FROM notifications
       WHERE dismissed = FALSE
       ORDER BY
         CASE level WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT 20`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/** Dismiss a single notification. */
export async function dismissNotification(
  pool: Pool,
  notificationId: number,
  dismissedBy: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryObject(
      `UPDATE notifications
       SET dismissed = TRUE, dismissed_by = $1, dismissed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [dismissedBy, notificationId]
    );
  } finally {
    client.release();
  }
}

/** Dismiss all notifications from a given source. */
export async function dismissBySource(
  pool: Pool,
  source: string,
  dismissedBy: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryObject(
      `UPDATE notifications
       SET dismissed = TRUE, dismissed_by = $1, dismissed_at = CURRENT_TIMESTAMP
       WHERE source = $2 AND dismissed = FALSE`,
      [dismissedBy, source]
    );
  } finally {
    client.release();
  }
}

/** Dismiss all notifications. */
export async function dismissAll(pool: Pool, dismissedBy: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryObject(
      `UPDATE notifications
       SET dismissed = TRUE, dismissed_by = $1, dismissed_at = CURRENT_TIMESTAMP
       WHERE dismissed = FALSE`,
      [dismissedBy]
    );
  } finally {
    client.release();
  }
}

/**
 * Create a notification. Deduplicates by source + title — if an identical
 * undismissed notification already exists, it won't create a duplicate.
 */
export async function createNotification(
  pool: Pool,
  opts: {
    level: "info" | "warning" | "error";
    title: string;
    message: string;
    source: string;
    link?: string;
  }
): Promise<void> {
  const client = await pool.connect();
  try {
    // Deduplicate: don't create if an identical active notification exists
    const existing = await client.queryObject<{ id: number }>(
      `SELECT id FROM notifications
       WHERE source = $1 AND title = $2 AND dismissed = FALSE
       LIMIT 1`,
      [opts.source, opts.title]
    );

    if (existing.rows.length > 0) return;

    await client.queryObject(
      `INSERT INTO notifications (level, title, message, source, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [opts.level, opts.title, opts.message, opts.source, opts.link || null]
    );
  } finally {
    client.release();
  }
}

/**
 * Run backup health checks and create notifications for problems.
 * Called periodically by the MCP server cron.
 */
export async function checkBackupHealth(pool: Pool): Promise<void> {
  // Check if backups are configured at all
  const backupCron = Deno.env.get("BACKUP_CRON");
  const dbPassword = Deno.env.get("DB_PASSWORD");

  // If there's no DB_PASSWORD, we're probably not fully configured yet
  if (!dbPassword) return;

  // Check: is encryption enabled?
  const encryptionKey = Deno.env.get("BACKUP_ENCRYPTION_KEY");
  if (!encryptionKey) {
    await createNotification(pool, {
      level: "warning",
      title: "Backup encryption disabled",
      message: "Your backups are not encrypted. Set BACKUP_ENCRYPTION_KEY in your .env to encrypt backups with AES-256 before storage.",
      source: "backup-health",
      link: "/admin/config",
    });
  }

  // Check: is cloud sync configured?
  const rcloneRemote = Deno.env.get("RCLONE_REMOTE");
  if (!rcloneRemote) {
    await createNotification(pool, {
      level: "warning",
      title: "No off-site backup configured",
      message: "Backups are only stored locally. If this machine fails, your backups go with it. Configure RCLONE_REMOTE to sync backups to cloud storage.",
      source: "backup-health",
      link: "/admin/backups",
    });
  }
}
