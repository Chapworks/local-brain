/**
 * Local Brain MCP Server
 *
 * Based on OB1 (Open Brain) by Nate B. Jones — https://github.com/NateBJones-Projects/OB1
 * Licensed under FSL-1.1-MIT (see LICENSE.md)
 *
 * This is a modified version of the OB1 server that connects directly to
 * PostgreSQL + pgvector instead of Supabase. All MCP tools and the Hono
 * HTTP layer are preserved; only the data access layer is changed.
 *
 * Environment variables:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD - PostgreSQL connection
 *   EMBEDDING_API_BASE - Base URL for OpenAI-compatible embedding API
 *   EMBEDDING_API_KEY - API key for the embedding service
 *   EMBEDDING_MODEL - Model name for embeddings (default: text-embedding-3-small)
 *   CHAT_API_BASE - Base URL for OpenAI-compatible chat API (defaults to EMBEDDING_API_BASE)
 *   CHAT_API_KEY - API key for chat service (defaults to EMBEDDING_API_KEY)
 *   CHAT_MODEL - Model name for metadata extraction (default: gpt-4o-mini)
 *   CHAT_API_FORMAT - "openai" or "anthropic"
 *   MCP_ACCESS_KEY - Global authentication key for MCP endpoint (legacy/fallback)
 *   ADMIN_JWT_SECRET - Secret for signing admin session JWTs
 *   ADMIN_ACCESS_MODE - "local" (default) or "remote"
 *   DOCKER_API_URL - Docker socket proxy URL for admin panel
 *   DIGEST_TIMEZONE - Timezone for digest scheduling (default: UTC)
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { Pool } from "postgres";
import * as bcrypt from "bcrypt";
import { createAdminApp } from "./admin/mod.ts";
import { processDigests } from "./digest.ts";
import { checkBackupHealth, getActiveNotifications, getMeta, recordExport } from "./notifications.ts";
import {
  extractOpenAIUsage,
  extractAnthropicUsage,
  logUsage,
} from "./usage.ts";
import { userScope } from "./user-scope.ts";
import type { ResolvedUser } from "./user-scope.ts";

// --- Per-request user context (CR-01 fix: replaces unsafe global) ---
const requestContext = new AsyncLocalStorage<{ user: ResolvedUser | null }>();

/** Get the current request's user. Safe under concurrent requests. */
function getCurrentUser(): ResolvedUser | null {
  return requestContext.getStore()?.user ?? null;
}

// --- Version ---

const VERSION = await Deno.readTextFile(
  new URL("./VERSION", import.meta.url).pathname
).catch(() =>
  Deno.readTextFile(new URL("../VERSION", import.meta.url).pathname)
).then((v) => v.trim()).catch(() => "unknown");

// --- Configuration ---

const DB_HOST = Deno.env.get("DB_HOST") || "127.0.0.1";
const DB_PORT = parseInt(Deno.env.get("DB_PORT") || "5432", 10);
const DB_NAME = Deno.env.get("DB_NAME") || "openbrain";
const DB_USER = Deno.env.get("DB_USER") || "postgres";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD")!;

const EMBEDDING_API_BASE = Deno.env.get("EMBEDDING_API_BASE") || "https://openrouter.ai/api/v1";
const EMBEDDING_API_KEY = Deno.env.get("EMBEDDING_API_KEY") || Deno.env.get("OPENROUTER_API_KEY") || "";
const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "openai/text-embedding-3-small";

const CHAT_API_BASE = Deno.env.get("CHAT_API_BASE") || EMBEDDING_API_BASE;
const CHAT_API_KEY = Deno.env.get("CHAT_API_KEY") || EMBEDDING_API_KEY;
const CHAT_MODEL = Deno.env.get("CHAT_MODEL") || "openai/gpt-4o-mini";
const CHAT_API_FORMAT = Deno.env.get("CHAT_API_FORMAT") || "openai"; // "openai" or "anthropic"

const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY") || "";

const TOP_N_LINKS = 3;
const MIN_LINK_SIMILARITY = 0.3;

// --- PostgreSQL Connection Pool ---

const pool = new Pool({
  hostname: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
}, 20);

// --- User Resolution ---

// Cache resolved users to avoid bcrypt on every request
const userCache = new Map<string, { user: ResolvedUser; expiresAt: number }>();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Result of resolving an MCP access key. (CR-02 fix: discriminated union) */
type ResolveResult =
  | { kind: "user"; user: ResolvedUser }
  | { kind: "global" }
  | { kind: "invalid" };

/**
 * Resolve an MCP access key to a brain user.
 * Falls back to the global MCP_ACCESS_KEY for backward compatibility.
 */
