/**
 * CLI script to create or update admin users.
 *
 * Usage (from project root):
 *   docker compose exec mcp-server deno run \
 *     --allow-net --allow-env \
 *     /app/scripts/create-user.ts <username> <password>
 *
 * If the username already exists, the password is updated.
 */

import { Pool } from "postgres";
import { hashPassword } from "../admin/auth.ts";

const username = Deno.args[0];
const password = Deno.args[1];

if (!username || !password) {
  console.error("Usage: create-user.ts <username> <password>");
  console.error("  Creates a new admin user or updates an existing one.");
  Deno.exit(1);
}

if (password.length < 8) {
  console.error("Error: Password must be at least 8 characters.");
  Deno.exit(1);
}

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
  const hash = await hashPassword(password);

  await client.queryObject(
    `INSERT INTO admin_users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username)
     DO UPDATE SET password_hash = $2, updated_at = NOW()`,
    [username, hash]
  );

  console.log(`Admin user "${username}" created/updated.`);
} catch (err) {
  console.error("Error:", (err as Error).message);
  Deno.exit(1);
} finally {
  client.release();
  await pool.end();
}
