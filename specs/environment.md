# Environment Variables Spec

## Overview

All configuration is via environment variables, set in `.env` and passed through Docker Compose. No config files beyond `.env` and `Caddyfile` (cloud only).

## Variables

### Database

- **`DB_PASSWORD`** (required) — PostgreSQL password. Used by both the `postgres` container and `mcp-server`.
- `DB_HOST` — PostgreSQL hostname. Default: `postgres` (Docker service name). Override only for non-Docker setups.
- `DB_PORT` — PostgreSQL port. Default: `5432`.
- `DB_NAME` — Database name. Default: `localbrain`.
- `DB_USER` — Database user. Default: `localbrain`.

### MCP Authentication

- **`MCP_ACCESS_KEY`** (required) — Shared secret for MCP client authentication. Sent via `x-brain-key` header or `key` query param. Generate with `openssl rand -hex 32`.

### AI Providers — Embeddings

- `EMBEDDING_API_BASE` — Base URL for embedding API. Default: `https://openrouter.ai/api/v1`. Must be OpenAI-compatible.
- **`EMBEDDING_API_KEY`** (required) — API key for embedding service.
- `EMBEDDING_MODEL` — Model name. Default: `openai/text-embedding-3-small`. Must produce 1536-dimension vectors.

### AI Providers — Chat (Metadata Extraction)

- `CHAT_API_BASE` — Base URL for chat API. Default: same as `EMBEDDING_API_BASE`.
- `CHAT_API_KEY` — API key for chat service. Default: same as `EMBEDDING_API_KEY`.
- `CHAT_MODEL` — Model name. Default: `openai/gpt-4o-mini`.
- `CHAT_API_FORMAT` — API request format. Values: `openai` (default) or `anthropic`. Determines request/response structure for metadata extraction calls.

### Admin Panel

- **`ADMIN_JWT_SECRET`** (required for admin) — Secret for signing JWT session cookies. Generate with `openssl rand -base64 32`. Must be at least 32 characters.
- `ADMIN_ACCESS_MODE` — Access restriction. Values: `local` (default) or `remote`. In `local` mode, requests with `cf-connecting-ip` header are rejected.
- `DOCKER_API_URL` — Docker socket proxy URL. Default: `http://docker-proxy:2375`. Override if running docker-proxy on a different host/port.

### Reverse Proxy

- `CLOUDFLARE_TUNNEL_TOKEN` — Cloudflare Tunnel token (home hosting only). Obtained from Cloudflare Zero Trust dashboard.
- `DOMAIN` — Server domain name (cloud hosting only). Used by Caddy for Let's Encrypt certificate provisioning. Example: `brain.yourdomain.com`.

### Server

- `PORT` — HTTP listen port. Default: `8000`. Rarely needs changing.

## Provider Configuration Patterns

### Option A: OpenRouter for everything

```
EMBEDDING_API_BASE=https://openrouter.ai/api/v1
EMBEDDING_API_KEY=<openrouter-key>
EMBEDDING_MODEL=openai/text-embedding-3-small
CHAT_API_BASE=https://openrouter.ai/api/v1
CHAT_API_KEY=<openrouter-key>
CHAT_MODEL=openai/gpt-4o-mini
CHAT_API_FORMAT=openai
```

### Option B: OpenAI direct

```
EMBEDDING_API_BASE=https://api.openai.com/v1
EMBEDDING_API_KEY=<openai-key>
EMBEDDING_MODEL=text-embedding-3-small
CHAT_API_BASE=https://api.openai.com/v1
CHAT_API_KEY=<openai-key>
CHAT_MODEL=gpt-4o-mini
CHAT_API_FORMAT=openai
```

### Option C: OpenAI embeddings + Anthropic chat

```
EMBEDDING_API_BASE=https://api.openai.com/v1
EMBEDDING_API_KEY=<openai-key>
EMBEDDING_MODEL=text-embedding-3-small
CHAT_API_BASE=https://api.anthropic.com/v1
CHAT_API_KEY=<anthropic-key>
CHAT_MODEL=claude-haiku-4-5-20251001
CHAT_API_FORMAT=anthropic
```

### Option D: OpenRouter embeddings + Anthropic chat

```
EMBEDDING_API_BASE=https://openrouter.ai/api/v1
EMBEDDING_API_KEY=<openrouter-key>
EMBEDDING_MODEL=openai/text-embedding-3-small
CHAT_API_BASE=https://api.anthropic.com/v1
CHAT_API_KEY=<anthropic-key>
CHAT_MODEL=claude-haiku-4-5-20251001
CHAT_API_FORMAT=anthropic
```

## Defaults and Fallbacks

- `CHAT_API_BASE` falls back to `EMBEDDING_API_BASE` if not set
- `CHAT_API_KEY` falls back to `EMBEDDING_API_KEY` if not set
- `EMBEDDING_API_KEY` also checks `OPENROUTER_API_KEY` (legacy OB1 compatibility)
- `DB_NAME` defaults to `openbrain` in code (but Docker Compose sets it to `localbrain`)
- `ADMIN_JWT_SECRET` defaults to `"change-me"` — functional but insecure, logs a warning intention

## Security Notes

- Never commit `.env` to git (`.gitignore` includes it)
- Secrets are masked in the admin config editor (shows only last 4 characters)
- `ADMIN_JWT_SECRET` and `MCP_ACCESS_KEY` are independent — compromising one doesn't compromise the other
- `DB_PASSWORD` is used by both PostgreSQL and the application — it's a single shared secret, not separate credentials