async function resolveUser(key: string): Promise<ResolveResult> {
  // Check cache first
  const cached = userCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { kind: "user", user: cached.user };
  }

  // Check global key (backward compat — no user scoping)
  if (MCP_ACCESS_KEY && key === MCP_ACCESS_KEY) {
    return { kind: "global" };
  }

  // Look up by key prefix (first 8 chars) — check both primary and secondary keys
  const prefix = key.slice(0, 8);
  const client = await pool.connect();
  try {
    const result = await client.queryObject<{
      id: number;
      name: string;
      mcp_key_hash: string;
      secondary_key_hash: string | null;
    }>(
      `SELECT id, name, mcp_key_hash, secondary_key_hash FROM brain_users
       WHERE (key_prefix = $1 OR secondary_key_prefix = $1) AND is_active = TRUE`,
      [prefix]
    );

    for (const row of result.rows) {
      // Check primary key
      const validPrimary = await bcrypt.compare(key, row.mcp_key_hash);
      if (validPrimary) {
        const user = { id: row.id, name: row.name };
        userCache.set(key, { user, expiresAt: Date.now() + USER_CACHE_TTL });
        return { kind: "user", user };
      }
      // Check secondary key (for rotation)
      if (row.secondary_key_hash) {
        const validSecondary = await bcrypt.compare(key, row.secondary_key_hash);
        if (validSecondary) {
          const user = { id: row.id, name: row.name };
          userCache.set(key, { user, expiresAt: Date.now() + USER_CACHE_TTL });
          return { kind: "user", user };
        }
      }
    }
  } finally {
    client.release();
  }

  return { kind: "invalid" };
}

/**
 * Authenticate an MCP request. Returns the resolved user (or null for global key).
 * Throws if the key is invalid.
 */
async function authenticateRequest(key: string): Promise<ResolvedUser | null> {
  const result = await resolveUser(key);
  switch (result.kind) {
    case "user": return result.user;
    case "global": return null;
    case "invalid": throw new Error("Invalid access key");
  }
}

// --- Embedding & Metadata Extraction ---

