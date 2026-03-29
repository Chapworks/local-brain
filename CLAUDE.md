# Local Brain — Claude Code Context

## What This Is

Self-hosted personal knowledge and memory layer for MCP-compatible AI tools. Fork of OB1 (Open Brain), rewritten for local-first deployment. All data stays in your PostgreSQL database — AI providers process but don't retain.

## Repository Layout

### This Repo (`local-brain/`)

Open source code and public documentation.

| Directory / File | Purpose |
|---|---|
| `server/` | Main application — Deno + Hono MCP server and HTTP routes |
| `server/index.ts` | Core MCP server, all HTTP routes |
| `server/admin/` | Admin panel — React/TSX, server-side rendered |
| `server/admin/pages/` | Admin UI pages (dashboard, thoughts, graph, config, digests, etc.) |
| `server/scripts/` | DB utilities (create users, run migrations, backfill links) |
| `migrations/` | PostgreSQL migration files (001–007) |
| `scripts/` | Operational scripts (backup, restore, update, verify) |
| `specs/` | Public technical specs (architecture, MCP tools, admin panel, security, environment) |
| `docs/` | Architecture diagrams (SVG) |
| `docker-compose.yml` | Home hosting deployment |
| `docker-compose.cloud.yml` | Cloud hosting deployment |
| `init.sql` | Database initialization schema |

### Internal Specs (`../chapworks/products/local-brain/`)

Private specs, research, and product planning — not shipped with the open source repo.

| File | Purpose |
|---|---|
| `ideas.md` | Product roadmap, feature ideas (Obsidian integration, journal ingestion, Claudegram, BuJo mapping) |
| `release-spec.md` | Versioning strategy, release process, GitHub Actions workflow, priority ordering |
| `release-notes-v1.0.0.md` | Public-facing v1.0.0 release announcement |
| `research-journal-ingestion.md` | Technical research on ingesting long-form journals — chunking strategies, cost analysis, schema changes |
| `code-review.md` | Pre-release security audit (20 findings, 16 fixed for v1.0, 4 deferred) |

## Tech Stack

- **PostgreSQL 16 + pgvector** — storage and semantic search
- **Deno 2.x** — TypeScript runtime
- **Hono 4.9** — web framework
- **Docker Compose** — orchestration (postgres, mcp-server, tunnel/caddy, db-backup, docker-proxy)
- **MCP Protocol 1.24** — AI tool communication
- **bcrypt + JWT** — admin authentication

## Key Concepts

- **Thoughts** — atomic knowledge units (50–200 words), auto-classified with AI-extracted metadata
- **Semantic search** — vector embeddings, not keyword matching
- **Two deployment modes** — home hosting (Cloudflare Tunnel) and cloud hosting (Caddy + Let's Encrypt)
- **Multi-user** — per-request user isolation via AsyncLocalStorage
- **Nine MCP tools** — capture, search, list, archive, export, system_health, usage_stats, thought_stats, get_thought_connections

## Development

```bash
# Run locally
cd server && deno task dev

# Run tests
cd server && deno test

# Docker (home hosting)
docker compose up -d

# Create admin user
docker compose exec mcp-server deno run -A scripts/create-user.ts

# Run migrations
docker compose exec mcp-server deno run -A scripts/migrate.ts
```

## License

FSL-1.1-MIT (functional source license, converts to MIT after 2 years).
