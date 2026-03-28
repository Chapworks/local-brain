# Architecture Spec

## Overview

Local Brain is a self-hosted personal knowledge layer. MCP-compatible AI tools capture and retrieve thoughts via four MCP tools. A web admin panel provides database browsing, configuration, log viewing, and service management.

## System Architecture

```
                          ┌─────────────────────────┐
                          │   MCP Clients           │
                          │   (Claude Code, etc.)   │
                          └───────────┬─────────────┘
                                      │ HTTPS
                          ┌───────────▼─────────────┐
                          │   Reverse Proxy          │
                          │   Cloudflare Tunnel      │
                          │   or Caddy (cloud)       │
                          └───────────┬─────────────┘
                                      │ HTTP :8000
                          ┌───────────▼─────────────┐
                          │   Deno MCP Server        │
                          │   (Hono HTTP framework)  │
                          │                          │
                          │   /health      → health  │
                          │   /admin/*     → admin   │
                          │   /*           → MCP     │
                          └──┬──────────┬──────┬────┘
                             │          │      │
               ┌─────────────▼──┐  ┌───▼───┐  ▼
               │  PostgreSQL    │  │Docker │  AI APIs
               │  + pgvector   │  │Proxy  │  (outbound)
               │  port 5432    │  │:2375  │
               └───────────────┘  └───────┘
```

## Services (Docker Compose)

### Home hosting (`docker-compose.yml`) — 4 containers

- **postgres** — `ankane/pgvector:latest`. Stores thoughts with 1536-dimension vector embeddings. Port 5432 bound to localhost only. Data persisted in `pgdata` Docker volume.
- **mcp-server** — `denoland/deno:2.3.3`. Runs the Hono HTTP server on port 8000. Connects to PostgreSQL via connection pool (max 20 connections). Port 8000 bound to localhost.
- **tunnel** — `cloudflare/cloudflared:latest`. Outbound-only connection to Cloudflare. No inbound ports.
- **docker-proxy** — `tecnativa/docker-socket-proxy:latest`. Exposes Docker Engine API over HTTP with restricted permissions (CONTAINERS + POST only). Used by admin panel for logs and restarts.

### Cloud hosting (`docker-compose.cloud.yml`) — 4 containers

Same as above but replaces `tunnel` with:

- **caddy** — `caddy:2-alpine`. Reverse proxy on ports 80/443. Automatic Let's Encrypt HTTPS. Configured via `Caddyfile` using `DOMAIN` env var.

## Request Routing

Hono routes are matched in order. This ordering is critical:

1. `GET /health` — unauthenticated health check, returns `{ status, thoughts }`
2. `/admin/*` — admin panel sub-app (session auth via JWT cookie)
3. `*` (catch-all) — MCP endpoint (auth via `x-brain-key` header or `key` query param)

The admin app must be mounted before the MCP catch-all or admin routes will never match.

## Database Schema

### `thoughts` table

- `id` — BIGSERIAL primary key
- `content` — TEXT, the captured thought
- `embedding` — vector(1536), for semantic search via cosine distance (`<=>` operator)
- `metadata` — JSONB, auto-extracted by the chat API. Contains: `type`, `topics[]`, `people[]`, `action_items[]`, `dates_mentioned[]`, `source`
- `created_at` — TIMESTAMPTZ

Indexes: `created_at DESC`, GIN on `metadata`

### `admin_users` table

- `id` — BIGSERIAL primary key
- `username` — TEXT, unique
- `password_hash` — TEXT, bcrypt (cost 12)
- `created_at`, `updated_at` — TIMESTAMPTZ

### `match_thoughts` function

PostgreSQL function for vector similarity search. Accepts a query embedding, threshold, count, and optional JSONB filter. Returns rows with similarity score.

## AI Provider Integration

Two external API calls per captured thought (outbound only):

1. **Embedding** — converts text to 1536-dimension vector. Always uses OpenAI-compatible `/embeddings` endpoint.
2. **Metadata extraction** — extracts type, topics, people, action items from text. Supports two API formats:
   - `openai` — `/chat/completions` with `response_format: json_object`
   - `anthropic` — `/messages` with `x-api-key` header and `anthropic-version`

Format selected by `CHAT_API_FORMAT` env var. Both embedding and chat API base URLs and keys are independently configurable.

## File Structure

```
local-brain/
  docker-compose.yml          # Home hosting (Cloudflare Tunnel)
  docker-compose.cloud.yml    # Cloud hosting (Caddy)
  Caddyfile                   # Caddy config (cloud only)
  init.sql                    # Database schema
  .env.example                # Configuration template
  .gitignore
  specs/                      # Architecture and design specs
  server/
    deno.json                 # Pinned dependencies + JSX config
    Dockerfile                # Deno container build
    index.ts                  # Main server — MCP tools + Hono app
    admin/
      mod.ts                  # Admin sub-app — all routes and logic
      auth.ts                 # bcrypt + JWT utilities
      middleware.ts            # Access mode guard + session check
      pages/
        layout.tsx            # Shared HTML shell + CSS
        login.tsx             # Login form
        dashboard.tsx         # Stats overview
        thoughts.tsx          # Database browser
        config.tsx            # Configuration editor
        logs.tsx              # Log viewer
    scripts/
      create-user.ts          # CLI admin user management
```
