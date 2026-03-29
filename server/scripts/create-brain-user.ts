/**
 * Brain user management CLI.
 *
 * Usage:
 *   create-brain-user.ts <name>              — create user or replace key
 *   create-brain-user.ts <name> --rotate     — generate secondary key (zero-downtime rotation)
 *   create-brain-user.ts <name> --promote    — promote secondary key to primary, revoke old primary
 *   create-brain-user.ts <name> --revoke-secondary — remove secondary key without promoting
 *
 * Run inside the mcp-server container:
 *   docker compose exec mcp-server deno run \
 *     --allow-net --allow-env --allow-read \
 *     /app/scripts/create-brain-user.ts <name> [--rotate|--promote|--revoke-secondary]
 *
 * The key is shown ONCE — it cannot be retrieved later.
 */

import { Pool } from "postgres";
import bcrypt from "bcrypt";

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
const flag = Deno.args[1];

if (!name || name.startsWith("--")) {
  console.error("Usage: create-brain-user.ts <name> [--rotate|--promote|--revoke-secondary]");
  console.error("");
  console.error("  <name>                Create user or replace primary key");
  console.error("  <name> --rotate       Generate secondary key (both keys work)");
  console.error("  <name> --promote      Promote secondary to primary, revoke old primary");
  console.error("  <name> --revoke-secondary  Remove secondary key");
  Deno.exit(1);
}

/** Generate a random 64-char hex key. */
function generateKey(): { fullKey: string; prefix: string } {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const fullKey = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { fullKey, prefix: fullKey.slice(0, 8) };
}

const client = await pool.connect();

try {
  const existing = await client.queryObject<{
    id: number;
    secondary_key_hash: string | null;
  }>(
    "SELECT id, secondary_key_hash FROM brain_users WHERE name = $1",
    [name]
  );

  if (flag === "--rotate") {
    // --- Key rotation: generate secondary key ---
    if (!existing.rows.length) {
      console.error(`User "${name}" does not exist. Create them first.`);
      Deno.exit(1);
    }
    if (existing.rows[0].secondary_key_hash) {
      console.error(`User "${name}" already has a secondary key. --promote or --revoke-secondary first.`);
      Deno.exit(1);
    }

    const { fullKey, prefix } = generateKey();
    const keyHash = await bcrypt.hash(fullKey, 12);

    await client.queryObject(
      `UPDATE brain_users
       SET secondary_key_hash = $1, secondary_key_prefix = $2,
           secondary_key_created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE name = $3`,
      [keyHash, prefix, name]
    );

    console.log(`\n  Generated secondary key for: ${name}`);
    console.log(`  Both the old and new keys now work.`);
    console.log(`\n  Secondary MCP Key: ${fullKey}`);
    console.log(`  Key Prefix:        ${prefix}`);
    console.log(`\n  Next steps:`);
    console.log(`    1. Update your MCP clients with the new key`);
    console.log(`    2. Run: create-brain-user.ts ${name} --promote`);
    console.log(`    3. The old key will stop working after promotion.\n`);

  } else if (flag === "--promote") {
    // --- Promote secondary to primary ---
    if (!existing.rows.length) {
      console.error(`User "${name}" does not exist.`);
      Deno.exit(1);
    }
    if (!existing.rows[0].secondary_key_hash) {
      console.error(`User "${name}" has no secondary key to promote. Run --rotate first.`);
      Deno.exit(1);
    }

    await client.queryObject(
      `UPDATE brain_users
       SET mcp_key_hash = secondary_key_hash,
           key_prefix = secondary_key_prefix,
           key_created_at = secondary_key_created_at,
           secondary_key_hash = NULL,
           secondary_key_prefix = NULL,
           secondary_key_created_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE name = $1`,
      [name]
    );

    console.log(`\n  Promoted secondary key for: ${name}`);
    console.log(`  The old primary key no longer works.`);
    console.log(`  The secondary key is now the only active key.\n`);

  } else if (flag === "--revoke-secondary") {
    // --- Revoke secondary key ---
    if (!existing.rows.length) {
      console.error(`User "${name}" does not exist.`);
      Deno.exit(1);
    }

    await client.queryObject(
      `UPDATE brain_users
       SET secondary_key_hash = NULL, secondary_key_prefix = NULL,
           secondary_key_created_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE name = $1`,
      [name]
    );

    console.log(`\n  Revoked secondary key for: ${name}`);
    console.log(`  Only the primary key remains active.\n`);

  } else {
    // --- Create user or replace primary key ---
    const { fullKey, prefix } = generateKey();
    const keyHash = await bcrypt.hash(fullKey, 12);

    if (existing.rows.length) {
      console.log(`User "${name}" already exists. Replacing primary key...`);
      await client.queryObject(
        `UPDATE brain_users
         SET mcp_key_hash = $1, key_prefix = $2, key_created_at = CURRENT_TIMESTAMP,
             secondary_key_hash = NULL, secondary_key_prefix = NULL, secondary_key_created_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE name = $3`,
        [keyHash, prefix, name]
      );
      console.log(`\n  Replaced key for user: ${name}`);
      console.log(`  WARNING: The old key no longer works. All secondary keys cleared.`);
    } else {
      await client.queryObject(
        `INSERT INTO brain_users (name, mcp_key_hash, key_prefix, key_created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [name, keyHash, prefix]
      );
      console.log(`\n  Created brain user: ${name}`);
    }

    console.log(`\n  MCP Access Key: ${fullKey}`);
    console.log(`  Key Prefix:     ${prefix}`);
    console.log(`\n  Save this key now — it cannot be retrieved later.`);
    console.log(
      `  Use this key in the x-brain-key header or ?key= param when connecting MCP clients.`
    );
    console.log(`\n  For zero-downtime rotation later, use: create-brain-user.ts ${name} --rotate\n`);
  }
} finally {
  client.release();
  await pool.end();
}
