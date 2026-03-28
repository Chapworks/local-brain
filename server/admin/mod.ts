/**
 * Local Brain Admin UI — Hono sub-application.
 *
 * Mounted at /admin in the main server. Provides:
 *   - Dashboard with thought stats and service health
 *   - Thoughts browser with filtering and pagination
 *   - Configuration viewer/editor
 *   - Docker container log viewer and service restarts
 *   - JWT session auth with bcrypt passwords
 */

import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Pool } from "postgres";

import { accessModeGuard, requireAuth } from "./middleware.ts";
import {
  verifyPassword,
  createToken,
  COOKIE_NAME,
} from "./auth.ts";

// --- Page renderers ---
import { LoginPage } from "./pages/login.tsx";
import { DashboardPage } from "./pages/dashboard.tsx";
import { ThoughtsPage } from "./pages/thoughts.tsx";
import { ConfigPage } from "./pages/config.tsx";
import { LogsPage } from "./pages/logs.tsx";

// Known .env keys and their sections for the config editor
const CONFIG_SCHEMA: { key: string; section: string; secret: boolean }[] = [
  { key: "DB_PASSWORD", section: "Database", secret: true },
  { key: "MCP_ACCESS_KEY", section: "MCP Authentication", secret: true },
  { key: "CLOUDFLARE_TUNNEL_TOKEN", section: "Cloudflare Tunnel", secret: true },
  { key: "EMBEDDING_API_BASE", section: "AI Provider", secret: false },
  { key: "EMBEDDING_API_KEY", section: "AI Provider", secret: true },
  { key: "EMBEDDING_MODEL", section: "AI Provider", secret: false },
  { key: "CHAT_API_BASE", section: "AI Provider", secret: false },
  { key: "CHAT_API_KEY", section: "AI Provider", secret: true },
  { key: "CHAT_MODEL", section: "AI Provider", secret: false },
  { key: "CHAT_API_FORMAT", section: "AI Provider", secret: false },
  { key: "ADMIN_JWT_SECRET", section: "Admin", secret: true },
  { key: "ADMIN_ACCESS_MODE", section: "Admin", secret: false },
];

const DOCKER_API = Deno.env.get("DOCKER_API_URL") || "http://docker-proxy:2375";
const COMPOSE_SERVICES = ["postgres", "mcp-server", "tunnel", "docker-proxy"];
const ENV_PATH = "/app/.env";

// --- Helpers ---

/** Read and parse the .env file. */
async function readEnvFile(): Promise<Record<string, string>> {
  try {
    const text = await Deno.readTextFile(ENV_PATH);
    const env: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return env;
  } catch {
    return {};
  }
}

/** Write the .env file preserving comments and order. */
async function writeEnvFile(updates: Record<string, string>): Promise<void> {
  let text: string;
  try {
    text = await Deno.readTextFile(ENV_PATH);
  } catch {
    text = "";
  }

  const lines = text.split("\n");
  const written = new Set<string>();

  const result = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq);
    if (key in updates) {
      written.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append any new keys not already in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  await Deno.writeTextFile(ENV_PATH, result.join("\n"));
}

/** Fetch container info from the Docker socket proxy. */
async function getContainers(): Promise<
  { name: string; status: string; state: string; created: number }[]
> {
  try {
    const res = await fetch(`${DOCKER_API}/containers/json?all=true`);
    if (!res.ok) return [];
    const containers = await res.json();
    return containers.map((c: Record<string, unknown>) => ({
      name:
        ((c.Labels as Record<string, string>)?.["com.docker.compose.service"]) ||
        ((c.Names as string[])?.[0]?.replace("/", "")) ||
        "unknown",
      status: c.Status as string,
      state: c.State as string,
      created: c.Created as number,
    }));
  } catch {
    return [];
  }
}

