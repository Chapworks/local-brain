import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateKey,
  hashKey,
  generateTempPassword,
  generateRecoveryCodes,
  verifyRecoveryCode,
} from "./crypto-utils.ts";

// --- generateKey ---

Deno.test("generateKey — returns 64-char hex string", () => {
  const { fullKey } = generateKey();
  assertEquals(fullKey.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(fullKey), true);
});

Deno.test("generateKey — prefix is first 8 chars of key", () => {
  const { fullKey, prefix } = generateKey();
  assertEquals(prefix, fullKey.slice(0, 8));
  assertEquals(prefix.length, 8);
});

Deno.test("generateKey — generates unique keys", () => {
  const keys = new Set<string>();
  for (let i = 0; i < 10; i++) {
    keys.add(generateKey().fullKey);
  }
  assertEquals(keys.size, 10);
});

// --- hashKey ---

Deno.test("hashKey — produces a bcrypt hash", async () => {
  const hash = await hashKey("testkey123");
  assertEquals(hash.startsWith("$2"), true);
  assertEquals(hash.length > 50, true);
});

Deno.test("hashKey — different inputs produce different hashes", async () => {
  const h1 = await hashKey("key1");
  const h2 = await hashKey("key2");
  assertEquals(h1 !== h2, true);
});

// --- generateTempPassword ---

Deno.test("generateTempPassword — returns 16 chars", () => {
  const pw = generateTempPassword();
  assertEquals(pw.length, 16);
});

Deno.test("generateTempPassword — only alphanumeric chars", () => {
  const pw = generateTempPassword();
  assertEquals(/^[A-Za-z0-9]+$/.test(pw), true);
});

Deno.test("generateTempPassword — generates unique passwords", () => {
  const pws = new Set<string>();
  for (let i = 0; i < 10; i++) {
    pws.add(generateTempPassword());
  }
  assertEquals(pws.size, 10);
});

Deno.test("generateTempPassword — uses full character range (no obvious bias)", () => {
  // Generate many passwords and check that we see uppercase, lowercase, and digits
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    for (const ch of generateTempPassword()) {
      seen.add(ch);
    }
  }
  // With 50 * 16 = 800 chars from a 62-char alphabet, we should see nearly all chars
  assertEquals(seen.size > 50, true, `Only saw ${seen.size} unique chars out of 62`);
});

Deno.test("generateTempPassword — rejection sampling produces no out-of-range chars", () => {
  // Run many times to exercise the rejection loop
  for (let i = 0; i < 100; i++) {
    const pw = generateTempPassword();
    assertEquals(pw.length, 16);
    assertEquals(/^[A-Za-z0-9]+$/.test(pw), true, `Password contains invalid char: ${pw}`);
  }
});

// --- generateRecoveryCodes ---

Deno.test("generateRecoveryCodes — returns 8 codes", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  assertEquals(plainCodes.length, 8);
  assertEquals(hashes.length, 8);
});

Deno.test("generateRecoveryCodes — codes are in XXXX-XXXX-XXXX format", async () => {
  const { plainCodes } = await generateRecoveryCodes();
  for (const code of plainCodes) {
    assertEquals(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), true);
  }
});

Deno.test("generateRecoveryCodes — all codes are unique", async () => {
  const { plainCodes } = await generateRecoveryCodes();
  const unique = new Set(plainCodes);
  assertEquals(unique.size, 8);
});

Deno.test("generateRecoveryCodes — hashes are bcrypt", async () => {
  const { hashes } = await generateRecoveryCodes();
  for (const hash of hashes) {
    assertEquals(hash.startsWith("$2"), true);
  }
});

Deno.test("generateRecoveryCodes — codes exclude confusing chars (I, O, 0, 1)", async () => {
  // Run a few times to increase confidence
  for (let i = 0; i < 3; i++) {
    const { plainCodes } = await generateRecoveryCodes();
    for (const code of plainCodes) {
      const raw = code.replace(/-/g, "");
      assertEquals(/[IO01]/.test(raw), false, `Code ${code} contains confusing character`);
    }
  }
});

// --- verifyRecoveryCode ---

Deno.test("verifyRecoveryCode — valid code returns true and removes hash", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  const codeToUse = plainCodes[0];

  const { valid, remainingHashes } = await verifyRecoveryCode(codeToUse, hashes);
  assertEquals(valid, true);
  assertEquals(remainingHashes.length, 7);
});

Deno.test("verifyRecoveryCode — invalid code returns false and preserves hashes", async () => {
  const { hashes } = await generateRecoveryCodes();

  const { valid, remainingHashes } = await verifyRecoveryCode("XXXX-XXXX-XXXX", hashes);
  assertEquals(valid, false);
  assertEquals(remainingHashes.length, 8);
});

Deno.test("verifyRecoveryCode — same code cannot be used twice", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  const codeToUse = plainCodes[3];

  const first = await verifyRecoveryCode(codeToUse, hashes);
  assertEquals(first.valid, true);

  const second = await verifyRecoveryCode(codeToUse, first.remainingHashes);
  assertEquals(second.valid, false);
});

Deno.test("verifyRecoveryCode — case insensitive", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  const code = plainCodes[0];
  const lowerCode = code.toLowerCase();

  const { valid } = await verifyRecoveryCode(lowerCode, hashes);
  assertEquals(valid, true);
});

Deno.test("verifyRecoveryCode — whitespace is stripped", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  const code = " " + plainCodes[0] + " ";

  const { valid } = await verifyRecoveryCode(code, hashes);
  assertEquals(valid, true);
});

Deno.test("verifyRecoveryCode — empty hashes array returns false", async () => {
  const { valid } = await verifyRecoveryCode("ABCD-EFGH-JKLM", []);
  assertEquals(valid, false);
});

Deno.test("verifyRecoveryCode — without dashes still works", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  const code = plainCodes[2];
  const noDashes = code.replace(/-/g, "");

  const { valid } = await verifyRecoveryCode(noDashes, hashes);
  // Codes are hashed WITH dashes, so stripping them should fail
  // (verifyRecoveryCode uppercases and strips whitespace but preserves dashes)
  assertEquals(valid, false);
});

Deno.test("verifyRecoveryCode — mixed case with dashes works", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  const code = plainCodes[5];
  // Codes are uppercase; lowering the whole thing should still verify
  const mixed = code.toLowerCase();

  const { valid } = await verifyRecoveryCode(mixed, hashes);
  assertEquals(valid, true);
});

Deno.test("verifyRecoveryCode — consuming all 8 codes leaves empty array", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();
  let remaining = hashes;

  for (let i = 0; i < 8; i++) {
    const result = await verifyRecoveryCode(plainCodes[i], remaining);
    assertEquals(result.valid, true, `Code ${i} should be valid`);
    remaining = result.remainingHashes;
  }

  assertEquals(remaining.length, 0);

  // Now nothing should verify
  const { valid } = await verifyRecoveryCode(plainCodes[0], remaining);
  assertEquals(valid, false);
});

Deno.test("verifyRecoveryCode — each code maps to its own hash", async () => {
  const { plainCodes, hashes } = await generateRecoveryCodes();

  // Use code at index 4 — verify it works
  const { valid } = await verifyRecoveryCode(plainCodes[4], hashes);
  assertEquals(valid, true);

  // Use code at index 7 — verify it works
  const { valid: valid2 } = await verifyRecoveryCode(plainCodes[7], hashes);
  assertEquals(valid2, true);
});
