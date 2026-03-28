/**
 * Brain user management CLI.
 *
 * Usage:
 *   docker compose exec mcp-server deno run \
 *     --allow-net --allow-env --allow-read \
 *     /app/scripts/create-brain-user.ts <name>
 *
 * Generates a unique MCP access key for the user.
 * The key is shown ONCE — it cannot be retrieved later.
 */

import { Pool } from "postgres";
import * as bcrypt from "bcrypt";

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

const name = Deno.args[0];
if (!name) {
  console.error("Usage: create-brain-user.ts <name>");
  console.error("  Creates a brain user with a new MCP access key.");
  Deno.exit(1);
}

const client = await pool.connect();

try {
  // Check if user already exists
  const existing = await client.queryObject<{ id: number }>(
    "SELECT id FROM brain_users WHERE name = $1",
    [name]
  );

  if (existing.rows.length) {
    console.log(`User "${name}" already exists. Generating a new key...`);
  }

  // Generate a random MCP key: prefix (8 chars) + full key
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const fullKey = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const prefix = fullKey.slice(0, 8);

  const keyHash = await bcrypt.hash(fullKey, 12);

  if (existing.rows.length) {
    await client.queryObject(
      "UPDATE brain_users SET mcp_key_hash = $1, key_prefix = $2, updated_at = CURRENT_TIMESTAMP WHERE name = $3",
      [keyHash, prefix, name]
    );
    console.log(`\n  Updated key for user: ${name}`);
  } else {
    await client.queryObject(
      "INSERT INTO brain_users (name, mcp_key_hash, key_prefix) VALUES ($1, $2, $3)",
      [name, keyHash, prefix]
    );
    console.log(`\n  Created brain user: ${name}`);
  }

  console.log(`\n  MCP Access Key: ${fullKey}`);
  console.log(`  Key Prefix:     ${prefix}`);
  console.log(`\n  ⚠ Save this key now — it cannot be retrieved later.`);
  console.log(
    `  Use this key in the x-brain-key header or ?key= param when connecting MCP clients.\n`
  );
} finally {
  client.release();
  await pool.end();
}
