# Admin Panel

Local Brain includes a web-based admin panel for managing your instance. No external frameworks — it runs inside the same Deno server as the MCP endpoint.

## What It Does

- **Dashboard** — thought count, type breakdown, top topics, service health (green/yellow status for each Docker container)
- **Thoughts browser** — paginated view of all captured thoughts with filtering by type, topic, and text search
- **Configuration editor** — view and edit `.env` values with masked secrets, save and optionally restart the MCP server
- **Log viewer** — view recent Docker container logs for any service (postgres, mcp-server, tunnel, docker-proxy)
- **Service restart** — restart any container from the UI

## Setup

### 1. Generate a JWT secret

```bash
openssl rand -base64 32
```

Add it to your `.env`:

```bash
ADMIN_JWT_SECRET=your-generated-secret
```

### 2. Create an admin user

After your containers are running:

```bash
docker compose exec mcp-server deno run \
  --allow-net --allow-env \
  /app/scripts/create-user.ts admin YourPassword123
```

To update a password, run the same command with the same username and a new password.

### 3. Access the admin panel

By default, the admin panel is only accessible on localhost:

```
http://localhost:8000/admin
```

## Access Modes

### Local only (default)

```bash
ADMIN_ACCESS_MODE=local
```

The admin panel rejects any request that arrives through the Cloudflare Tunnel. You must access it directly at `http://localhost:8000/admin` on the host machine.

### Remote access

```bash
ADMIN_ACCESS_MODE=remote
```

The admin panel is accessible through the Cloudflare Tunnel at `https://brain.yourdomain.com/admin`. Protected by JWT session auth (username + password login).

For extra security in remote mode, consider adding Cloudflare Access (Zero Trust dashboard) as an additional auth layer.

## Existing Installations

If you're upgrading an existing Local Brain installation, the `admin_users` table won't be created automatically (the init.sql only runs on first PostgreSQL boot). Run this migration:

```bash
docker compose exec postgres psql -U localbrain localbrain -c \
  "CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );"
```

## Security

- Passwords are hashed with bcrypt (cost factor 12)
- Sessions use signed JWT tokens in httpOnly, Secure, SameSite=Lax cookies
- Login is rate-limited to 5 attempts per IP per minute
- The Docker socket is never directly mounted — a socket proxy (`tecnativa/docker-socket-proxy`) exposes only container list, logs, and restart operations
- Config secrets are masked in the UI — you must re-enter the full value to change them
- The admin JWT secret is separate from the MCP access key