/** Fetch logs for a specific compose service. */
async function getServiceLogs(
  service: string,
  tail = 200
): Promise<string> {
  try {
    const res = await fetch(`${DOCKER_API}/containers/json?all=true`);
    if (!res.ok) return "Failed to connect to Docker API.";
    const containers = await res.json();
    const container = containers.find(
      (c: Record<string, unknown>) =>
        (c.Labels as Record<string, string>)?.["com.docker.compose.service"] ===
        service
    );
    if (!container) return `Container for service "${service}" not found.`;

    const logRes = await fetch(
      `${DOCKER_API}/containers/${container.Id}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=true`
    );
    if (!logRes.ok) return `Failed to fetch logs: ${logRes.status}`;

    // Docker log stream has 8-byte header frames; strip them for display
    const raw = new Uint8Array(await logRes.arrayBuffer());
    return stripDockerLogHeaders(raw);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

/** Strip Docker stream protocol 8-byte headers from log output. */
function stripDockerLogHeaders(raw: Uint8Array): string {
  const lines: string[] = [];
  let i = 0;
  const decoder = new TextDecoder();

  while (i + 8 <= raw.length) {
    // bytes 4-7 are big-endian uint32 frame size
    const size =
      (raw[i + 4] << 24) | (raw[i + 5] << 16) | (raw[i + 6] << 8) | raw[i + 7];
    i += 8;
    if (i + size > raw.length) break;
    lines.push(decoder.decode(raw.slice(i, i + size)));
    i += size;
  }

  // If parsing failed (no valid frames), treat the whole thing as plain text
  if (lines.length === 0) {
    return decoder.decode(raw);
  }

  return lines.join("");
}

/** Restart a compose service via Docker API. */
async function restartService(service: string): Promise<boolean> {
  try {
    const res = await fetch(`${DOCKER_API}/containers/json`);
    if (!res.ok) return false;
    const containers = await res.json();
    const container = containers.find(
      (c: Record<string, unknown>) =>
        (c.Labels as Record<string, string>)?.["com.docker.compose.service"] ===
        service
    );
    if (!container) return false;

    const restartRes = await fetch(
      `${DOCKER_API}/containers/${container.Id}/restart`,
      { method: "POST" }
    );
    return restartRes.ok || restartRes.status === 204;
  } catch {
    return false;
  }
}

// --- Rate limiter for login ---
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

// --- Build the Hono sub-app ---

export function createAdminApp(pool: Pool): Hono {
  const admin = new Hono();

  // Apply access mode and auth middleware
  admin.use("*", accessModeGuard);
  admin.use("*", requireAuth);

  // --- Login ---

  admin.get("/login", (c) => {
    return c.html(<LoginPage /> as unknown as string);
  });

  admin.post("/login", async (c) => {
    const ip =
      c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return c.html(
        (<LoginPage error="Too many attempts. Try again in a minute." />) as unknown as string,
        429
      );
    }

    const body = await c.req.parseBody();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return c.html(
        (<LoginPage error="Username and password are required." />) as unknown as string
      );
    }

    const client = await pool.connect();
    try {
      const result = await client.queryObject<{
        password_hash: string;
      }>(
        "SELECT password_hash FROM admin_users WHERE username = $1",
        [username]
      );

      if (!result.rows.length) {
        return c.html(
          (<LoginPage error="Invalid username or password." />) as unknown as string
        );
      }

      const valid = await verifyPassword(password, result.rows[0].password_hash);
      if (!valid) {
        return c.html(
          (<LoginPage error="Invalid username or password." />) as unknown as string
        );
      }
    } finally {
      client.release();
    }

    const token = await createToken(username);
    setCookie(c, COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/admin",
      maxAge: 7 * 24 * 60 * 60,
    });

    return c.redirect("/admin");
  });

  admin.post("/logout", (c) => {
    deleteCookie(c, COOKIE_NAME, { path: "/admin" });
    return c.redirect("/admin/login");
  });

  // --- Dashboard ---

  admin.get("/", async (c) => {
    const user = c.get("user") as string;
    const client = await pool.connect();

    try {
      const countResult = await client.queryObject<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM thoughts"
      );

      const metaResult = await client.queryObject<{
        metadata: Record<string, unknown>;
        created_at: string;
      }>("SELECT metadata, created_at FROM thoughts ORDER BY created_at DESC");

      const total = countResult.rows[0]?.count || 0;
      const data = metaResult.rows;

      const types: Record<string, number> = {};
      const topics: Record<string, number> = {};

      for (const r of data) {
        const m = r.metadata || {};
        if (m.type)
          types[m.type as string] = (types[m.type as string] || 0) + 1;
        if (Array.isArray(m.topics))
          for (const t of m.topics)
            topics[t as string] = (topics[t as string] || 0) + 1;
      }

      const topTopics = Object.entries(topics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const dateRange =
        data.length > 0
          ? `${new Date(data[data.length - 1].created_at).toLocaleDateString()} → ${new Date(data[0].created_at).toLocaleDateString()}`
          : "";

      // Service health from Docker
      const containers = await getContainers();
      const services = COMPOSE_SERVICES.map((name) => {
        const c = containers.find((ct) => ct.name === name);
        return {
          name,
          status: c?.state || "unknown",
          uptime: c?.status || "—",
        };
      });

      return c.html(
        (
          <DashboardPage
            user={user}
            stats={{ totalThoughts: total, types, topTopics, dateRange, services }}
          />
        ) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  // --- Thoughts browser ---

  admin.get("/thoughts", async (c) => {
    const user = c.get("user") as string;
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const pageSize = 25;
    const filterType = c.req.query("type") || "";
    const filterTopic = c.req.query("topic") || "";
    const search = c.req.query("q") || "";

    const client = await pool.connect();
    try {
      // Build dynamic query
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (filterType) {
        conditions.push(`metadata->>'type' = $${paramIdx}`);
        params.push(filterType);
        paramIdx++;
      }
      if (filterTopic) {
        conditions.push(`metadata->'topics' ? $${paramIdx}`);
        params.push(filterTopic);
        paramIdx++;
      }
      if (search) {
        conditions.push(`content ILIKE $${paramIdx}`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      // Count
      const countResult = await client.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM thoughts ${where}`,
        params
      );
      const total = countResult.rows[0]?.count || 0;

      // Fetch page
      const offset = (page - 1) * pageSize;
      const thoughtsResult = await client.queryObject<{
        id: number;
        content: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT id, content, metadata, created_at FROM thoughts ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      );

      // Get all types and topics for filter dropdowns
      const typesResult = await client.queryObject<{ type: string }>(
        "SELECT DISTINCT metadata->>'type' AS type FROM thoughts WHERE metadata->>'type' IS NOT NULL ORDER BY type"
      );
      const topicsResult = await client.queryObject<{ topic: string }>(
        "SELECT DISTINCT jsonb_array_elements_text(metadata->'topics') AS topic FROM thoughts ORDER BY topic"
      );

      return c.html(
        (
          <ThoughtsPage
            user={user}
            thoughts={thoughtsResult.rows}
            total={total}
            page={page}
            pageSize={pageSize}
            filterType={filterType}
            filterTopic={filterTopic}
            search={search}
            allTypes={typesResult.rows.map((r) => r.type)}
            allTopics={topicsResult.rows.map((r) => r.topic)}
          />
        ) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  // --- Config ---

  admin.get("/config", async (c) => {
    const user = c.get("user") as string;
    const env = await readEnvFile();

    const config = CONFIG_SCHEMA.map((entry) => ({
      key: entry.key,
      value: env[entry.key] || "",
      masked: entry.secret,
      section: entry.section,
    }));

    return c.html(
      (<ConfigPage user={user} config={config} />) as unknown as string
    );
  });

  admin.post("/config", async (c) => {
    const user = c.get("user") as string;
    const body = await c.req.parseBody();
    const shouldRestart = body._restart === "1";

    const currentEnv = await readEnvFile();
    const updates: Record<string, string> = {};

    for (const entry of CONFIG_SCHEMA) {
      const newValue = String(body[entry.key] || "").trim();
      // Skip blank secret fields (keep current value)
      if (entry.secret && !newValue) continue;
      if (newValue) {
        updates[entry.key] = newValue;
      }
    }

    if (Object.keys(updates).length > 0) {
      await writeEnvFile({ ...currentEnv, ...updates });
    }

    if (shouldRestart) {
      await restartService("mcp-server");
    }

    const env = await readEnvFile();
    const config = CONFIG_SCHEMA.map((entry) => ({
      key: entry.key,
      value: env[entry.key] || "",
      masked: entry.secret,
      section: entry.section,
    }));

    return c.html(
      (
        <ConfigPage
          user={user}
          config={config}
          flash={{
            type: "success",
            message: shouldRestart
              ? "Configuration saved. MCP server is restarting."
              : "Configuration saved.",
          }}
        />
      ) as unknown as string
    );
  });

  // --- Logs ---

  admin.get("/logs", async (c) => {
    const user = c.get("user") as string;
    const service = c.req.query("service") || "mcp-server";

    if (!COMPOSE_SERVICES.includes(service)) {
      return c.text("Unknown service.", 400);
    }

    const logs = await getServiceLogs(service);

    return c.html(
      (
        <LogsPage
          user={user}
          service={service}
          logs={logs}
          services={COMPOSE_SERVICES}
        />
      ) as unknown as string
    );
  });

  // --- Service restart API ---

  admin.post("/api/services/:name/restart", async (c) => {
    const name = c.req.param("name");
    if (!COMPOSE_SERVICES.includes(name) || name === "docker-proxy") {
      return c.json({ error: "Cannot restart this service." }, 400);
    }

    const ok = await restartService(name);
    if (ok) {
      return c.redirect(`/admin/logs?service=${name}`);
    }
    return c.json({ error: "Restart failed." }, 500);
  });

  return admin;
}
