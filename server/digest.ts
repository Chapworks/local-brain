/**
 * Digest generation and delivery.
 *
 * Generates summary digests of recent thoughts and delivers via webhook.
 */

import type { Pool } from "postgres";

interface DigestConfig {
  id: number;
  user_id: number;
  user_name: string;
  frequency: string;
  webhook_url: string;
  last_sent_at: string | null;
}

interface DigestData {
  user_name: string;
  period: string;
  total_thoughts: number;
  types: Record<string, number>;
  top_topics: [string, number][];
  people_mentioned: string[];
  action_items: string[];
  sample_thoughts: string[];
}

/** Get all active digest configs that are due to be sent. */
export async function getDueDigests(pool: Pool): Promise<DigestConfig[]> {
  const client = await pool.connect();
  try {
    const result = await client.queryObject<DigestConfig>(`
      SELECT dc.id, dc.user_id, bu.name AS user_name, dc.frequency,
             dc.webhook_url, dc.last_sent_at
      FROM digest_configs dc
      JOIN brain_users bu ON bu.id = dc.user_id
      WHERE dc.is_active = TRUE
        AND dc.webhook_url IS NOT NULL
        AND (
          dc.last_sent_at IS NULL
          OR (dc.frequency = 'daily' AND dc.last_sent_at < NOW() - INTERVAL '23 hours')
          OR (dc.frequency = 'weekly' AND dc.last_sent_at < NOW() - INTERVAL '6 days 23 hours')
        )
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/** Generate digest data for a specific user. */
export async function generateDigest(
  pool: Pool,
  userId: number,
  userName: string,
  frequency: string
): Promise<DigestData> {
  const client = await pool.connect();
  const interval = frequency === "weekly" ? "7 days" : "1 day";

  try {
    const result = await client.queryObject<{
      content: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT content, metadata FROM thoughts
       WHERE user_id = $1 AND archived = FALSE
         AND created_at >= NOW() - INTERVAL '${interval}'
       ORDER BY created_at DESC`,
      [userId]
    );

    const thoughts = result.rows;
    const types: Record<string, number> = {};
    const topics: Record<string, number> = {};
    const people = new Set<string>();
    const actions: string[] = [];

    for (const t of thoughts) {
      const m = t.metadata || {};
      if (m.type) types[m.type as string] = (types[m.type as string] || 0) + 1;
      if (Array.isArray(m.topics)) {
        for (const topic of m.topics) {
          topics[topic as string] = (topics[topic as string] || 0) + 1;
        }
      }
      if (Array.isArray(m.people)) {
        for (const p of m.people) people.add(p as string);
      }
      if (Array.isArray(m.action_items)) {
        for (const a of m.action_items) actions.push(a as string);
      }
    }

    const topTopics = Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) as [string, number][];

    return {
      user_name: userName,
      period: frequency === "weekly" ? "Last 7 days" : "Last 24 hours",
      total_thoughts: thoughts.length,
      types,
      top_topics: topTopics,
      people_mentioned: [...people],
      action_items: actions,
      sample_thoughts: thoughts.slice(0, 5).map((t) => t.content.slice(0, 200)),
    };
  } finally {
    client.release();
  }
}

/** Format digest as a readable text block. */
export function formatDigest(data: DigestData): string {
  const lines = [
    `📊 Local Brain Digest — ${data.user_name}`,
    `Period: ${data.period}`,
    `Total new thoughts: ${data.total_thoughts}`,
    "",
  ];

  if (Object.keys(data.types).length > 0) {
    lines.push("Types:");
    for (const [type, count] of Object.entries(data.types)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push("");
  }

  if (data.top_topics.length > 0) {
    lines.push("Top topics:");
    for (const [topic, count] of data.top_topics) {
      lines.push(`  ${topic}: ${count}`);
    }
    lines.push("");
  }

  if (data.people_mentioned.length > 0) {
    lines.push(`People mentioned: ${data.people_mentioned.join(", ")}`);
    lines.push("");
  }

  if (data.action_items.length > 0) {
    lines.push("Open action items:");
    for (const item of data.action_items) {
      lines.push(`  • ${item}`);
    }
    lines.push("");
  }

  if (data.sample_thoughts.length > 0) {
    lines.push("Recent thoughts:");
    for (const thought of data.sample_thoughts) {
      lines.push(`  — ${thought}${thought.length >= 200 ? "..." : ""}`);
    }
  }

  return lines.join("\n");
}

/** Deliver digest via webhook. */
export async function deliverDigest(
  webhookUrl: string,
  digest: DigestData
): Promise<boolean> {
  try {
    const text = formatDigest(digest);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        digest,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error(`Digest delivery failed: ${(err as Error).message}`);
    return false;
  }
}

/** Mark a digest config as sent. */
export async function markDigestSent(pool: Pool, configId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryObject(
      "UPDATE digest_configs SET last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [configId]
    );
  } finally {
    client.release();
  }
}

/** Process all due digests. Called by cron. */
export async function processDigests(pool: Pool): Promise<void> {
  const due = await getDueDigests(pool);
  if (due.length === 0) return;

  console.log(`Processing ${due.length} due digest(s)...`);

  for (const config of due) {
    try {
      const digest = await generateDigest(
        pool,
        config.user_id,
        config.user_name,
        config.frequency
      );

      if (digest.total_thoughts === 0) {
        console.log(`  Skipping digest for ${config.user_name} — no new thoughts.`);
        await markDigestSent(pool, config.id);
        continue;
      }

      const ok = await deliverDigest(config.webhook_url, digest);
      if (ok) {
        await markDigestSent(pool, config.id);
        console.log(`  ✓ Digest sent for ${config.user_name}`);
      } else {
        console.error(`  ✗ Digest delivery failed for ${config.user_name}`);
      }
    } catch (err) {
      console.error(`  ✗ Digest error for ${config.user_name}: ${(err as Error).message}`);
    }
  }
}
