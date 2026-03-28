/**
 * Database migration runner.
 *
 * Usage:
 *   docker compose exec mcp-server deno run \
 *     --allow-net --allow-env --allow-read \
 *     /app/scripts/migrate.ts
 *
 * Reads SQL files from /app/migrations/ and applies any that haven't run yet.
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

const client = await pool.connect();

try {
  // Ensure migration table exists
  await client.queryObject(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied versions
  const applied = await client.queryObject<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  const appliedSet = new Set(applied.rows.map((r) => r.version));

  // Read migration files
  const migrationsDir = "/app/migrations";
  const files: { version: number; path: string; name: string }[] = [];

  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const match = entry.name.match(/^(\d+)/);
    if (!match) continue;
    files.push({
      version: parseInt(match[1], 10),
      path: `${migrationsDir}/${entry.name}`,
      name: entry.name,
    });
  }

  files.sort((a, b) => a.version - b.version);

  let applied_count = 0;
  for (const file of files) {
    if (appliedSet.has(file.version)) {
      console.log(`  ✓ ${file.name} (already applied)`);
      continue;
    }

    console.log(`  → Applying ${file.name}...`);
    const sql = await Deno.readTextFile(file.path);

    await client.queryObject("BEGIN");
    try {
      await client.queryObject(sql);
      await client.queryObject(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [file.version]
      );
      await client.queryObject("COMMIT");
      console.log(`  ✓ ${file.name} applied.`);
      applied_count++;
    } catch (err) {
      await client.queryObject("ROLLBACK");
      console.error(`  ✗ ${file.name} failed:`, (err as Error).message);
      Deno.exit(1);
    }
  }

  if (applied_count === 0) {
    console.log("All migrations already applied.");
  } else {
    console.log(`Applied ${applied_count} migration(s).`);
  }
} finally {
  client.release();
  await pool.end();
}
