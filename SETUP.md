# Setup — Local Brain

## Prerequisites

See the [Prerequisites section in README.md](README.md#prerequisites) for hardware specs, software requirements, and external accounts you'll need.

**Quick checklist before you start:**

- [ ] Docker and Docker Compose installed (`docker compose version` to verify)
- [ ] An AI provider API key (OpenRouter, OpenAI, or Anthropic)
- [ ] A domain on Cloudflare (only if you want remote access — skip for localhost-only)

## Step 1 — Clone the Repo

```bash
git clone https://github.com/Chapworks/local-brain.git
cd local-brain
```

## Step 2 — Configure Environment

```bash
cp .env.example .env
```

Generate random values for secrets:

```bash
# Database password
openssl rand -base64 32

# MCP access key
openssl rand -hex 32

# Admin panel JWT secret
openssl rand -base64 32
```

Edit `.env` and set:

- `DB_PASSWORD` — paste a generated password
- `MCP_ACCESS_KEY` — paste a generated key (this authenticates all MCP clients)
- `ADMIN_JWT_SECRET` — paste a generated secret (this signs admin panel sessions)
- AI provider keys — uncomment ONE of the four options (A/B/C/D) and fill in your API key(s)

**If using remote access**, also set:
- `CLOUDFLARE_TUNNEL_TOKEN` — your tunnel token (see Step 3)

**If localhost-only**, you can skip the Cloudflare setup entirely. Comment out or ignore the tunnel token.

## Step 3 — Remote Access (Optional)

Skip this step if you only need localhost access.

See [CLOUDFLARE-TUNNEL.md](CLOUDFLARE-TUNNEL.md) for the full walkthrough. Summary:

1. Add your domain to Cloudflare (free plan)
2. Create a tunnel in the Zero Trust dashboard
3. Point your subdomain (e.g., `brain.yourdomain.com`) at the tunnel
4. Set the service to `http://mcp-server:8000`
5. Copy the tunnel token to your `.env`

## Step 4 — Start Services

```bash
docker compose up -d
```

This starts four containers:

1. **postgres** — PostgreSQL with pgvector (runs `init.sql` on first boot)
2. **mcp-server** — Deno MCP server + admin panel (port 8000)
3. **tunnel** — Cloudflare Tunnel (outbound connection, no inbound ports)
4. **docker-proxy** — Docker socket proxy for the admin panel's log viewer and restart controls

Check that everything is running:

```bash
docker compose ps
```

Check logs:

```bash
docker compose logs -f
```

## Step 5 — Create an Admin User

```bash
docker compose exec mcp-server deno run \
  --allow-net --allow-env \
  /app/scripts/create-user.ts admin YourSecurePassword123
```

Replace `admin` and `YourSecurePassword123` with your preferred username and a strong password (minimum 8 characters).

Access the admin panel at: `http://localhost:8000/admin`

See [ADMIN.md](ADMIN.md) for more details on the admin panel, including remote access mode.

## Step 6 — Connect an MCP Client

### Claude Code

Add to your project or user MCP settings:

**Remote access (via Cloudflare Tunnel):**

```json
{
  "mcpServers": {
    "local-brain": {
      "type": "url",
      "url": "https://brain.yourdomain.com/?key=YOUR_MCP_ACCESS_KEY"
    }
  }
}
```

**Localhost only:**

```json
{
  "mcpServers": {
    "local-brain": {
      "type": "url",
      "url": "http://localhost:8000/?key=YOUR_MCP_ACCESS_KEY"
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json` (same format as above).

### Other MCP Clients

Any client that supports MCP over HTTP can connect using the URL + access key.

## Step 7 — Test

In Claude Code (or your MCP client), try:

```
capture a thought: "Testing Local Brain setup"
```

Then:

```
search my thoughts for "testing"
```

You should see your captured thought returned with similarity score, type, and topic tags.

Check the admin panel at `http://localhost:8000/admin` to see the thought in the database browser.

## Updating

Pull the latest code and rebuild:

```bash
git pull
docker compose build
docker compose up -d
```

The PostgreSQL data persists in a Docker volume (`pgdata`). Rebuilding containers does not destroy your data.

## Backups

Back up the PostgreSQL data:

```bash
docker compose exec postgres pg_dump -U localbrain localbrain > backup-$(date +%Y%m%d).sql
```

Restore from backup:

```bash
cat backup-20260328.sql | docker compose exec -T postgres psql -U localbrain localbrain
```

## Troubleshooting

**Containers won't start:**
```bash
docker compose logs mcp-server
```
Common issues: missing `.env` values, Docker not running, port 5432 already in use.

**MCP client can't connect:**
- Verify the server is running: `curl http://localhost:8000/health`
- Check your `MCP_ACCESS_KEY` matches what's in `.env`
- For remote: verify the Cloudflare Tunnel is connected (`docker compose logs tunnel`)

**Admin panel login fails:**
- Make sure you created a user (Step 5)
- Check that `ADMIN_JWT_SECRET` is set in `.env`

**No embeddings / metadata extraction:**
- Check your AI provider API key is valid
- Check `docker compose logs mcp-server` for API errors

## Maintenance Notes

- **PostgreSQL data** lives in the `pgdata` Docker volume. As long as you don't `docker compose down -v` (the `-v` flag deletes volumes), your data is safe.
- **Cloudflare Tunnel** reconnects automatically. No maintenance needed.
- **Dependencies are pinned.** Nothing updates unless you explicitly change version numbers in `server/deno.json`.
- **The MCP SDK will evolve.** When you update it, test that all four tools still work before deploying.

See [MAINTENANCE.md](MAINTENANCE.md) for the full risk assessment.
