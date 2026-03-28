# Cloud VM Hosting

Run Local Brain on a cloud VM (Linode, DigitalOcean, Hetzner, AWS EC2, etc.) instead of a home machine. No Cloudflare Tunnel needed — Caddy handles HTTPS automatically via Let's Encrypt.

## What's Different from Home Hosting

- **No tunnel** — the VM is already on the internet
- **Caddy replaces Cloudflare Tunnel** — reverse proxy with automatic HTTPS
- **Firewall matters** — the VM is directly exposed, unlike a home machine behind a router
- **Admin panel defaults to remote mode** — since you'll be accessing the VM over the internet
- **You need a domain name** pointed at the VM's IP address

## Prerequisites

- A cloud VM with at least 1 GB RAM (2 GB recommended)
- Ubuntu 22.04 or Debian 12 recommended
- A domain name with an A record pointing to the VM's IP address
- SSH access to the VM

## Step 1 — Secure the VM

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Set up firewall — only allow SSH, HTTP, HTTPS
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Verify
sudo ufw status
```

**Recommended but optional:**

```bash
# Disable root SSH login
sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Use SSH key auth only (disable password auth)
sudo sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

sudo systemctl restart sshd
```

## Step 2 — Install Docker

```bash
# Install Docker (official method)
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# Log out and back in for group change to take effect
exit
```

After logging back in:

```bash
# Verify
docker --version
docker compose version
```

## Step 3 — Clone and Configure

```bash
git clone https://github.com/Chapworks/local-brain.git
cd local-brain
cp .env.example .env
```

Generate secrets:

```bash
echo "DB_PASSWORD: $(openssl rand -base64 32)"
echo "MCP_ACCESS_KEY: $(openssl rand -hex 32)"
echo "ADMIN_JWT_SECRET: $(openssl rand -base64 32)"
```

Edit `.env`:

```bash
nano .env
```

Set all the values from above, plus:

```bash
# Your domain name (used by Caddy for Let's Encrypt)
DOMAIN=brain.yourdomain.com

# Admin panel — set to remote since you're accessing over the internet
ADMIN_ACCESS_MODE=remote
```

Uncomment your preferred AI provider option (A/B/C/D) and fill in the API key(s).

**You do NOT need to set `CLOUDFLARE_TUNNEL_TOKEN`** — comment it out or leave it as the placeholder.

## Step 4 — Point Your Domain

Add an A record in your DNS provider:

- **Type:** A
- **Name:** `brain` (or whatever subdomain you chose)
- **Value:** your VM's IP address
- **TTL:** 300 (or auto)

Wait for DNS propagation (usually a few minutes, can take up to an hour).

Verify:

```bash
dig brain.yourdomain.com +short
# Should return your VM's IP
```

## Step 5 — Start Services

```bash
docker compose -f docker-compose.cloud.yml up -d
```

This starts four containers:

1. **postgres** — PostgreSQL with pgvector
2. **mcp-server** — Deno MCP server + admin panel
3. **caddy** — reverse proxy with automatic Let's Encrypt HTTPS
4. **docker-proxy** — Docker socket proxy for admin panel

Caddy will automatically obtain a Let's Encrypt certificate for your domain on first request. This takes a few seconds.

Check that everything is running:

```bash
docker compose -f docker-compose.cloud.yml ps
docker compose -f docker-compose.cloud.yml logs caddy
```

## Step 6 — Create Admin User

```bash
docker compose -f docker-compose.cloud.yml exec mcp-server deno run \
  --allow-net --allow-env \
  /app/scripts/create-user.ts admin YourSecurePassword123
```

## Step 7 — Test

```bash
# Health check
curl https://brain.yourdomain.com/health

# MCP endpoint (should return auth error without key — that's correct)
curl https://brain.yourdomain.com/

# Admin panel
# Open in browser: https://brain.yourdomain.com/admin
```

Connect your MCP client:

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

## Security Checklist

- [x] Firewall: only ports 22, 80, 443 open
- [x] HTTPS: Caddy handles certificates automatically
- [x] MCP auth: access key required on every request
- [x] Admin auth: bcrypt + JWT sessions, rate-limited login
- [x] PostgreSQL: not exposed — only reachable inside Docker network
- [x] Docker socket: proxied with restricted permissions
- [ ] SSH: key-based auth, root login disabled (recommended)
- [ ] Automatic security updates: `sudo apt install unattended-upgrades` (recommended)

## Updating

```bash
cd local-brain
git pull
docker compose -f docker-compose.cloud.yml build
docker compose -f docker-compose.cloud.yml up -d
```

## Backups

```bash
docker compose -f docker-compose.cloud.yml exec postgres \
  pg_dump -U localbrain localbrain > backup-$(date +%Y%m%d).sql
```

## Cost Estimate

- **Linode / DigitalOcean / Hetzner:** $5-12/month for a VM with 1-2 GB RAM
- **AI provider:** ~$5 in OpenRouter credits lasts months for personal use
- **Domain:** ~$10-15/year
- **HTTPS certificates:** free (Let's Encrypt via Caddy)
