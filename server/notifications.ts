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

// --- System metadata helpers ---

/** Get a value from the system_meta table. */
export async function getMeta(pool: Pool, key: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    const result = await client.queryObject<{ value: string }>(
      "SELECT value FROM system_meta WHERE key = $1",
      [key]
    );
    return result.rows[0]?.value || null;
  } catch {
    return null; // Table may not exist yet
  } finally {
    client.release();
  }
}

/** Set a value in the system_meta table (upsert). */
export async function setMeta(pool: Pool, key: string, value: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryObject(
      `INSERT INTO system_meta (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  } catch {
    // Table may not exist yet — silently skip
  } finally {
    client.release();
  }
}

/** Record that an export was performed. */
export async function recordExport(pool: Pool): Promise<void> {
  await setMeta(pool, "last_export_at", new Date().toISOString());
}

/** Record backup verification result. */
export async function recordBackupVerification(
  pool: Pool,
  passed: boolean,
  details: string
): Promise<void> {
  await setMeta(pool, "last_backup_verify_at", new Date().toISOString());
  await setMeta(pool, "last_backup_verify_result", passed ? "pass" : "fail");
  await setMeta(pool, "last_backup_verify_details", details);

  if (!passed) {
    await createNotification(pool, {
      level: "error",
      title: "Backup verification failed",
      message: `The most recent backup could not be restored: ${details}`,
      source: "backup-verify",
      link: "/admin/backups",
    });
  }
}

/** Store a fingerprint of the encryption key (SHA-256 hash of the key). */
async function storeEncryptionKeyFingerprint(pool: Pool): Promise<void> {
  const encryptionKey = Deno.env.get("BACKUP_ENCRYPTION_KEY");
  if (!encryptionKey) return;

  const encoder = new TextEncoder();
  const data = encoder.encode(encryptionKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const fingerprint = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);

  const existing = await getMeta(pool, "encryption_key_fingerprint");
  if (existing && existing !== fingerprint) {
    await createNotification(pool, {
      level: "error",
      title: "Encryption key changed",
      message: "Your BACKUP_ENCRYPTION_KEY has changed. Old backups encrypted with the previous key cannot be restored with the new key. Make sure you still have the old key stored safely.",
      source: "encryption-key",
      link: "/admin/config",
    });
  }

  await setMeta(pool, "encryption_key_fingerprint", fingerprint);
}

/**
 * Run all health checks and create notifications for problems.
 * Called periodically by the MCP server cron.
 */
export async function checkBackupHealth(pool: Pool): Promise<void> {
  const dbPassword = Deno.env.get("DB_PASSWORD");
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
  } else {
    // Track encryption key fingerprint — detect if key changes
    await storeEncryptionKeyFingerprint(pool);

    // First-run: warn user to store their key safely
    const keyWarned = await getMeta(pool, "encryption_key_warned");
    if (!keyWarned) {
      await createNotification(pool, {
        level: "warning",
        title: "Store your encryption key safely",
        message: "Your backups are encrypted with BACKUP_ENCRYPTION_KEY. If you lose this key, encrypted backups cannot be recovered. Write it down and store it somewhere safe — separate from this server.",
        source: "encryption-key-warning",
        link: "/admin/config",
      });
      await setMeta(pool, "encryption_key_warned", "true");
    }
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

  // Check: has a backup been verified recently?
  const lastVerify = await getMeta(pool, "last_backup_verify_at");
  if (!lastVerify) {
    await createNotification(pool, {
      level: "warning",
      title: "Backups never verified",
      message: "Your backups have never been tested with a restore. A backup that can't be restored is worthless. Verification runs weekly if configured.",
      source: "backup-verify",
      link: "/admin/backups",
    });
  } else {
    const daysSinceVerify = (Date.now() - new Date(lastVerify).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceVerify > 14) {
      await createNotification(pool, {
        level: "warning",
        title: "Backup verification overdue",
        message: `Last verified ${Math.floor(daysSinceVerify)} days ago. Backups should be verified at least weekly.`,
        source: "backup-verify",
        link: "/admin/backups",
      });
    }
  }

  // Check: has data been exported recently? (anti-lock-in guarantee)
  const lastExport = await getMeta(pool, "last_export_at");
  const client = await pool.connect();
  let thoughtCount = 0;
  try {
    const result = await client.queryObject<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM thoughts WHERE archived = FALSE AND trashed_at IS NULL"
    );
    thoughtCount = result.rows[0]?.count || 0;

    // Check: are any MCP keys older than 6 months?
    try {
      const keyResult = await client.queryObject<{
        name: string;
        key_created_at: string | null;
      }>(
        "SELECT name, username, key_created_at FROM users WHERE is_active = TRUE AND is_deleted = FALSE AND key_created_at IS NOT NULL"
      );
      for (const row of keyResult.rows) {
        if (row.key_created_at) {
          const ageDays = (Date.now() - new Date(row.key_created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > 180) {
            await createNotification(pool, {
              level: "info",
              title: `MCP key for "${row.name}" is ${Math.floor(ageDays)} days old`,
              message: `Consider rotating the key with: create-user.ts ${row.username} --rotate`,
              source: "key-rotation",
              link: "/admin/users",
            });
          }
        }
      }
    } catch {
      // users table may not have key_created_at yet
    }
  } finally {
    client.release();
  }

  if (thoughtCount > 0 && !lastExport) {
    await createNotification(pool, {
      level: "info",
      title: "No data export on record",
      message: `You have ${thoughtCount} thoughts but have never exported them. Exports protect you if the software changes or you want to move to something else.`,
      source: "export-reminder",
      link: "/admin/import-export",
    });
  } else if (thoughtCount > 0 && lastExport) {
    const daysSinceExport = (Date.now() - new Date(lastExport).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceExport > 90) {
      await createNotification(pool, {
        level: "info",
        title: "Data export overdue",
        message: `Last export was ${Math.floor(daysSinceExport)} days ago. You have ${thoughtCount} active thoughts. Export periodically to ensure your data isn't locked in.`,
        source: "export-reminder",
        link: "/admin/import-export",
      });
    }
  }
}