async function getEmbedding(text: string, operation = "embedding"): Promise<number[]> {
  const r = await fetch(`${EMBEDDING_API_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`Embedding API failed: ${r.status} ${msg}`);
  }
  const d = await r.json();

  // Track usage
  const usage = extractOpenAIUsage(d, EMBEDDING_MODEL, operation);
  if (usage) {
    logUsage(pool, { ...usage, userId: getCurrentUser()?.id || null }).catch(() => {});
  }

  return d.data[0].embedding;
}

const METADATA_SYSTEM_PROMPT = `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.`;

async function extractMetadataOpenAI(text: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${CHAT_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CHAT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: METADATA_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });
  const d = await r.json();

  // Track usage
  const usage = extractOpenAIUsage(d, CHAT_MODEL, "metadata");
  if (usage) {
    logUsage(pool, { ...usage, userId: getCurrentUser()?.id || null }).catch(() => {});
  }

  return JSON.parse(d.choices[0].message.content);
}

async function extractMetadataAnthropic(text: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${CHAT_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": CHAT_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: METADATA_SYSTEM_PROMPT + "\nRespond with only valid JSON, no other text.",
      messages: [
        { role: "user", content: text },
      ],
    }),
  });
  const d = await r.json();

  // Track usage
  const usage = extractAnthropicUsage(d, CHAT_MODEL, "metadata");
  if (usage) {
    logUsage(pool, { ...usage, userId: getCurrentUser()?.id || null }).catch(() => {});
  }

  return JSON.parse(d.content[0].text);
}

async function extractMetadata(text: string): Promise<Record<string, unknown>> {
  try {
    if (CHAT_API_FORMAT === "anthropic") {
      return await extractMetadataAnthropic(text);
    }
    return await extractMetadataOpenAI(text);
  } catch {
    return { topics: ["uncategorized"], type: "observation" };
  }
}

// --- Thought Linking ---

/** After capturing a thought, link it to its top-N most similar existing thoughts. */
async function createThoughtLinks(
  thoughtId: number,
  embedding: number[],
  userId: number | null
): Promise<{ id: number; content: string; similarity: number }[]> {
  const client = await pool.connect();
  const embStr = `[${embedding.join(",")}]`;

  try {
    const userClause = userId ? `AND t.user_id = $4` : `AND t.user_id IS NULL`;
    const params: unknown[] = [thoughtId, embStr, MIN_LINK_SIMILARITY];
    if (userId) params.push(userId);

    const result = await client.queryObject<{
      id: number;
      content: string;
      similarity: number;
    }>(
      `SELECT t.id, t.content,
              1 - (t.embedding <=> $2::vector) AS similarity
       FROM thoughts t
       WHERE t.id != $1
         AND t.embedding IS NOT NULL
         AND t.archived = FALSE
         ${userClause}
         AND 1 - (t.embedding <=> $2::vector) >= $3
       ORDER BY t.embedding <=> $2::vector
       LIMIT ${TOP_N_LINKS}`,
      params
    );

    const links = result.rows;

    for (const link of links) {
      await client.queryObject(
        `INSERT INTO thought_links (source_id, target_id, similarity)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, target_id) DO NOTHING`,
        [thoughtId, link.id, link.similarity]
      );
    }

    return links;
  } finally {
    client.release();
  }
}

// --- MCP Server Setup ---

const server = new McpServer({
  name: "local-brain",
  version: VERSION,
});

// Tool 1: Semantic Search
server.registerTool(
  "search_thoughts",
  {
    title: "Search Thoughts",
    description:
      "Search captured thoughts by meaning. Use this when the user asks about a topic, person, or idea they've previously captured.",
    inputSchema: {
      query: z.string().max(10000).describe("What to search for"),
      limit: z.number().optional().default(10),
      threshold: z.number().optional().default(0.5),
      include_archived: z.boolean().optional().default(false).describe("Include archived thoughts in results"),
    },
  },
  async ({ query, limit, threshold, include_archived }) => {
    try {
      const qEmb = await getEmbedding(query, "embedding:search");
      const embStr = `[${qEmb.join(",")}]`;

      const client = await pool.connect();
      try {
        const conditions = ["1 - (embedding <=> $1::vector) >= $2"];
        const params: unknown[] = [embStr, threshold];
        let paramIdx = 3;

        if (!include_archived) {
          conditions.push("archived = FALSE");
        }

        const scope = userScope(getCurrentUser(), paramIdx);
        if (scope.params.length > 0) {
          conditions.push(scope.clause);
          params.push(...scope.params);
          paramIdx += scope.params.length;
        } else {
          conditions.push(scope.clause);
        }

        const result = await client.queryObject<{
          id: number;
          content: string;
          metadata: Record<string, unknown>;
          similarity: number;
          created_at: string;
          archived: boolean;
        }>(
          `SELECT id, content, metadata, created_at, archived,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM thoughts
           WHERE ${conditions.join(" AND ")}
           ORDER BY embedding <=> $1::vector
           LIMIT $${paramIdx}`,
          [...params, limit]
        );

        if (!result.rows.length) {
          return {
            content: [{ type: "text" as const, text: `No thoughts found matching "${query}".` }],
          };
        }

        const results = result.rows.map((t, i) => {
          const m = t.metadata || {};
          const parts = [
            `--- Result ${i + 1} (${(t.similarity * 100).toFixed(1)}% match) ---`,
            `ID: ${t.id}`,
            `Captured: ${new Date(t.created_at).toLocaleDateString()}`,
            `Type: ${m.type || "unknown"}`,
          ];
          if (t.archived) parts.push(`Status: archived`);
          if (Array.isArray(m.topics) && m.topics.length)
            parts.push(`Topics: ${(m.topics as string[]).join(", ")}`);
          if (Array.isArray(m.people) && m.people.length)
            parts.push(`People: ${(m.people as string[]).join(", ")}`);
          if (Array.isArray(m.action_items) && m.action_items.length)
            parts.push(`Actions: ${(m.action_items as string[]).join("; ")}`);
          parts.push(`\n${t.content}`);
          return parts.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${result.rows.length} thought(s):\n\n${results.join("\n\n")}`,
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 2: List Recent
server.registerTool(
  "list_thoughts",
  {
    title: "List Recent Thoughts",
    description:
      "List recently captured thoughts with optional filters by type, topic, person, or time range.",
    inputSchema: {
      limit: z.number().optional().default(10),
      type: z.string().optional().describe("Filter by type: observation, task, idea, reference, person_note"),
      topic: z.string().optional().describe("Filter by topic tag"),
      person: z.string().optional().describe("Filter by person mentioned"),
      days: z.number().optional().describe("Only thoughts from the last N days"),
      include_archived: z.boolean().optional().default(false).describe("Include archived thoughts"),
    },
  },
  async ({ limit, type, topic, person, days, include_archived }) => {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (!include_archived) {
        conditions.push("archived = FALSE");
      }

      const scope = userScope(getCurrentUser(), paramIdx);
      if (scope.params.length > 0) {
        conditions.push(scope.clause);
        params.push(...scope.params);
        paramIdx += scope.params.length;
      } else {
        conditions.push(scope.clause);
      }

      if (type) {
        conditions.push(`metadata->>'type' = $${paramIdx}`);
        params.push(type);
        paramIdx++;
      }
      if (topic) {
        conditions.push(`metadata->'topics' ? $${paramIdx}`);
        params.push(topic);
        paramIdx++;
      }
      if (person) {
        conditions.push(`metadata->'people' ? $${paramIdx}`);
        params.push(person);
        paramIdx++;
      }
      if (days) {
        conditions.push(`created_at >= NOW() - make_interval(days => $${paramIdx})`);
        params.push(days);
        paramIdx++;
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const client = await pool.connect();
      try {
        const result = await client.queryObject<{
          id: number;
          content: string;
          metadata: Record<string, unknown>;
          created_at: string;
          archived: boolean;
          expires_at: string | null;
        }>(
          `SELECT id, content, metadata, created_at, archived, expires_at
           FROM thoughts
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIdx}`,
          [...params, limit]
        );

        if (!result.rows.length) {
          return { content: [{ type: "text" as const, text: "No thoughts found." }] };
        }

        const results = result.rows.map((t, i) => {
          const m = t.metadata || {};
          const tags = Array.isArray(m.topics) ? (m.topics as string[]).join(", ") : "";
          let line = `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${m.type || "??"}${tags ? " - " + tags : ""})`;
          if (t.archived) line += " [archived]";
          if (t.expires_at) line += ` [expires: ${new Date(t.expires_at).toLocaleDateString()}]`;
          line += `\n   ${t.content}`;
          return line;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${result.rows.length} recent thought(s):\n\n${results.join("\n\n")}`,
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: Stats
server.registerTool(
  "thought_stats",
  {
    title: "Thought Statistics",
    description: "Get a summary of all captured thoughts: totals, types, top topics, and people.",
    inputSchema: {},
  },
  async () => {
    try {
      const client = await pool.connect();
      try {
        const scope = userScope(getCurrentUser(), 1);
        const whereActive = `WHERE archived = FALSE AND ${scope.clause}`;
        const whereAll = `WHERE ${scope.clause}`;

        const countResult = await client.queryObject<{ count: number; archived_count: number }>(
          `SELECT
            COUNT(*) FILTER (WHERE archived = FALSE)::int AS count,
            COUNT(*) FILTER (WHERE archived = TRUE)::int AS archived_count
           FROM thoughts ${whereAll}`,
          scope.params
        );

        const dataResult = await client.queryObject<{
          metadata: Record<string, unknown>;
          created_at: string;
        }>(
          `SELECT metadata, created_at FROM thoughts ${whereActive} ORDER BY created_at DESC`,
          scope.params
        );

        const count = countResult.rows[0]?.count || 0;
        const archivedCount = countResult.rows[0]?.archived_count || 0;
        const data = dataResult.rows;

        const types: Record<string, number> = {};
        const topics: Record<string, number> = {};
        const people: Record<string, number> = {};

        for (const r of data) {
          const m = r.metadata || {};
          if (m.type) types[m.type as string] = (types[m.type as string] || 0) + 1;
          if (Array.isArray(m.topics))
            for (const t of m.topics) topics[t as string] = (topics[t as string] || 0) + 1;
          if (Array.isArray(m.people))
            for (const p of m.people) people[p as string] = (people[p as string] || 0) + 1;
        }

        const sort = (o: Record<string, number>): [string, number][] =>
          Object.entries(o)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const lines: string[] = [
          `Active thoughts: ${count}`,
          `Archived thoughts: ${archivedCount}`,
          `Date range: ${
            data.length
              ? new Date(data[data.length - 1].created_at).toLocaleDateString() +
                " -> " +
                new Date(data[0].created_at).toLocaleDateString()
              : "N/A"
          }`,
          "",
          "Types:",
          ...sort(types).map(([k, v]) => `  ${k}: ${v}`),
        ];

        if (Object.keys(topics).length) {
          lines.push("", "Top topics:");
          for (const [k, v] of sort(topics)) lines.push(`  ${k}: ${v}`);
        }

        if (Object.keys(people).length) {
          lines.push("", "People mentioned:");
          for (const [k, v] of sort(people)) lines.push(`  ${k}: ${v}`);
        }

        // Connection stats
        const userLinkClause = getCurrentUser()
          ? `WHERE t.user_id = $1`
          : `WHERE t.user_id IS NULL`;
        const linkResult = await client.queryObject<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM thought_links tl
           JOIN thoughts t ON tl.source_id = t.id
           ${userLinkClause}`,
          scope.params
        );
        if (linkResult.rows[0]?.count > 0) {
          lines.push("", `Thought connections: ${linkResult.rows[0].count}`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 4: Capture Thought
server.registerTool(
  "capture_thought",
  {
    title: "Capture Thought",
    description:
      "Save a new thought to Local Brain. Generates an embedding, extracts metadata, and links to related thoughts automatically.",
    inputSchema: {
      content: z.string().max(50000).describe("The thought to capture"),
      expires_in_days: z.number().int().min(1).max(3650).optional().describe("Auto-archive after this many days (null = never)"),
    },
  },
  async ({ content, expires_in_days }) => {
    try {
      const [embedding, metadata] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content),
      ]);

      const embStr = `[${embedding.join(",")}]`;
      const meta = { ...metadata, source: "mcp" };

      const client = await pool.connect();
      let thoughtId: number;
      try {
        const insertParams: unknown[] = [content, embStr, JSON.stringify(meta), getCurrentUser()?.id || null];
        let insertSql: string;
        if (expires_in_days) {
          insertSql = `INSERT INTO thoughts (content, embedding, metadata, user_id, expires_at)
           VALUES ($1, $2::vector, $3::jsonb, $4, NOW() + make_interval(days => $5))
           RETURNING id`;
          insertParams.push(expires_in_days);
        } else {
          insertSql = `INSERT INTO thoughts (content, embedding, metadata, user_id)
           VALUES ($1, $2::vector, $3::jsonb, $4)
           RETURNING id`;
        }

        const insertResult = await client.queryObject<{ id: number }>(insertSql, insertParams);
        thoughtId = insertResult.rows[0].id;
      } finally {
        client.release();
      }

      // Generate thought links (async, don't block response)
      const links = await createThoughtLinks(
        thoughtId,
        embedding,
        getCurrentUser()?.id || null
      );

      let confirmation = `Captured as ${meta.type || "thought"} (ID: ${thoughtId})`;
      if (Array.isArray(meta.topics) && meta.topics.length)
        confirmation += ` -- ${(meta.topics as string[]).join(", ")}`;
      if (Array.isArray(meta.people) && meta.people.length)
        confirmation += ` | People: ${(meta.people as string[]).join(", ")}`;
      if (Array.isArray(meta.action_items) && meta.action_items.length)
        confirmation += ` | Actions: ${(meta.action_items as string[]).join("; ")}`;
      if (expires_in_days)
        confirmation += ` | Expires in ${expires_in_days} days`;

      if (links.length > 0) {
        confirmation += `\n\nRelated thoughts:`;
        for (const link of links) {
          confirmation += `\n  - (${(link.similarity * 100).toFixed(0)}%) ${link.content.slice(0, 100)}${link.content.length > 100 ? "..." : ""}`;
        }
      }

      return {
        content: [{ type: "text" as const, text: confirmation }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 5: Get Thought Connections
server.registerTool(
  "get_thought_connections",
  {
    title: "Get Thought Connections",
    description:
      "Get connections between thoughts — find what's related to a specific thought, or get the full connection graph.",
    inputSchema: {
      thought_id: z.number().optional().describe("Get connections for a specific thought ID"),
      limit: z.number().optional().default(50).describe("Max connections to return"),
    },
  },
  async ({ thought_id, limit }) => {
    try {
      const client = await pool.connect();
      try {
        // Build user filter clause
        const _user = getCurrentUser();
        const userClause = _user
          ? `ts.user_id = $1`
          : `ts.user_id IS NULL`;
        const baseParams: unknown[] = _user ? [_user.id] : [];
        const pOff = baseParams.length; // parameter offset

        if (thought_id) {
          const result = await client.queryObject<{
            target_id: number;
            target_content: string;
            similarity: number;
          }>(
            `SELECT tl.target_id, t.content AS target_content, tl.similarity
             FROM thought_links tl
             JOIN thoughts t ON t.id = tl.target_id
             JOIN thoughts ts ON ts.id = tl.source_id
             WHERE tl.source_id = $${pOff + 1}
               AND ${userClause}
             ORDER BY tl.similarity DESC
             LIMIT $${pOff + 2}`,
            [...baseParams, thought_id, limit]
          );

          if (!result.rows.length) {
            return {
              content: [{ type: "text" as const, text: `No connections found for thought #${thought_id}.` }],
            };
          }

          const lines = result.rows.map((r) =>
            `  #${r.target_id} (${(r.similarity * 100).toFixed(0)}%) — ${r.target_content.slice(0, 120)}${r.target_content.length > 120 ? "..." : ""}`
          );

          return {
            content: [{
              type: "text" as const,
              text: `Connections for thought #${thought_id}:\n\n${lines.join("\n")}`,
            }],
          };
        }

        // Full graph — return top connections
        const result = await client.queryObject<{
          source_id: number;
          target_id: number;
          similarity: number;
          source_content: string;
          target_content: string;
        }>(
          `SELECT tl.source_id, tl.target_id, tl.similarity,
                  ts.content AS source_content, tt.content AS target_content
           FROM thought_links tl
           JOIN thoughts ts ON ts.id = tl.source_id
           JOIN thoughts tt ON tt.id = tl.target_id
           WHERE ${userClause}
           ORDER BY tl.similarity DESC
           LIMIT $${pOff + 1}`,
          [...baseParams, limit]
        );

        if (!result.rows.length) {
          return {
            content: [{ type: "text" as const, text: "No thought connections yet." }],
          };
        }

        const lines = result.rows.map((r) =>
          `#${r.source_id} ↔ #${r.target_id} (${(r.similarity * 100).toFixed(0)}%)\n  "${r.source_content.slice(0, 80)}..." ↔ "${r.target_content.slice(0, 80)}..."`
        );

        return {
          content: [{
            type: "text" as const,
            text: `Top ${result.rows.length} thought connections:\n\n${lines.join("\n\n")}`,
          }],
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 6: Export Thoughts
server.registerTool(
  "export_thoughts",
  {
    title: "Export Thoughts",
    description:
      "Export all thoughts as JSON. Useful for backup or migration.",
    inputSchema: {
      format: z.enum(["json", "markdown"]).optional().default("json"),
      include_archived: z.boolean().optional().default(false),
    },
  },
  async ({ format, include_archived }) => {
    try {
      const client = await pool.connect();
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (!include_archived) {
          conditions.push("archived = FALSE");
        }

        const scope = userScope(getCurrentUser(), paramIdx);
        if (scope.params.length > 0) {
          conditions.push(scope.clause);
          params.push(...scope.params);
          paramIdx += scope.params.length;
        } else {
          conditions.push(scope.clause);
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
          `SELECT id, content, metadata, created_at, archived, expires_at
           FROM thoughts ${where}
           ORDER BY created_at DESC`,
          params
        );

        // Track export for anti-lock-in reminders
        recordExport(pool).catch(() => {});

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

          return {
            content: [{
              type: "text" as const,
              text: `# Local Brain Export\n\n${result.rows.length} thoughts exported.\n\n${lines.join("\n---\n\n")}`,
            }],
          };
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

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(exported, null, 2),
          }],
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 7: Archive/Unarchive Thought
server.registerTool(
  "archive_thought",
  {
    title: "Archive or Unarchive Thought",
    description:
      "Archive a thought (hide from search/list) or unarchive it. Archived thoughts are not deleted.",
    inputSchema: {
      thought_id: z.number().describe("The thought ID to archive or unarchive"),
      unarchive: z.boolean().optional().default(false).describe("Set to true to unarchive"),
    },
  },
  async ({ thought_id, unarchive }) => {
    try {
      const client = await pool.connect();
      try {
        const scope = userScope(getCurrentUser(), 2);

        const result = await client.queryObject(
          `UPDATE thoughts
           SET archived = $1,
               archived_at = ${unarchive ? "NULL" : "CURRENT_TIMESTAMP"}
           WHERE id = $2 AND ${scope.clause}`,
          [!unarchive, thought_id, ...scope.params]
        );

        const affected = (result as unknown as { rowCount: number }).rowCount;
        if (affected === 0) {
          return {
            content: [{ type: "text" as const, text: `Thought #${thought_id} not found or not owned by you.` }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: unarchive
              ? `Thought #${thought_id} unarchived.`
              : `Thought #${thought_id} archived.`,
          }],
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 8: Usage Stats
server.registerTool(
  "usage_stats",
  {
    title: "AI Usage Statistics",
    description:
      "Get AI API usage and cost statistics. Shows token counts, costs by operation and model.",
    inputSchema: {
      days: z.number().optional().default(30).describe("Look back this many days (0 = all time)"),
    },
  },
  async ({ days }) => {
    try {
      const { getUsageSummary } = await import("./usage.ts");
      const summary = await getUsageSummary(pool, {
        userId: getCurrentUser()?.id,
        days: days || undefined,
      });

      const lines: string[] = [
        `AI Usage — ${days > 0 ? `last ${days} days` : "all time"}`,
        "",
        `Total cost: $${summary.totalCost.toFixed(4)}`,
        `Total API calls: ${summary.totalRequests}`,
        `Prompt tokens: ${summary.totalPromptTokens.toLocaleString()}`,
        `Completion tokens: ${summary.totalCompletionTokens.toLocaleString()}`,
      ];

      if (summary.byOperation.length > 0) {
        lines.push("", "By operation:");
        for (const { operation, requests, cost } of summary.byOperation) {
          lines.push(`  ${operation}: ${requests} calls, $${cost.toFixed(4)}`);
        }
      }

      if (summary.byModel.length > 0) {
        lines.push("", "By model:");
        for (const { model, requests, cost } of summary.byModel) {
          lines.push(`  ${model}: ${requests} calls, $${cost.toFixed(4)}`);
        }
      }

      if (summary.byDay.length > 0) {
        lines.push("", "Recent days:");
        for (const { day, requests, cost } of summary.byDay.slice(0, 7)) {
          lines.push(`  ${day}: ${requests} calls, $${cost.toFixed(4)}`);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 9: System Health
server.registerTool(
  "system_health",
  {
    title: "System Health",
    description:
      "Check the health of the Local Brain system. Returns version, database stats, backup status, active problems, and configuration summary. Use this to monitor the system over time.",
    inputSchema: {},
  },
  async () => {
    try {
      const client = await pool.connect();
      try {
        // --- Core stats ---
        const countResult = await client.queryObject<{
          active: number;
          archived: number;
        }>(
          `SELECT
            COUNT(*) FILTER (WHERE archived = FALSE)::int AS active,
            COUNT(*) FILTER (WHERE archived = TRUE)::int AS archived
           FROM thoughts`
        );
        const usersResult = await client.queryObject<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM brain_users WHERE is_active = TRUE"
        );
        const linksResult = await client.queryObject<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM thought_links"
        );

        // --- Database size ---
        const sizeResult = await client.queryObject<{ size: string }>(
          `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
        );

        // --- Last backup date ---
        // We check the most recent backup file name in the backups volume by
        // looking at the cron schedule env var and any notifications.
        const backupCron = Deno.env.get("BACKUP_CRON") || "not configured";
        const encryptionEnabled = !!Deno.env.get("BACKUP_ENCRYPTION_KEY");
        const cloudConfigured = !!Deno.env.get("RCLONE_REMOTE");
        const rcloneRemote = Deno.env.get("RCLONE_REMOTE") || "none";

        // --- Active notifications (problems) ---
        const notifications = await getActiveNotifications(pool);
        const errors = notifications.filter((n) => n.level === "error");
        const warnings = notifications.filter((n) => n.level === "warning");
        const infos = notifications.filter((n) => n.level === "info");

        // --- Version check ---
        let latestVersion = "";
        try {
          const res = await fetch(
            "https://api.github.com/repos/Chapworks/local-brain/releases/latest",
            { headers: { "User-Agent": "local-brain" } }
          );
          if (res.ok) {
            const data = await res.json();
            latestVersion = (data.tag_name || "").replace(/^v/, "");
          }
        } catch {
          // GitHub unreachable — skip version check
        }

        // --- Build output ---
        const lines: string[] = [
          `Local Brain v${VERSION}`,
        ];

        if (latestVersion && latestVersion !== VERSION) {
          lines.push(`UPDATE AVAILABLE: v${latestVersion} (run ./scripts/update.sh)`);
        } else if (latestVersion) {
          lines.push(`Up to date.`);
        }

        lines.push(
          "",
          "=== Database ===",
          `Active thoughts: ${countResult.rows[0]?.active || 0}`,
          `Archived thoughts: ${countResult.rows[0]?.archived || 0}`,
          `Thought connections: ${linksResult.rows[0]?.count || 0}`,
          `Brain users: ${usersResult.rows[0]?.count || 0}`,
          `Database size: ${sizeResult.rows[0]?.size || "unknown"}`,
        );

        // --- Backup verification and export tracking ---
        const lastVerify = await getMeta(pool, "last_backup_verify_at");
        const lastVerifyResult = await getMeta(pool, "last_backup_verify_result");
        const lastExport = await getMeta(pool, "last_export_at");

        lines.push(
          "",
          "=== Backups ===",
          `Schedule: ${backupCron}`,
          `Encryption: ${encryptionEnabled ? "enabled (AES-256)" : "DISABLED"}`,
          `Cloud sync: ${cloudConfigured ? rcloneRemote : "NOT CONFIGURED"}`,
          `Last verified: ${lastVerify ? `${new Date(lastVerify).toLocaleDateString()} (${lastVerifyResult || "unknown"})` : "NEVER"}`,
        );

        lines.push(
          "",
          "=== Data Portability ===",
          `Last export: ${lastExport ? new Date(lastExport).toLocaleDateString() : "NEVER"}`,
        );

        // --- Key age check ---
        const keyAgeResult = await client.queryObject<{
          name: string;
          key_created_at: string | null;
          has_secondary: boolean;
        }>(
          `SELECT name, key_created_at,
                  (secondary_key_hash IS NOT NULL) AS has_secondary
           FROM brain_users WHERE is_active = TRUE`
        );

        const oldKeys: string[] = [];
        for (const row of keyAgeResult.rows) {
          if (row.key_created_at) {
            const ageDays = (Date.now() - new Date(row.key_created_at).getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays > 180) {
              oldKeys.push(`${row.name} (${Math.floor(ageDays)} days)`);
            }
          }
        }

        if (oldKeys.length > 0) {
          lines.push(
            "",
            "=== Key Rotation ===",
            `Keys older than 6 months:`,
            ...oldKeys.map((k) => `  - ${k}`),
            `Rotate with: create-brain-user.ts <name> --rotate`,
          );
        }

        if (errors.length > 0 || warnings.length > 0) {
          lines.push(
            "",
            "=== Problems ==="
          );
          for (const n of errors) {
            lines.push(`[ERROR] ${n.title} — ${n.message}`);
          }
          for (const n of warnings) {
            lines.push(`[WARNING] ${n.title} — ${n.message}`);
          }
        } else {
          lines.push(
            "",
            "=== Problems ===",
            "None. All checks passed."
          );
        }

        if (infos.length > 0) {
          lines.push(
            "",
            "=== Info ==="
          );
          for (const n of infos) {
            lines.push(`[INFO] ${n.title} — ${n.message}`);
          }
        }

        lines.push(
          "",
          "=== Configuration ===",
          `Embedding model: ${EMBEDDING_MODEL}`,
          `Chat model: ${CHAT_MODEL}`,
          `Chat API format: ${CHAT_API_FORMAT}`,
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Cron Jobs ---

// Archive expired thoughts — runs every hour
try {
  Deno.cron("archive-expired-thoughts", "0 * * * *", async () => {
    const client = await pool.connect();
    try {
      const result = await client.queryObject<{ count: number }>(
        `WITH archived AS (
          UPDATE thoughts
          SET archived = TRUE, archived_at = CURRENT_TIMESTAMP
          WHERE expires_at IS NOT NULL
            AND expires_at <= CURRENT_TIMESTAMP
            AND archived = FALSE
          RETURNING id
        )
        SELECT COUNT(*)::int AS count FROM archived`
      );
      const count = result.rows[0]?.count || 0;
      if (count > 0) {
        console.log(`Cron: Archived ${count} expired thought(s).`);
      }
    } finally {
      client.release();
    }
  });
} catch {
  // Deno.cron requires --unstable-cron flag; ignore if not available
  console.log("Note: Deno.cron not available. Expiration and digest scheduling disabled. Add --unstable-cron flag to enable.");
}

// Process digests — runs every hour, checks what's due
try {
  Deno.cron("process-digests", "30 * * * *", async () => {
    try {
      await processDigests(pool);
    } catch (err) {
      console.error(`Cron digest error: ${(err as Error).message}`);
    }
  });
} catch {
  // Already logged above
}

// Backup health checks — runs every 6 hours
try {
  Deno.cron("backup-health-check", "0 */6 * * *", async () => {
    try {
      await checkBackupHealth(pool);
    } catch (err) {
      console.error(`Cron backup health error: ${(err as Error).message}`);
    }
  });
} catch {
  // Already logged above
}

// --- Hono App ---

const app = new Hono();

// Health check — no auth required (CR-13: minimal info, no operational details)
app.get("/health", async (c) => {
  try {
    const client = await pool.connect();
    try {
      await client.queryObject("SELECT 1");
      return c.json({ status: "ok", version: VERSION });
    } finally {
      client.release();
    }
  } catch {
    return c.json({ status: "error" }, 500);
  }
});

// Admin UI — must be mounted BEFORE the MCP catch-all
const admin = createAdminApp(pool);
app.route("/admin", admin);

// MCP handler — catches everything else
app.all("*", async (c) => {
  // CR-04: Only accept key via header, not query string (prevents key leaking in logs)
  const provided = c.req.header("x-brain-key");
  if (!provided) {
    return c.json({ error: "Missing access key. Use the x-brain-key header." }, 401);
  }

  let user: ResolvedUser | null;
  try {
    user = await authenticateRequest(provided);
  } catch {
    return c.json({ error: "Invalid or missing access key" }, 401);
  }

  // CR-01: Use AsyncLocalStorage for per-request user context (safe under concurrency)
  return requestContext.run({ user }, async () => {
    const transport = new StreamableHTTPTransport();
    await server.connect(transport);
    return transport.handleRequest(c);
  });
});

Deno.serve({ port: parseInt(Deno.env.get("PORT") || "8000", 10) }, app.fetch);
