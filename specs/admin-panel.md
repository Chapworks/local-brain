# Admin Panel Spec

## Overview

The admin panel is a server-rendered web UI built with Hono JSX. It runs inside the same Deno process as the MCP server, mounted as a Hono sub-app at `/admin`. No external frontend framework. No build step. No client-side JavaScript framework.

## Tech Stack

- **Hono JSX** — server-side rendering, compiles at runtime in Deno
- **Inline CSS** — all styles in `layout.tsx`, dark theme, responsive
- **Vanilla HTML forms** — standard POST forms, no client-side JS required for core functionality
- **bcrypt** (`v0.4.1`) — password hashing, cost factor 12
- **jose** (`5.9.6`) — JWT sign/verify, HS256

## Authentication

### Session Flow

1. User visits `/admin` → middleware redirects to `/admin/login`
2. User submits username + password via POST form
3. Server queries `admin_users` table, verifies bcrypt hash
4. On success, creates JWT (HS256, 7-day expiry) and sets httpOnly cookie
5. Cookie: name `lb_session`, flags: `httpOnly`, `secure`, `sameSite: Lax`, `path: /admin`
6. Subsequent requests verified by middleware via cookie → JWT decode

### JWT Payload

```json
{
  "sub": "username",
  "iat": 1711612800,
  "exp": 1712217600
}
```

Signed with `ADMIN_JWT_SECRET` env var using HS256.

### Rate Limiting

In-memory rate limiter on `/admin/login` POST:

- 5 attempts per IP per 60-second window
- IP sourced from: `x-forwarded-for` header, `cf-connecting-ip` header, or `"unknown"`
- Exceeded limit returns 429 with "Too many attempts" message
- Window resets after 60 seconds

### User Management

No web-based registration. Users are created via CLI script:

```bash
docker compose exec mcp-server deno run \
  --allow-net --allow-env \
  /app/scripts/create-user.ts <username> <password>
```

- Minimum password length: 8 characters
- Existing users: password is updated (upsert via `ON CONFLICT`)
- No user deletion via script (delete directly in PostgreSQL if needed)

## Access Modes

Controlled by `ADMIN_ACCESS_MODE` env var:

### `local` (default)

- Middleware checks for `cf-connecting-ip` header (set by Cloudflare)
- If present, request came through the tunnel → rejected with 403
- Direct localhost access allowed

### `remote`

- No origin check, all requests pass through to session auth
- Protected by JWT session + optional Cloudflare Access

## Pages

### Login (`/admin/login`)

- Standalone page (no layout nav)
- Username + password form
- Error messages for: missing fields, invalid credentials, rate limiting

### Dashboard (`/admin/`)

- Three stat cards: total thoughts, thought types count, topics count
- Types breakdown list with counts
- Top 10 topics list with counts
- Services health table: service name, status badge (green/yellow), uptime string
- Date range footer

**Data source:** Direct SQL queries + Docker proxy API (`/containers/json?all=true`)

### Thoughts Browser (`/admin/thoughts`)

- Filter bar: text search (ILIKE), type dropdown, topic dropdown
- Clear button resets all filters
- Paginated table (25 per page): ID, date, content (truncated), type badge, topics
- Pagination controls with page info
- Filter dropdowns populated from `SELECT DISTINCT` queries

**Filters build dynamic SQL WHERE clauses with parameterized queries.**

### Configuration (`/admin/config`)

- Groups config keys by section (Database, MCP Authentication, Cloudflare Tunnel, AI Provider, Admin)
- Secret fields: rendered as password inputs, placeholder shows last 4 characters
- Non-secret fields: rendered as text inputs with current value
- Blank secret fields are skipped on save (preserves current value)
- Two submit buttons: "Save Configuration" and "Save & Restart MCP Server"
- Flash message on success

**Config schema is defined in `CONFIG_SCHEMA` array in `mod.ts`.** To add a new config key, add an entry to this array.

**File I/O:**
- Reads `.env` at `/app/.env` (bind-mounted from host)
- Writes preserve comments and line order
- New keys appended to end of file
- Deno permissions scoped: `--allow-write=/app/.env`

### Logs (`/admin/logs`)

- Service selector buttons (postgres, mcp-server, tunnel, docker-proxy)
- Active service highlighted
- Refresh button
- Log output in monospace pre block (max height 32rem, scrollable)
- Restart button per service (POST to `/admin/api/services/:name/restart`)
- `docker-proxy` cannot be restarted (blocked in API)

**Docker log stream parsing:** Docker multiplexed stream has 8-byte header frames (stream type byte + 3 padding + 4 big-endian size bytes). The `stripDockerLogHeaders` function parses these frames. Falls back to raw text if parsing fails.

## API Endpoints

### `POST /admin/api/services/:name/restart`

Restarts a Docker Compose service. Allowlist: `postgres`, `mcp-server`, `tunnel`. Blocks `docker-proxy`. Redirects to log viewer for that service on success.

**Implementation:** Finds container by `com.docker.compose.service` label via Docker proxy API, then `POST /containers/{id}/restart`.

## Docker Proxy Integration

The admin panel never accesses the Docker socket directly. All Docker operations go through `tecnativa/docker-socket-proxy` over HTTP at `DOCKER_API_URL` (default: `http://docker-proxy:2375`).

Permitted operations (set via proxy env vars):

- `CONTAINERS=1` — list, inspect, logs
- `POST=1` — restart

Not permitted: exec, image operations, volume operations, network operations, privileged operations.

## Design Decisions

- **No client-side framework.** Server-rendered HTML means no build step, no bundle, no hydration. The admin panel is lightweight and works in any browser.
- **Inline CSS over Tailwind CDN.** Removes the external dependency. The CSS is ~3KB in the layout component.
- **Forms over fetch.** Standard HTML forms with POST actions. The browser handles redirects and state. Progressive enhancement is possible but not implemented.
- **No CSRF tokens (current).** Forms are protected by SameSite=Lax cookies, which blocks cross-origin POST in modern browsers. CSRF middleware could be added for defense-in-depth.
