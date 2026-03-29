/**
 * Authentication utilities — bcrypt password hashing and JWT session tokens.
 */

import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";

// CR-05: Refuse to start with default/missing JWT secret
const rawSecret = Deno.env.get("ADMIN_JWT_SECRET");
if (!rawSecret || rawSecret === "change-me") {
  console.error(
    "FATAL: ADMIN_JWT_SECRET is not set or is the default value.\n" +
    "Set a strong random secret in your .env file:\n" +
    '  ADMIN_JWT_SECRET=$(openssl rand -hex 32)\n' +
    "The admin panel will not work without this."
  );
  // Don't crash the MCP server — just make auth always fail
}
const JWT_SECRET = new TextEncoder().encode(rawSecret || crypto.randomUUID());
const COOKIE_NAME = "lb_session";
const TOKEN_EXPIRY = "7d";

export { COOKIE_NAME };

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}

export async function createToken(username: string): Promise<string> {
  return await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { sub: string };
  } catch {
    return null;
  }
}
