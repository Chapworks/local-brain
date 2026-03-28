/**
 * Local Brain Admin UI — Hono sub-application.
 *
 * Mounted at /admin in the main server. Provides:
 *   - Dashboard with thought stats and service health
 *   - Thoughts browser with filtering, pagination, archive/TTL controls
 *   - Brain user management
 *   - Thought connections graph visualization
 *   - Import/export
 *   - Digest configuration
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
import { parseImport } from "../import-parsers.ts";

// --- Page renderers ---
import { LoginPage } from "./pages/login.tsx";
import { DashboardPage } from "./pages/dashboard.tsx";
import { ThoughtsPage } from "./pages/thoughts.tsx";
import { ConfigPage } from "./pages/config.tsx";
import { LogsPage } from "./pages/logs.tsx";
import { UsersPage } from "./pages/users.tsx";
import { GraphPage } from "./pages/graph.tsx";
import { ImportExportPage } from "./pages/import-export.tsx";
import { DigestsPage } from "./pages/digests.tsx";
import { UsagePage } from "./pages/usage.tsx";
import { BackupsPage } from "./pages/backups.tsx";
import { getUsageSummary } from "../usage.ts";
import {
  getActiveNotifications,
  dismissNotification,
  dismissAll,
  recordExport,
} from "../notifications.ts";
import type { Notification } from "../notifications.ts";

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
  { key: "DIGEST_TIMEZONE", section: "Digests", secret: false },
  { key: "BACKUP_CRON", section: "Backups", secret: false },
  { key: "BACKUP_RETAIN_COUNT", section: "Backups", secret: false },
  { key: "BACKUP_ENCRYPTION_KEY", section: "Backups", secret: true },
  { key: "RCLONE_REMOTE", section: "Backups — Cloud", secret: false },
  { key: "BACKUP_CLOUD_RETAIN_COUNT", section: "Backups — Cloud", secret: false },
  { key: "RCLONE_CONFIG_REMOTE_TYPE", section: "Backups — Cloud", secret: false },
  { key: "RCLONE_CONFIG_REMOTE_PROVIDER", section: "Backups — Cloud", secret: false },
  { key: "RCLONE_CONFIG_REMOTE_ACCESS_KEY_ID", section: "Backups — Cloud", secret: true },
  { key: "RCLONE_CONFIG_REMOTE_SECRET_ACCESS_KEY", section: "Backups — Cloud", secret: true },
  { key: "RCLONE_CONFIG_REMOTE_ENDPOINT", section: "Backups — Cloud", secret: false },
  { key: "RCLONE_CONFIG_REMOTE_REGION", section: "Backups — Cloud", secret: false },
];

const DOCKER_API = Deno.env.get("DOCKER_API_URL") || "http://docker-proxy:2375";
const COMPOSE_SERVICES = ["postgres", "mcp-server", "tunnel", "docker-proxy", "db-backup"];
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

/** Get brain users list with thought counts. */
async function getBrainUsers(pool: Pool): Promise<
  { id: number; name: string; key_prefix: string; is_active: boolean; thought_count: number; created_at: string }[]
