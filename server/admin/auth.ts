/**
 * Authentication utilities — bcrypt password hashing and JWT session tokens.
 */

import * as bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  Deno.env.get("ADMIN_JWT_SECRET") || "change-me"
);
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
