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

## Step 6 — Create a Brain User

Create a named user for your MCP client. Each user gets their own API key and isolated thought namespace.

```bash
docker compose exec mcp-server deno run \
  --allow-net --allow-env --allow-read \
  /app/scripts/create-brain-user.ts nick
```

Replace `nick` with your name. The script prints a one-time API key — **copy it now**, it cannot be recovered later. If you lose it, create a new key with `--rotate`.

You can create multiple brain users (e.g., one per device, or one for you and one for a family member). Each user's thoughts are isolated.

> **Why not use `MCP_ACCESS_KEY`?** The global `MCP_ACCESS_KEY` in `.env` is a legacy auth mode. It authenticates requests but doesn't associate thoughts with a user — they end up with a blank owner. Brain user keys are the recommended approach: your thoughts are scoped to your user, visible in the admin panel under your name, and properly isolated in multi-user setups.

## Step 7 — Connect an MCP Client

### Claude Code

These commands install the MCP server globally (available in all Claude Code sessions). To install for a single project only, add `--scope project` instead of `--scope user`.

Use the brain user API key from Step 6 (not the `MCP_ACCESS_KEY` from `.env`).

**Remote access (via Cloudflare Tunnel):**

```bash
claude mcp add --transport http --scope user local-brain \
  "https://brain.yourdomain.com/" \
  --header "x-brain-key: YOUR_BRAIN_USER_KEY"
```

**Localhost only:**

```bash
claude mcp add --transport http --scope user local-brain \
  "http://localhost:8000/" \
  --header "x-brain-key: YOUR_BRAIN_USER_KEY"
```

**Auto-approve MCP tools (optional):**

By default, Claude Code prompts you to approve each MCP tool call. To skip these prompts, add the tools to your global permission allow-list in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__local-brain__capture_thought",
      "mcp__local-brain__search_thoughts",
      "mcp__local-brain__list_thoughts",
      "mcp__local-brain__archive_thought",
      "mcp__local-brain__get_thought_connections",
      "mcp__local-brain__export_thoughts",
      "mcp__local-brain__thought_stats",
      "mcp__local-brain__usage_stats",
      "mcp__local-brain__system_health"
    ]
  }
}
```

If the file already has a `permissions.allow` array, merge these entries into it rather than replacing it.

### Claude Desktop

Add to `claude_desktop_config.json` (same format as above).

### Other MCP Clients

Any client that supports MCP over HTTP can connect using the URL + access key.

## Step 8 — Test

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
- Check that your brain user API key (from Step 6) is correct in your MCP client config
- For remote: verify the Cloudflare Tunnel is connected (`docker compose logs tunnel`)

**Thoughts have no user / blank owner:**
- You're using the global `MCP_ACCESS_KEY` instead of a brain user key. Create a brain user (Step 6) and update your MCP client config (Step 7) to use the brain user key instead.

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
