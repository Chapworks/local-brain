/**
 * Unified user management CLI.
 *
 * Usage:
 *   create-user.ts <username> <password>              — create user with password + MCP key
 *   create-user.ts <username> <password> --superuser   — create as superuser
 *   create-user.ts <username> --rotate                 — generate secondary MCP key
 *   create-user.ts <username> --promote                — promote secondary to primary
 *   create-user.ts <username> --revoke-secondary       — remove secondary key
 *   create-user.ts <username> --reset-password <pass>  — reset password
 *
 * Run inside the mcp-server container:
 *   docker compose exec mcp-server deno run \
 *     --allow-net --allow-env --allow-read \
 *     /app/scripts/create-user.ts <username> <password>
 *
 * The first user created is automatically a superuser.
 * The MCP key is shown ONCE — it cannot be retrieved later.
 */

import { Pool } from "postgres";
import bcrypt from "bcrypt";
import { hashPassword } from "../admin/auth.ts";
import { generateKey, generateRecoveryCodes } from "../crypto-utils.ts";

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

const username = Deno.args[0];
const arg2 = Deno.args[1];
const arg3 = Deno.args[2];

if (!username || username.startsWith("--")) {
  console.error("Usage:");
  console.error("  create-user.ts <username> <password>              — create user");
  console.error("  create-user.ts <username> <password> --superuser  — create as superuser");
  console.error("  create-user.ts <username> --rotate                — generate secondary MCP key");
  console.error("  create-user.ts <username> --promote               — promote secondary to primary");
  console.error("  create-user.ts <username> --revoke-secondary      — remove secondary key");
  console.error("  create-user.ts <username> --reset-password <pass> — reset password");
  Deno.exit(1);
}


const client = await pool.connect();

try {
  // Check for existing user
  const existing = await client.queryObject<{
    id: number;
    secondary_key_hash: string | null;
  }>(
    "SELECT id, secondary_key_hash FROM users WHERE username = $1",
    [username]
  );

  if (arg2 === "--rotate") {
    // --- Key rotation: generate secondary key ---
    if (!existing.rows.length) {
      console.error(`User "${username}" does not exist. Create them first.`);
      Deno.exit(1);
    }
    if (existing.rows[0].secondary_key_hash) {
      console.error(`User "${username}" already has a secondary key. --promote or --revoke-secondary first.`);
      Deno.exit(1);
    }

    const { fullKey, prefix } = generateKey();

    const keyHash = await bcrypt.hash(fullKey, 12);

    await client.queryObject(
      `UPDATE users
       SET secondary_key_hash = $1, secondary_key_prefix = $2,
           secondary_key_created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE username = $3`,
      [keyHash, prefix, username]
    );

    console.log(`\n  Generated secondary key for: ${username}`);
    console.log(`  Both the old and new keys now work.`);
    console.log(`\n  Secondary MCP Key: ${fullKey}`);
    console.log(`  Key Prefix:        ${prefix}`);
    console.log(`\n  Next steps:`);
    console.log(`    1. Update your MCP clients with the new key`);
    console.log(`    2. Run: create-user.ts ${username} --promote`);
    console.log(`    3. The old key will stop working after promotion.\n`);

  } else if (arg2 === "--promote") {
    // --- Promote secondary to primary ---
    if (!existing.rows.length) {
      console.error(`User "${username}" does not exist.`);
      Deno.exit(1);
    }
    if (!existing.rows[0].secondary_key_hash) {
      console.error(`User "${username}" has no secondary key to promote. Run --rotate first.`);
      Deno.exit(1);
    }

    await client.queryObject(
      `UPDATE users
       SET mcp_key_hash = secondary_key_hash,
           key_prefix = secondary_key_prefix,
           key_created_at = secondary_key_created_at,
           secondary_key_hash = NULL,
           secondary_key_prefix = NULL,
           secondary_key_created_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = $1`,
      [username]
    );

    console.log(`\n  Promoted secondary key for: ${username}`);
    console.log(`  The old primary key no longer works.`);
    console.log(`  The secondary key is now the only active key.\n`);

  } else if (arg2 === "--revoke-secondary") {
    // --- Revoke secondary key ---
    if (!existing.rows.length) {
      console.error(`User "${username}" does not exist.`);
      Deno.exit(1);
    }

    await client.queryObject(
      `UPDATE users
       SET secondary_key_hash = NULL, secondary_key_prefix = NULL,
           secondary_key_created_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE username = $1`,
      [username]
    );

    console.log(`\n  Revoked secondary key for: ${username}`);
    console.log(`  Only the primary key remains active.\n`);

  } else if (arg2 === "--reset-password") {
    // --- Reset password ---
    const newPassword = arg3;
    if (!newPassword || newPassword.length < 8) {
      console.error("Usage: create-user.ts <username> --reset-password <new-password>");
      console.error("  Password must be at least 8 characters.");
      Deno.exit(1);
    }
    if (!existing.rows.length) {
      console.error(`User "${username}" does not exist.`);
      Deno.exit(1);
    }

    const passHash = await hashPassword(newPassword);
    await client.queryObject(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2",
      [passHash, username]
    );

    console.log(`\n  Password reset for: ${username}\n`);

  } else {
    // --- Create new user ---
    const password = arg2;
    const makeSuperuser = arg3 === "--superuser";

    if (!password || password.startsWith("--")) {
      console.error("Usage: create-user.ts <username> <password>");
      Deno.exit(1);
    }
    if (password.length < 8) {
      console.error("Error: Password must be at least 8 characters.");
      Deno.exit(1);
    }
    if (existing.rows.length) {
      console.error(`User "${username}" already exists. Use --reset-password to change password or --rotate for key rotation.`);
      Deno.exit(1);
    }

    // Auto-superuser if no users exist
    const countResult = await client.queryObject<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM users"
    );
    const isFirst = (countResult.rows[0]?.count || 0) === 0;
    const isSuperuser = isFirst || makeSuperuser;

    const passHash = await hashPassword(password);
    const { fullKey, prefix } = generateKey();

    const keyHash = await bcrypt.hash(fullKey, 12);
    const { plainCodes, hashes: codeHashes } = await generateRecoveryCodes();

    await client.queryObject(
      `INSERT INTO users (name, username, password_hash, mcp_key_hash, key_prefix, is_superuser, key_created_at, recovery_code_hashes)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7::jsonb)`,
      [username, username, passHash, keyHash, prefix, isSuperuser, JSON.stringify(codeHashes)]
    );

    console.log(`\n  Created user: ${username}`);
    if (isSuperuser) {
      console.log(`  Role: superuser${isFirst ? " (first user — automatic)" : ""}`);
    }
    console.log(`\n  MCP Access Key: ${fullKey}`);
    console.log(`  Key Prefix:     ${prefix}`);
    console.log(`\n  Recovery Codes (save these — they cannot be retrieved later):`);
    for (const code of plainCodes) {
      console.log(`    ${code}`);
    }
    console.log(`\n  Save this key and recovery codes now — they cannot be retrieved later.`);
    console.log(`  Use the MCP key in the x-brain-key header when connecting MCP clients.`);
    console.log(`  Use recovery codes to regain access if you lose your password.`);
    console.log(`\n  Admin panel: log in at /admin with username "${username}" and your password.`);
    console.log(`  For zero-downtime key rotation later, use: create-user.ts ${username} --rotate\n`);
  }
} finally {
  client.release();
  await pool.end();
}
