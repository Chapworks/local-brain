/**
 * Backfill thought links for existing thoughts.
 *
 * Usage:
 *   docker compose exec mcp-server deno run \
 *     --allow-net --allow-env --allow-read \
 *     /app/scripts/backfill-links.ts [--batch-size=100] [--top-n=3]
 *
 * For each thought without links, finds the top-N most similar thoughts
 * and creates link records.
 */

import { Pool } from "postgres";

const pool = new Pool(
  {
    hostname: Deno.env.get("DB_HOST") || "127.0.0.1",
    port: parseInt(Deno.env.get("DB_PORT") || "5432", 10),
    database: Deno.env.get("DB_NAME") || "localbrain",
    user: Deno.env.get("DB_USER") || "localbrain",
    password: Deno.env.get("DB_PASSWORD")!,
  },
  1
);

// Parse args
const args = Object.fromEntries(
  Deno.args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v || "true"];
    })
);

const BATCH_SIZE = parseInt(args["batch-size"] || "100", 10);
const TOP_N = parseInt(args["top-n"] || "3", 10);
const MIN_SIMILARITY = 0.3;

const client = await pool.connect();

try {
  // Find thoughts that have no outgoing links and have embeddings
  const unlinked = await client.queryObject<{ id: number }>(
    `SELECT t.id FROM thoughts t
     WHERE t.embedding IS NOT NULL
       AND t.archived = FALSE
       AND NOT EXISTS (SELECT 1 FROM thought_links tl WHERE tl.source_id = t.id)
     ORDER BY t.created_at DESC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  if (unlinked.rows.length === 0) {
    console.log("All thoughts already have links. Nothing to backfill.");
    Deno.exit(0);
  }

  console.log(`Found ${unlinked.rows.length} thought(s) without links. Backfilling...`);

  let totalLinks = 0;

  for (const row of unlinked.rows) {
    // Find top-N similar thoughts (excluding self, matching same user)
    const similar = await client.queryObject<{
      target_id: number;
      similarity: number;
    }>(
      `SELECT t2.id AS target_id,
              1 - (t1.embedding <=> t2.embedding) AS similarity
       FROM thoughts t1, thoughts t2
       WHERE t1.id = $1
         AND t2.id != $1
         AND t2.embedding IS NOT NULL
         AND t2.archived = FALSE
         AND (t1.user_id IS NULL OR t1.user_id = t2.user_id)
         AND 1 - (t1.embedding <=> t2.embedding) >= $2
       ORDER BY t1.embedding <=> t2.embedding
       LIMIT $3`,
      [row.id, MIN_SIMILARITY, TOP_N]
    );

    for (const link of similar.rows) {
      await client.queryObject(
        `INSERT INTO thought_links (source_id, target_id, similarity)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, target_id) DO NOTHING`,
        [row.id, link.target_id, link.similarity]
      );
      totalLinks++;
    }
  }

  console.log(
    `Backfilled ${totalLinks} link(s) for ${unlinked.rows.length} thought(s).`
  );
} finally {
  client.release();
  await pool.end();
}
