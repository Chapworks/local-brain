import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { requireAuth, requireSuperuser } from "./middleware.ts";
import { createToken, COOKIE_NAME } from "./auth.ts";
import type { AuthUser } from "./middleware.ts";

// --- requireAuth: path exemptions ---

Deno.test("requireAuth — allows /admin/login without cookie", async () => {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/admin/login", (c) => c.text("ok"));

  const res = await app.request("/admin/login");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("requireAuth — allows /admin/recovery without cookie", async () => {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/admin/recovery", (c) => c.text("ok"));

  const res = await app.request("/admin/recovery");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("requireAuth — redirects /admin to login without cookie", async () => {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/admin", (c) => c.text("ok"));

  const res = await app.request("/admin", { redirect: "manual" });
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/admin/login");
});

Deno.test("requireAuth — redirects /admin/thoughts to login without cookie", async () => {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/admin/thoughts", (c) => c.text("ok"));

  const res = await app.request("/admin/thoughts", { redirect: "manual" });
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/admin/login");
});

Deno.test("requireAuth — redirects on invalid JWT cookie", async () => {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/admin", (c) => c.text("ok"));

  const res = await app.request("/admin", {
    redirect: "manual",
    headers: { Cookie: `${COOKIE_NAME}=invalid.token.here` },
  });
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/admin/login");
});

Deno.test("requireAuth — allows request with valid JWT and sets authUser", async () => {
  const token = await createToken(42, "testuser", false);
  // deno-lint-ignore no-explicit-any
  const app = new Hono<any>();
  app.use("*", requireAuth);
  app.get("/admin", (c) => {
    const authUser = c.get("authUser") as AuthUser;
    return c.json({ id: authUser.id, username: authUser.username, su: authUser.isSuperuser });
  });

  const res = await app.request("/admin", {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, 42);
  assertEquals(body.username, "testuser");
  assertEquals(body.su, false);
});

Deno.test("requireAuth — sets legacy 'user' string on context", async () => {
  const token = await createToken(1, "admin", true);
  // deno-lint-ignore no-explicit-any
  const app = new Hono<any>();
  app.use("*", requireAuth);
  app.get("/admin", (c) => c.text(c.get("user") as string));

  const res = await app.request("/admin", {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "admin");
});

// --- requireSuperuser ---

Deno.test("requireSuperuser — allows superuser", async () => {
  const token = await createToken(1, "admin", true);
  const app = new Hono();
  app.use("*", requireAuth);
  app.use("*", requireSuperuser);
  app.get("/admin/users", (c) => c.text("ok"));

  const res = await app.request("/admin/users", {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });
  assertEquals(res.status, 200);
});

Deno.test("requireSuperuser — redirects non-superuser", async () => {
  const token = await createToken(2, "regular", false);
  const app = new Hono();
  app.use("*", requireAuth);
  app.use("*", requireSuperuser);
  app.get("/admin/users", (c) => c.text("ok"));

  const res = await app.request("/admin/users", {
    redirect: "manual",
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/admin");
});

Deno.test("requireSuperuser — redirects if no authUser set", async () => {
  const app = new Hono();
  // Skip requireAuth — authUser is not set
  app.use("*", requireSuperuser);
  app.get("/admin/users", (c) => c.text("ok"));

  const res = await app.request("/admin/users", { redirect: "manual" });
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/admin");
});
