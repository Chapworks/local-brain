# Home Hosting — Making This Accessible on the Internet

You want to run Local Brain on a computer in your house and access it from anywhere. Here are your options, ranked by reliability and simplicity.

---

## Option 1 — Cloudflare Tunnel (Recommended)

**What it is:** Cloudflare Tunnel (formerly Argo Tunnel) creates an outbound-only connection from your home machine to Cloudflare's network. No ports to open, no IP address to expose.

**How it works:**
- Install `cloudflared` on your home machine
- It connects outbound to Cloudflare (no inbound firewall rules needed)
- You point a domain (e.g., `brain.yourdomain.com`) at the tunnel
- Cloudflare handles HTTPS, DDoS protection, and routing
- Traffic flows: Internet → Cloudflare → tunnel → your machine

**Pros:**
- No port forwarding on your router
- Your home IP is never exposed
- Free tier covers personal use
- Automatic HTTPS via Cloudflare
- Survives IP changes (your ISP can change your IP and it doesn't matter)
- Built-in access policies (you can add Cloudflare Access for extra auth)

**Cons:**
- Depends on Cloudflare (if their tunnel service goes down, you're offline)
- Requires a domain name managed by Cloudflare DNS
- Slight latency added by the extra hop

**Setup summary:**
1. Add your domain to Cloudflare (free plan)
2. Install `cloudflared` on your machine
3. `cloudflared tunnel create openbrain`
4. `cloudflared tunnel route dns openbrain brain.yourdomain.com`
5. Configure the tunnel to forward to `http://localhost:8000`
6. Run `cloudflared tunnel run openbrain` as a systemd service

**This is the recommended approach.** It's the simplest, most secure option for home hosting. No router configuration, no exposed IP, no dynamic DNS headaches.

---

## Option 2 — Tailscale / WireGuard VPN

**What it is:** A private mesh network that connects your devices. Your home machine and your phone/laptop join the same Tailscale network. Traffic is encrypted end-to-end.

**How it works:**
- Install Tailscale on your home server and your client devices
- Each device gets a stable IP on the Tailscale network (e.g., 100.x.x.x)
- Access Local Brain at `http://100.x.x.x:8000` from any device on the network

**Pros:**
- Nothing exposed to the public internet at all
- Zero-trust networking — only your devices can connect
- No domain name or DNS needed
- Free for personal use (up to 100 devices)
- Works through NAT, firewalls, everything — no port forwarding

**Cons:**
- Every client device needs Tailscale installed
- Can't share a public URL (no one outside your network can access it)
- If you want to use it from a new device, you need to install Tailscale first

**Best for:** Maximum security. If you never need to share access and only use it from your own devices, this is the most locked-down option.

**Setup summary:**
1. Install Tailscale on your home server: `curl -fsSL https://tailscale.com/install.sh | sh`
2. `tailscale up` on the server
3. Install Tailscale on your phone/laptop
4. Access the MCP server at `http://<tailscale-ip>:8000`

---

## Option 3 — Port Forwarding + Dynamic DNS + Caddy

**What it is:** The traditional approach. Open a port on your router, point a domain at your home IP, and let Caddy handle HTTPS.

**How it works:**
- Forward port 443 on your router to your home machine
- Use a dynamic DNS service (e.g., DuckDNS, No-IP) to keep a hostname pointed at your changing home IP
- Caddy serves as the reverse proxy with automatic Let's Encrypt certificates

**Pros:**
- No third-party tunnel dependency
- Direct connection — lowest latency
- Full control over everything

**Cons:**
- Your home IP is exposed to the internet
- Requires router configuration (port forwarding)
- ISP may change your IP (dynamic DNS handles this, but there can be gaps)
- Some ISPs block port 80/443 on residential connections
- You're running a public-facing server on your home network
- Need to keep up with security patches

**Best for:** People who are comfortable managing a public-facing server and want zero dependencies on third-party tunnel services.

---

## Option 4 — Hybrid: Home Server + Linode Relay

**What it is:** Run PostgreSQL and the MCP server at home. Use a cheap Linode ($5/mo) as a relay/jump box that tunnels traffic to your home machine via WireGuard or SSH.

**How it works:**
- Linode has a static public IP and runs Caddy for HTTPS
- WireGuard VPN connects the Linode to your home machine
- Caddy on the Linode proxies requests through the VPN to your home server

**Pros:**
- Public-facing IP is the Linode, not your home
- Home IP never exposed
- Static IP (no dynamic DNS needed)
- You already have a Linode

**Cons:**
- Extra hop adds latency
- You're paying for the Linode
- More moving parts (VPN tunnel, two machines)

**Best for:** If you already have a Linode and want the security of not exposing your home IP but don't want to depend on Cloudflare.

---

## Recommendation

**Start with Cloudflare Tunnel (Option 1).** It's free, secure, simple, and doesn't require any router configuration. If you later want more control or less dependency on Cloudflare, you can switch to Tailscale (Option 2) or the hybrid approach (Option 4).

If you only ever access it from your own devices (Claude Code on your laptop, Claude app on your phone), Tailscale (Option 2) is even simpler and more secure — but it won't work from devices you don't own.

---

## Hardware Considerations

**Minimum specs:** Any machine that can run Docker. A Raspberry Pi 4 (4GB) could handle this. An old laptop works. A NAS with Docker support works.

**What matters:**
- Needs to be always on (or at least on when you want to use it)
- Needs a wired ethernet connection (Wi-Fi is unreliable for a server)
- Needs enough storage for PostgreSQL (thoughts are small — 1GB is years of data)
- 2GB RAM minimum, 4GB comfortable

**Power/uptime:** If your house loses power, your brain goes offline. Consider a UPS (uninterruptible power supply) if uptime matters to you. A basic UPS ($40-60) gives you 15-30 minutes to ride out brief outages.
