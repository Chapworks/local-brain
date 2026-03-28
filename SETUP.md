# Setup — Local Brain

## Prerequisites

- Docker and Docker Compose installed
- A domain name with DNS managed by Cloudflare (free plan)
- An OpenRouter account with API key (~$5 in credits)

## Step 1 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:

- `DB_PASSWORD` — a strong random password for PostgreSQL
- `MCP_ACCESS_KEY` — a long random string (this is your auth key for all MCP clients)
- `EMBEDDING_API_KEY` — your OpenRouter API key
- `CHAT_API_KEY` — same OpenRouter key (or a different one)
- `CLOUDFLARE_TUNNEL_TOKEN` — your tunnel token (see Step 2)

Generate random values:

```bash
# Generate a strong password
openssl rand -base64 32

# Generate an access key
openssl rand -hex 32
```

## Step 2 — Set Up Cloudflare Tunnel

See [CLOUDFLARE-TUNNEL.md](CLOUDFLARE-TUNNEL.md) for the full walkthrough. Summary:

1. Add your domain to Cloudflare
2. Create a tunnel in the Zero Trust dashboard
3. Point your subdomain (e.g., `brain.yourdomain.com`) at the tunnel
4. Set the service to `http://mcp-server:8000`
5. Copy the tunnel token to your `.env`

## Step 3 — Start Services

```bash
docker compose up -d
```

This starts:
1. PostgreSQL with pgvector (runs `init.sql` on first boot)
2. The Deno MCP server (connects to PostgreSQL, listens on port 8000)
3. Cloudflare Tunnel (outbound connection to Cloudflare, no inbound ports)

Check logs:

```bash
docker compose logs -f
```

## Step 4 — Connect Claude Code

Add this to your MCP client configuration.

For Claude Code, add to your project or user settings:

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

For Claude Desktop, add to `claude_desktop_config.json`:

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

## Step 5 — Test

In Claude Code, try:

```
capture a thought: "Testing Local Brain setup"
```

Then:

```
search my thoughts for "testing"
```

## Updating

Pull the latest images and rebuild:

```bash
docker compose pull
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

## Maintenance Notes

- **PostgreSQL data** lives in the `pgdata` Docker volume. As long as you don't `docker compose down -v` (the `-v` flag deletes volumes), your data is safe.
- **Cloudflare Tunnel** reconnects automatically. No maintenance needed.
- **Dependencies are pinned.** Nothing updates unless you explicitly change version numbers in `server/deno.json`.
- **The MCP SDK will evolve.** When you update it, test that all four tools still work before deploying.

See [MAINTENANCE.md](MAINTENANCE.md) for the full risk assessment.