> {
  const client = await pool.connect();
  try {
    const result = await client.queryObject<{
      id: number;
      name: string;
      key_prefix: string;
      is_active: boolean;
      thought_count: number;
      created_at: string;
    }>(
      `SELECT bu.id, bu.name, bu.key_prefix, bu.is_active, bu.created_at,
              COALESCE(COUNT(t.id), 0)::int AS thought_count
       FROM brain_users bu
       LEFT JOIN thoughts t ON t.user_id = bu.id
       GROUP BY bu.id
       ORDER BY bu.created_at DESC`
    );
    return result.rows;
  } finally {
    client.release();
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

// Read version once at import time
const APP_VERSION = await Deno.readTextFile(
  new URL("../VERSION", import.meta.url).pathname
).catch(() =>
  Deno.readTextFile(new URL("../../VERSION", import.meta.url).pathname)
).then((v) => v.trim()).catch(() => "");

export function createAdminApp(pool: Pool): Hono {
  const admin = new Hono();

  // Apply access mode and auth middleware
  admin.use("*", accessModeGuard);
  admin.use("*", requireAuth);

  // Fetch active notifications for every request (used by Layout)
  admin.use("*", async (c, next) => {
    try {
      const notifs = await getActiveNotifications(pool);
      c.set("notifications", notifs);
    } catch {
      c.set("notifications", []);
    }
    return next();
  });

  /** Get notifications from context (set by middleware above). */
  // deno-lint-ignore no-explicit-any
  const notifs = (c: any): Notification[] => c.get("notifications") || [];

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

  // --- Notifications ---

  admin.post("/notifications/dismiss", async (c) => {
    const user = c.get("user") as string;
    const body = await c.req.parseBody();
    const id = parseInt(String(body.id), 10);
    if (id) {
      await dismissNotification(pool, id, user);
    }
    const referer = c.req.header("referer") || "/admin";
    return c.redirect(referer);
  });

  admin.post("/notifications/dismiss-all", async (c) => {
    const user = c.get("user") as string;
    await dismissAll(pool, user);
    const referer = c.req.header("referer") || "/admin";
    return c.redirect(referer);
  });

  // --- Dashboard ---

  admin.get("/", async (c) => {
    const user = c.get("user") as string;
    const client = await pool.connect();

    try {
      const countResult = await client.queryObject<{ count: number; archived: number }>(
        `SELECT
          COUNT(*) FILTER (WHERE archived = FALSE)::int AS count,
          COUNT(*) FILTER (WHERE archived = TRUE)::int AS archived
         FROM thoughts`
      );

      const metaResult = await client.queryObject<{
        metadata: Record<string, unknown>;
        created_at: string;
      }>("SELECT metadata, created_at FROM thoughts WHERE archived = FALSE ORDER BY created_at DESC");

      const total = countResult.rows[0]?.count || 0;
      const archived = countResult.rows[0]?.archived || 0;
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

      // User count and connection count
      const usersResult = await client.queryObject<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM brain_users WHERE is_active = TRUE"
      );
      const linksResult = await client.queryObject<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM thought_links"
      );

      return c.html(
        (
          <DashboardPage
            user={user}
            notifications={notifs(c)} version={APP_VERSION}
            stats={{
              totalThoughts: total,
              archivedThoughts: archived,
              types,
              topTopics,
              dateRange,
              services,
              brainUsers: usersResult.rows[0]?.count || 0,
              connections: linksResult.rows[0]?.count || 0,
            }}
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
    const filterUser = c.req.query("user_id") || "";
    const showArchived = c.req.query("archived") === "1";
    const search = c.req.query("q") || "";

    const client = await pool.connect();
    try {
      // Build dynamic query
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (!showArchived) {
        conditions.push("t.archived = FALSE");
      }

      if (filterType) {
        conditions.push(`t.metadata->>'type' = $${paramIdx}`);
        params.push(filterType);
        paramIdx++;
      }
      if (filterTopic) {
        conditions.push(`t.metadata->'topics' ? $${paramIdx}`);
        params.push(filterTopic);
        paramIdx++;
      }
      if (filterUser === "null") {
        conditions.push("t.user_id IS NULL");
      } else if (filterUser) {
        conditions.push(`t.user_id = $${paramIdx}`);
        params.push(parseInt(filterUser, 10));
        paramIdx++;
      }
      if (search) {
        conditions.push(`t.content ILIKE $${paramIdx}`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      // Count
      const countResult = await client.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM thoughts t ${where}`,
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
        archived: boolean;
        expires_at: string | null;
        user_name: string | null;
      }>(
        `SELECT t.id, t.content, t.metadata, t.created_at, t.archived, t.expires_at,
                bu.name AS user_name
         FROM thoughts t
         LEFT JOIN brain_users bu ON bu.id = t.user_id
         ${where} ORDER BY t.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      );

      // Get all types, topics, and users for filter dropdowns
      const typesResult = await client.queryObject<{ type: string }>(
        "SELECT DISTINCT metadata->>'type' AS type FROM thoughts WHERE metadata->>'type' IS NOT NULL ORDER BY type"
      );
      const topicsResult = await client.queryObject<{ topic: string }>(
        "SELECT DISTINCT jsonb_array_elements_text(metadata->'topics') AS topic FROM thoughts ORDER BY topic"
      );
      const usersResult = await client.queryObject<{ id: number; name: string }>(
        "SELECT id, name FROM brain_users ORDER BY name"
      );

      return c.html(
        (
          <ThoughtsPage
            user={user}
            notifications={notifs(c)} version={APP_VERSION}
            thoughts={thoughtsResult.rows}
            total={total}
            page={page}
            pageSize={pageSize}
            filterType={filterType}
            filterTopic={filterTopic}
            filterUser={filterUser}
            showArchived={showArchived}
            search={search}
            allTypes={typesResult.rows.map((r) => r.type)}
            allTopics={topicsResult.rows.map((r) => r.topic)}
            allUsers={usersResult.rows}
          />
        ) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  // --- Thought actions (archive, set TTL) ---

  admin.post("/thoughts/archive", async (c) => {
    const body = await c.req.parseBody();
    const thoughtId = parseInt(String(body.thought_id), 10);
    const unarchive = body.unarchive === "1";

    const client = await pool.connect();
    try {
      await client.queryObject(
        `UPDATE thoughts SET archived = $1, archived_at = ${unarchive ? "NULL" : "CURRENT_TIMESTAMP"} WHERE id = $2`,
        [!unarchive, thoughtId]
      );
    } finally {
      client.release();
    }

    return c.redirect("/admin/thoughts");
  });

  admin.post("/thoughts/set-ttl", async (c) => {
    const body = await c.req.parseBody();
    const thoughtId = parseInt(String(body.thought_id), 10);
    const days = parseInt(String(body.days || "0"), 10);

    const client = await pool.connect();
    try {
      if (days > 0) {
        await client.queryObject(
          `UPDATE thoughts SET expires_at = CURRENT_TIMESTAMP + INTERVAL '${days} days' WHERE id = $1`,
          [thoughtId]
        );
      } else {
        await client.queryObject(
          "UPDATE thoughts SET expires_at = NULL WHERE id = $1",
          [thoughtId]
        );
      }
    } finally {
      client.release();
    }

    return c.redirect("/admin/thoughts");
  });

  // --- Brain Users ---

  admin.get("/users", async (c) => {
    const user = c.get("user") as string;
    const brainUsers = await getBrainUsers(pool);

    return c.html(
      (<UsersPage user={user} notifications={notifs(c)} version={APP_VERSION} brainUsers={brainUsers} />) as unknown as string
    );
  });

  admin.post("/users/toggle", async (c) => {
    const body = await c.req.parseBody();
    const userId = parseInt(String(body.user_id), 10);
    const isActive = body.is_active === "true";

    const client = await pool.connect();
    try {
      await client.queryObject(
        "UPDATE brain_users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [isActive, userId]
      );
    } finally {
      client.release();
    }

    return c.redirect("/admin/users");
  });

  // --- Graph ---

  admin.get("/graph", async (c) => {
    const user = c.get("user") as string;
    const client = await pool.connect();

    try {
      // Get thoughts with link counts
      const nodesResult = await client.queryObject<{
        id: number;
        content: string;
        type: string;
        link_count: number;
      }>(
        `SELECT t.id, t.content, t.metadata->>'type' AS type,
                (SELECT COUNT(*)::int FROM thought_links tl WHERE tl.source_id = t.id OR tl.target_id = t.id) AS link_count
         FROM thoughts t
         WHERE t.archived = FALSE
           AND EXISTS (SELECT 1 FROM thought_links tl WHERE tl.source_id = t.id OR tl.target_id = t.id)
         ORDER BY link_count DESC
         LIMIT 200`
      );

      const nodeIds = new Set(nodesResult.rows.map((n) => n.id));

      const linksResult = await client.queryObject<{
        source: number;
        target: number;
        similarity: number;
      }>(
        `SELECT source_id AS source, target_id AS target, similarity
         FROM thought_links
         ORDER BY similarity DESC
         LIMIT 500`
      );

      // Only include links where both nodes are in the node set
      const links = linksResult.rows.filter(
        (l) => nodeIds.has(l.source) && nodeIds.has(l.target)
      );

      const graphData = JSON.stringify({
        nodes: nodesResult.rows,
        links,
      });

      return c.html(
        (<GraphPage user={user} notifications={notifs(c)} version={APP_VERSION} graphData={graphData} />) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  // --- Import/Export ---

  admin.get("/import-export", async (c) => {
    const user = c.get("user") as string;
    const client = await pool.connect();

    try {
      const countResult = await client.queryObject<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM thoughts"
      );
      const usersResult = await client.queryObject<{ id: number; name: string }>(
        "SELECT id, name FROM brain_users ORDER BY name"
      );

      return c.html(
        (
          <ImportExportPage
            user={user}
            notifications={notifs(c)} version={APP_VERSION}
            thoughtCount={countResult.rows[0]?.count || 0}
            brainUsers={usersResult.rows}
          />
        ) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  admin.post("/export", async (c) => {
    const body = await c.req.parseBody();
    const format = String(body.format || "json");
    const userId = body.user_id ? String(body.user_id) : "";
    const includeArchived = body.include_archived === "1";

    const client = await pool.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (!includeArchived) {
        conditions.push("archived = FALSE");
      }
      if (userId === "null") {
        conditions.push("user_id IS NULL");
      } else if (userId) {
        conditions.push(`user_id = $${paramIdx}`);
        params.push(parseInt(userId, 10));
        paramIdx++;
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await client.queryObject<{
        id: number;
        content: string;
        metadata: Record<string, unknown>;
        created_at: string;
        archived: boolean;
        expires_at: string | null;
      }>(
        `SELECT id, content, metadata, created_at, archived, expires_at FROM thoughts ${where} ORDER BY created_at DESC`,
        params
      );

      if (format === "markdown") {
        const lines = result.rows.map((t) => {
          const m = t.metadata || {};
          const header = `## Thought #${t.id} — ${new Date(t.created_at).toISOString().slice(0, 10)}`;
          const meta = [];
          if (m.type) meta.push(`Type: ${m.type}`);
          if (Array.isArray(m.topics) && m.topics.length)
            meta.push(`Topics: ${(m.topics as string[]).join(", ")}`);
          return `${header}\n${meta.length ? meta.join(" | ") + "\n" : ""}\n${t.content}\n`;
        });

        const md = `# Local Brain Export\n\n${result.rows.length} thoughts.\n\n${lines.join("\n---\n\n")}`;

        // Track export for anti-lock-in reminders
        recordExport(pool).catch(() => {});

        c.header("Content-Type", "text/markdown; charset=utf-8");
        c.header("Content-Disposition", "attachment; filename=local-brain-export.md");
        return c.body(md);
      }

      const exported = {
        exported_at: new Date().toISOString(),
        thought_count: result.rows.length,
        thoughts: result.rows.map((t) => ({
          id: t.id,
          content: t.content,
          metadata: t.metadata,
          created_at: t.created_at,
          archived: t.archived,
          expires_at: t.expires_at,
        })),
      };

      // Track export for anti-lock-in reminders
      recordExport(pool).catch(() => {});

      c.header("Content-Type", "application/json; charset=utf-8");
      c.header("Content-Disposition", "attachment; filename=local-brain-export.json");
      return c.body(JSON.stringify(exported, null, 2));
    } finally {
      client.release();
    }
  });

  admin.post("/import", async (c) => {
    const user = c.get("user") as string;
    const body = await c.req.parseBody();
    const file = body.file;
    const userId = body.user_id ? parseInt(String(body.user_id), 10) : null;

    if (!file || typeof file === "string") {
      const client = await pool.connect();
      try {
        const countResult = await client.queryObject<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM thoughts"
        );
        const usersResult = await client.queryObject<{ id: number; name: string }>(
          "SELECT id, name FROM brain_users ORDER BY name"
        );
        return c.html(
          (
            <ImportExportPage
              user={user}
              notifications={notifs(c)} version={APP_VERSION}
              thoughtCount={countResult.rows[0]?.count || 0}
              brainUsers={usersResult.rows}
              flash={{ type: "error", message: "No file selected." }}
            />
          ) as unknown as string
        );
      } finally {
        client.release();
      }
    }

    const fileObj = file as unknown as File;
    const text = await fileObj.text();
    const filename = fileObj.name || "import.txt";

    let thoughts;
    try {
      thoughts = parseImport(text, filename);
    } catch (err) {
      const client = await pool.connect();
      try {
        const countResult = await client.queryObject<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM thoughts"
        );
        const usersResult = await client.queryObject<{ id: number; name: string }>(
          "SELECT id, name FROM brain_users ORDER BY name"
        );
        return c.html(
          (
            <ImportExportPage
              user={user}
              notifications={notifs(c)} version={APP_VERSION}
              thoughtCount={countResult.rows[0]?.count || 0}
              brainUsers={usersResult.rows}
              flash={{ type: "error", message: `Parse error: ${(err as Error).message}` }}
            />
          ) as unknown as string
        );
      } finally {
        client.release();
      }
    }

    // Import thoughts — embedding and metadata extraction happen via API calls
    const EMBEDDING_API_BASE = Deno.env.get("EMBEDDING_API_BASE") || "https://openrouter.ai/api/v1";
    const EMBEDDING_API_KEY = Deno.env.get("EMBEDDING_API_KEY") || "";
    const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "openai/text-embedding-3-small";

    let imported = 0;
    let errors = 0;
    const client = await pool.connect();

    try {
      for (const thought of thoughts) {
        try {
          // Get embedding
          const embRes = await fetch(`${EMBEDDING_API_BASE}/embeddings`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${EMBEDDING_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: EMBEDDING_MODEL, input: thought.content }),
          });

          let embStr = null;
          if (embRes.ok) {
            const embData = await embRes.json();
            const embedding = embData.data[0].embedding;
            embStr = `[${embedding.join(",")}]`;
          }

          const meta = thought.metadata || { topics: ["imported"], type: "observation" };
          if (!meta.source) meta.source = `import:${filename}`;

          if (embStr) {
            await client.queryObject(
              `INSERT INTO thoughts (content, embedding, metadata, user_id)
               VALUES ($1, $2::vector, $3::jsonb, $4)`,
              [thought.content, embStr, JSON.stringify(meta), userId]
            );
          } else {
            await client.queryObject(
              `INSERT INTO thoughts (content, metadata, user_id)
               VALUES ($1, $2::jsonb, $3)`,
              [thought.content, JSON.stringify(meta), userId]
            );
          }

          imported++;

          // Brief delay to avoid rate limits
          if (imported % 10 === 0) {
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch {
          errors++;
        }
      }

      const countResult = await client.queryObject<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM thoughts"
      );
      const usersResult = await client.queryObject<{ id: number; name: string }>(
        "SELECT id, name FROM brain_users ORDER BY name"
      );

      return c.html(
        (
          <ImportExportPage
            user={user}
            notifications={notifs(c)} version={APP_VERSION}
            thoughtCount={countResult.rows[0]?.count || 0}
            brainUsers={usersResult.rows}
            flash={{
              type: errors > 0 ? "error" : "success",
              message: `Imported ${imported} thought(s) from "${filename}".${errors > 0 ? ` ${errors} failed.` : ""}`,
            }}
          />
        ) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  // --- Digests ---

  admin.get("/digests", async (c) => {
    const user = c.get("user") as string;
    const client = await pool.connect();

    try {
      const configsResult = await client.queryObject<{
        id: number;
        user_name: string;
        frequency: string;
        delivery: string;
        webhook_url: string;
        is_active: boolean;
        last_sent_at: string | null;
      }>(
        `SELECT dc.id, bu.name AS user_name, dc.frequency, dc.delivery,
                dc.webhook_url, dc.is_active, dc.last_sent_at
         FROM digest_configs dc
         JOIN brain_users bu ON bu.id = dc.user_id
         ORDER BY dc.created_at DESC`
      );

      const usersResult = await client.queryObject<{ id: number; name: string }>(
        "SELECT id, name FROM brain_users ORDER BY name"
      );

      return c.html(
        (
          <DigestsPage
            user={user}
            notifications={notifs(c)} version={APP_VERSION}
            configs={configsResult.rows}
            brainUsers={usersResult.rows}
          />
        ) as unknown as string
      );
    } finally {
      client.release();
    }
  });

  admin.post("/digests", async (c) => {
    const body = await c.req.parseBody();
    const userId = parseInt(String(body.user_id), 10);
    const frequency = String(body.frequency || "daily");
    const webhookUrl = String(body.webhook_url || "").trim();

    if (!webhookUrl) {
      return c.redirect("/admin/digests");
    }

    const client = await pool.connect();
    try {
      await client.queryObject(
        `INSERT INTO digest_configs (user_id, frequency, delivery, webhook_url)
         VALUES ($1, $2, 'webhook', $3)`,
        [userId, frequency, webhookUrl]
      );
    } finally {
      client.release();
    }

    return c.redirect("/admin/digests");
  });

  admin.post("/digests/toggle", async (c) => {
    const body = await c.req.parseBody();
    const configId = parseInt(String(body.config_id), 10);
    const isActive = body.is_active === "true";

    const client = await pool.connect();
    try {
      await client.queryObject(
        "UPDATE digest_configs SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [isActive, configId]
      );
    } finally {
      client.release();
    }

    return c.redirect("/admin/digests");
  });

  admin.post("/digests/delete", async (c) => {
    const body = await c.req.parseBody();
    const configId = parseInt(String(body.config_id), 10);

    const client = await pool.connect();
    try {
      await client.queryObject("DELETE FROM digest_configs WHERE id = $1", [configId]);
    } finally {
      client.release();
    }

    return c.redirect("/admin/digests");
  });

  // --- AI Costs ---

  admin.get("/usage", async (c) => {
    const user = c.get("user") as string;
    const filterDays = parseInt(c.req.query("days") || "30", 10);
    const filterUser = c.req.query("user_id") || "";

    const usageOpts: { userId?: number | null; days?: number } = {};
    if (filterDays > 0) usageOpts.days = filterDays;
    if (filterUser === "null") {
      usageOpts.userId = null;
    } else if (filterUser) {
      usageOpts.userId = parseInt(filterUser, 10);
    }

    const summary = await getUsageSummary(pool, usageOpts);
    const client = await pool.connect();
    let brainUsers: { id: number; name: string }[] = [];
    try {
      const usersResult = await client.queryObject<{ id: number; name: string }>(
        "SELECT id, name FROM brain_users ORDER BY name"
      );
      brainUsers = usersResult.rows;
    } finally {
      client.release();
    }

    return c.html(
      (
        <UsagePage
          user={user}
          notifications={notifs(c)} version={APP_VERSION}
          summary={summary}
          filterDays={filterDays}
          brainUsers={brainUsers}
          filterUser={filterUser}
        />
      ) as unknown as string
    );
  });

  // --- Backups ---

  admin.get("/backups", async (c) => {
    const user = c.get("user") as string;
    const env = await readEnvFile();

    // List backup files via Docker exec on db-backup container
    let localBackups: { name: string; size: string; date: string }[] = [];
    const cloudBackupNames = new Set<string>();
    let recentLogs = "";
    const isCloudConfigured = !!(env.RCLONE_REMOTE);

    try {
      const containersRes = await fetch(`${DOCKER_API}/containers/json?all=true`);
      if (containersRes.ok) {
        const containers = await containersRes.json();
        const backupContainer = containers.find(
          (ct: Record<string, unknown>) =>
            (ct.Labels as Record<string, string>)?.["com.docker.compose.service"] === "db-backup"
        );

        if (backupContainer) {
          // Helper: exec a command in the backup container and return stdout
          const execInBackup = async (cmd: string[]): Promise<string> => {
            const createRes = await fetch(
              `${DOCKER_API}/containers/${backupContainer.Id}/exec`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  AttachStdout: true,
                  AttachStderr: true,
                  Cmd: cmd,
                }),
              }
            );
            if (!createRes.ok) return "";
            const execData = await createRes.json();
            const startRes = await fetch(
              `${DOCKER_API}/exec/${execData.Id}/start`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Detach: false }),
              }
            );
            if (!startRes.ok) return "";
            const raw = new Uint8Array(await startRes.arrayBuffer());
            return stripDockerLogHeaders(raw).trim();
          };

          // List local backups
          const localOutput = await execInBackup(
            ["sh", "-c", "ls -lht /backups/localbrain_*.sql.gz* 2>/dev/null || echo 'none'"]
          );

          if (localOutput && localOutput !== "none") {
            localBackups = localOutput.split("\n").filter(Boolean).map((line) => {
              const parts = line.trim().split(/\s+/);
              const name = parts[parts.length - 1]?.split("/").pop() || "";
              const size = parts[4] || "?";
              const match = name.match(/localbrain_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
              const date = match
                ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`
                : "?";
              return { name, size, date };
            });
          }

          // List cloud backups if configured
          if (isCloudConfigured) {
            const cloudOutput = await execInBackup(
              ["sh", "-c", `rclone ls "$RCLONE_REMOTE" 2>/dev/null | grep localbrain_ || echo 'none'`]
            );

            if (cloudOutput && cloudOutput !== "none") {
              for (const line of cloudOutput.split("\n").filter(Boolean)) {
                // rclone ls format: "  12345 filename"
                const name = line.trim().split(/\s+/)[1] || "";
                if (name) cloudBackupNames.add(name);
              }
            }
          }
        }
      }

      // Get recent logs
      recentLogs = await getServiceLogs("db-backup", 50);
    } catch {
      // Docker not available — show empty state
    }

    return c.html(
      (
        <BackupsPage
          user={user}
          notifications={notifs(c)} version={APP_VERSION}
          localBackups={localBackups}
          cloudBackupNames={[...cloudBackupNames]}
          cloudConfigured={isCloudConfigured}
          encryptionEnabled={!!(env.BACKUP_ENCRYPTION_KEY)}
          cronSchedule={env.BACKUP_CRON || "0 3 * * *"}
          retainCount={parseInt(env.BACKUP_RETAIN_COUNT || "7", 10)}
          cloudRetainCount={parseInt(env.BACKUP_CLOUD_RETAIN_COUNT || "30", 10)}
          rcloneRemote={env.RCLONE_REMOTE || ""}
          recentLogs={recentLogs}
        />
      ) as unknown as string
    );
  });

  admin.post("/backups/run", async (c) => {
    // Trigger a manual backup by exec-ing into the db-backup container
    try {
      const containersRes = await fetch(`${DOCKER_API}/containers/json?all=true`);
      if (containersRes.ok) {
        const containers = await containersRes.json();
        const backupContainer = containers.find(
          (ct: Record<string, unknown>) =>
            (ct.Labels as Record<string, string>)?.["com.docker.compose.service"] === "db-backup"
        );

        if (backupContainer) {
          const execCreateRes = await fetch(
            `${DOCKER_API}/containers/${backupContainer.Id}/exec`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                AttachStdout: true,
                AttachStderr: true,
                Cmd: ["/usr/local/bin/backup.sh"],
              }),
            }
          );

          if (execCreateRes.ok) {
            const execData = await execCreateRes.json();
            // Start exec but don't wait for full output — redirect immediately
            fetch(`${DOCKER_API}/exec/${execData.Id}/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ Detach: true }),
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Best effort
    }

    // Small delay to let the backup start, then redirect with flash
    await new Promise((r) => setTimeout(r, 500));
    return c.redirect("/admin/backups");
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
      (<ConfigPage user={user} notifications={notifs(c)} version={APP_VERSION} config={config} />) as unknown as string
    );
  });

  admin.post("/config", async (c) => {
    const user = c.get("user") as string;
    const body = await c.req.parseBody();
    const restartMcp = body._restart === "1";
    const restartBackup = body._restart_backup === "1";

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

    const restarted: string[] = [];
    if (restartMcp) {
      await restartService("mcp-server");
      restarted.push("MCP server");
    }
    if (restartBackup) {
      await restartService("db-backup");
      restarted.push("backup service");
    }

    const env = await readEnvFile();
    const config = CONFIG_SCHEMA.map((entry) => ({
      key: entry.key,
      value: env[entry.key] || "",
      masked: entry.secret,
      section: entry.section,
    }));

    let flashMessage = "Configuration saved.";
    if (restarted.length > 0) {
      flashMessage = `Configuration saved. Restarting: ${restarted.join(", ")}.`;
    }

    return c.html(
      (
        <ConfigPage
          user={user}
          notifications={notifs(c)} version={APP_VERSION}
          config={config}
          flash={{
            type: "success",
            message: flashMessage,
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
          notifications={notifs(c)} version={APP_VERSION}
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
