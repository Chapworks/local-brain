import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  COOKIE_NAME,
} from "./auth.ts";

// --- hashPassword & verifyPassword ---

Deno.test("hashPassword — produces a bcrypt hash", async () => {
  const hash = await hashPassword("test123");
  assertEquals(hash.startsWith("$2"), true); // bcrypt prefix
  assertEquals(hash.length > 50, true);
});

Deno.test("verifyPassword — correct password returns true", async () => {
  const hash = await hashPassword("mypassword");
  const valid = await verifyPassword("mypassword", hash);
  assertEquals(valid, true);
});

Deno.test("verifyPassword — wrong password returns false", async () => {
  const hash = await hashPassword("correct");
  const valid = await verifyPassword("wrong", hash);
  assertEquals(valid, false);
});

Deno.test("hashPassword — different inputs produce different hashes", async () => {
  const hash1 = await hashPassword("password1");
  const hash2 = await hashPassword("password2");
  assertEquals(hash1 !== hash2, true);
});

Deno.test("hashPassword — same input produces different hashes (salt)", async () => {
  const hash1 = await hashPassword("same");
  const hash2 = await hashPassword("same");
  assertEquals(hash1 !== hash2, true); // bcrypt uses random salt
});

// --- createToken & verifyToken ---

Deno.test("createToken — returns a JWT string", async () => {
  const token = await createToken("admin");
  assertEquals(typeof token, "string");
  // JWT has 3 parts separated by dots
  assertEquals(token.split(".").length, 3);
});

Deno.test("verifyToken — valid token returns payload with sub", async () => {
  const token = await createToken("testuser");
  const payload = await verifyToken(token);
  assertEquals(payload!.sub, "testuser");
});

Deno.test("verifyToken — invalid token returns null", async () => {
  const result = await verifyToken("invalid.token.here");
  assertEquals(result, null);
});

Deno.test("verifyToken — tampered token returns null", async () => {
  const token = await createToken("user");
  const tampered = token.slice(0, -5) + "XXXXX";
  const result = await verifyToken(tampered);
  assertEquals(result, null);
});

Deno.test("verifyToken — empty string returns null", async () => {
  const result = await verifyToken("");
  assertEquals(result, null);
});

// --- COOKIE_NAME ---

Deno.test("COOKIE_NAME is lb_session", () => {
  assertEquals(COOKIE_NAME, "lb_session");
});
