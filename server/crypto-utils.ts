/**
 * Shared cryptographic utilities for key generation, recovery codes, etc.
 */

import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

/** Generate a random 64-char hex MCP key. */
export function generateKey(): { fullKey: string; prefix: string } {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const fullKey = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { fullKey, prefix: fullKey.slice(0, 8) };
}

/** Hash a key with bcrypt. */
export async function hashKey(key: string): Promise<string> {
  return await bcrypt.hash(key, BCRYPT_ROUNDS);
}

/** Generate a random temporary password (16 chars, alphanumeric). Uses rejection sampling to avoid modulo bias. */
export function generateTempPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const limit = 256 - (256 % chars.length); // 252 for 62-char alphabet — reject bytes >= 252
  const result: string[] = [];
  while (result.length < 16) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit) {
        result.push(chars[b % chars.length]);
        if (result.length === 16) break;
      }
    }
  }
  return result.join("");
}

/**
 * Generate 8 one-time recovery codes.
 * Format: XXXX-XXXX-XXXX (12 alphanumeric chars with dashes).
 * Returns both the plain codes (shown once to user) and bcrypt hashes (stored).
 */
export async function generateRecoveryCodes(): Promise<{
  plainCodes: string[];
  hashes: string[];
}> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  const codes: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const raw = Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    codes.push(formatted);
    hashes.push(await bcrypt.hash(formatted, BCRYPT_ROUNDS));
  }

  return { plainCodes: codes, hashes };
}

/**
 * Verify a recovery code against stored hashes.
 * If valid, returns the remaining hashes with the matched one removed.
 */
export async function verifyRecoveryCode(
  plain: string,
  hashes: string[]
): Promise<{ valid: boolean; remainingHashes: string[] }> {
  // Normalize: uppercase and ensure dash format
  const normalized = plain.toUpperCase().replace(/\s/g, "");

  for (let i = 0; i < hashes.length; i++) {
    const match = await bcrypt.compare(normalized, hashes[i]);
    if (match) {
      const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      return { valid: true, remainingHashes: remaining };
    }
  }

  return { valid: false, remainingHashes: hashes };
}
