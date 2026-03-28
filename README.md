# Local Brain

A self-hosted fork of [OB1 (Open Brain)](https://github.com/NateBJones-Projects/OB1) that runs entirely on your own hardware. No Supabase, no cloud dependencies for data storage. Your brain stays on your machine.

## What This Is

A personal knowledge and memory layer that any MCP-compatible AI tool (Claude Code, Claude Desktop, Cursor, etc.) can read from and write to. One database, one server, accessible from anywhere via HTTPS.

Open Brain is cloud-first. Local Brain is yours-first. Same four MCP tools, same PostgreSQL + pgvector foundation, but the data never leaves your house.

Based on the OB1 Kubernetes self-hosted variant, simplified for a single-machine Docker Compose deployment.

## Prerequisites

### Hardware (minimum)

- Any x86_64 or ARM64 Linux machine (Raspberry Pi 4+, old laptop, NUC, desktop, VM)
- 1 GB RAM available (PostgreSQL + Deno server + tunnel are lightweight)
- 1 GB disk space (grows slowly — thoughts are small, embeddings are ~6KB each)

### Hardware (recommended)

- 2+ GB RAM
- SSD (faster vector search on large datasets)
- Always-on machine (so your MCP tools can always reach it)

### Software

- **Docker** and **Docker Compose** — that's it. Everything else runs in containers.
  - Install: https://docs.docker.com/engine/install/
  - Docker Compose v2 is included with modern Docker installs

### External Accounts (free tiers work)

- **AI provider** (pick one):
  - [OpenRouter](https://openrouter.ai) — simplest, one key for everything (~$5 credits lasts months)
  - [OpenAI](https://platform.openai.com) — direct, no middleman
  - [Anthropic](https://console.anthropic.com) — for Claude-based metadata extraction (can mix with OpenAI embeddings)
- **Cloudflare** (for remote access only — skip if localhost-only):
  - Free account at [cloudflare.com](https://cloudflare.com)
  - A domain name with DNS managed by Cloudflare
- **MCP client** (what connects to Local Brain):
  - Claude Code, Claude Desktop, Cursor, or any MCP-compatible tool

## Architecture

```
Internet
  │
  ▼
Cloudflare Tunnel (HTTPS, DDoS protection, no exposed IP)
  │
  ▼
Deno MCP Server (port 8000, auth via access key)
  │
  ▼
PostgreSQL + pgvector (port 5432, local only)
```

External API calls (outbound only):
- Embeddings API (OpenRouter, OpenAI, or compatible)
- Chat API for metadata extraction (OpenRouter, OpenAI, Anthropic — configurable)

## Stack

- **PostgreSQL 16** with pgvector extension — stores thoughts with vector embeddings
- **Deno 2.x** — runs the MCP server and admin panel (~server-side rendered, no build step)
- **Cloudflare Tunnel** — secure access without exposing your home IP
- **Docker Compose** — orchestrates four services (database, MCP server, tunnel, Docker socket proxy)

## Dependencies (pinned)

- `hono@4.9.2` — web framework (mature, stable)
- `zod@4.1.13` — validation
- `@modelcontextprotocol/sdk@1.24.3` — MCP protocol (moderate risk — protocol still maturing)
- `@hono/mcp@0.1.1` — Hono-to-MCP bridge (pre-1.0, small surface area)
- `postgres@v0.19.3` — Deno PostgreSQL driver (mature)
- `bcrypt@v0.4.1` — password hashing for admin panel
- `jose@5.9.6` — JWT signing/verification for admin sessions

## Security

- Access key authentication (shared secret over HTTPS)
- Cloudflare Tunnel — outbound-only connection, no inbound ports, home IP hidden
- PostgreSQL only listens on localhost (not exposed to internet)
- No cloud data storage — everything stays on your machine

## Admin Panel

A built-in web dashboard for managing your Local Brain instance:

- **Dashboard** — thought count, type breakdown, top topics, service health
- **Thoughts browser** — paginated, filterable view of all captured thoughts
- **Configuration editor** — view/edit `.env` with masked secrets, restart services
- **Log viewer** — Docker container logs for every service
- **Service restarts** — restart containers from the UI

Access at `http://localhost:8000/admin` (local-only by default). See [ADMIN.md](ADMIN.md) for setup.

## Home Hosting Options

See [HOME-HOSTING.md](HOME-HOSTING.md) for detailed options on running this from a computer in your house and making it accessible on the internet. Default recommendation: Cloudflare Tunnel.

## Setup

See [SETUP.md](SETUP.md) for step-by-step installation instructions.

See [CLOUDFLARE-TUNNEL.md](CLOUDFLARE-TUNNEL.md) for Cloudflare Tunnel setup.

## Upstream

Forked from: https://github.com/NateBJones-Projects/OB1
License: FSL-1.1-MIT (see upstream repo)
