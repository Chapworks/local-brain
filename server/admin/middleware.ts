/**
 * Hono middleware for admin route authentication and access mode enforcement.
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verifyToken, COOKIE_NAME } from "./auth.ts";

const ACCESS_MODE = Deno.env.get("ADMIN_ACCESS_MODE") || "local";

/** Block tunnel-originated requests when in local-only mode. */
export const accessModeGuard = createMiddleware(async (c, next) => {
  if (ACCESS_MODE === "local") {
    const cfIp = c.req.header("cf-connecting-ip");
    if (cfIp) {
      return c.text("Admin UI is in local-only mode.", 403);
    }
  }
  return next();
});

/** Require a valid JWT session cookie. Skips the login page itself. */
export const requireAuth = createMiddleware(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/admin/login") {
    return next();
  }

  const token = getCookie(c, COOKIE_NAME);
  if (!token) {
    return c.redirect("/admin/login");
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return c.redirect("/admin/login");
  }

  c.set("user", payload.sub);
  return next();
});
