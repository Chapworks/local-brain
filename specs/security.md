# Security Spec

## Threat Model

Local Brain stores personal knowledge and memories. The primary threats are:

1. **Unauthorized access to thoughts** — someone reading or modifying your captured data
2. **Unauthorized MCP tool invocation** — someone capturing or searching thoughts without your key
3. **Admin panel compromise** — someone accessing the config editor, restarting services, or reading logs
4. **Infrastructure compromise** — Docker socket access, database access, file system access

## Authentication Layers

### MCP Endpoint

- **Mechanism:** Shared secret (`MCP_ACCESS_KEY`) sent per-request
- **Transport:** `x-brain-key` header or `key` query parameter
- **Validation:** Exact string comparison (constant-time not implemented — acceptable for shared secret)
- **Failure:** 401 JSON response
- **Storage:** Environment variable, never in client-side code

### Admin Panel

- **Mechanism:** bcrypt password + JWT session cookie
- **Password storage:** bcrypt with cost factor 12
- **Session token:** JWT signed with HS256 using `ADMIN_JWT_SECRET`
- **Token lifetime:** 7 days
- **Cookie flags:** httpOnly, Secure, SameSite=Lax, path=/admin
- **Rate limiting:** 5 login attempts per IP per 60 seconds (in-memory)

### Reverse Proxy

- **Cloudflare Tunnel (home):** HTTPS via Cloudflare, outbound-only connection, home IP never exposed. Optional Cloudflare Access for additional auth layer.
- **Caddy (cloud):** HTTPS via Let's Encrypt, automatic certificate renewal.

## Network Security

### Home Hosting

- PostgreSQL: port 5432 bound to `127.0.0.1` only (not network-accessible)
- MCP server: port 8000 bound to `127.0.0.1` only
- Tunnel: outbound-only, no inbound ports on router
- Docker proxy: no exposed ports (internal Docker network only)

### Cloud Hosting

- PostgreSQL: no exposed ports (Docker internal only)
- MCP server: no exposed ports (Docker internal only)
- Caddy: ports 80 and 443 exposed
- Firewall (UFW): only 22, 80, 443 open

## Docker Socket Security

The admin panel needs Docker access for logs and restarts. Direct socket mounting is avoided.

**Implementation:** `tecnativa/docker-socket-proxy` container

- Socket mounted read-only into the proxy container: `/var/run/docker.sock:/var/run/docker.sock:ro`
- Proxy exposes HTTP API on port 2375 (Docker internal network only, not host-exposed)
- Allowed operations: `CONTAINERS=1` (list, inspect, logs), `POST=1` (restart)
- Blocked operations: exec, image pull/build, volume management, network management, privileged operations
- Application-level allowlist in `mod.ts`: only `postgres`, `mcp-server`, `tunnel` can be restarted. `docker-proxy` is blocked.

## Deno Permissions

The Deno runtime uses explicit permission flags:

- `--allow-net` — HTTP server, database connection, AI API calls, Docker proxy
- `--allow-env` — reads environment variables
- `--allow-read` — reads `.env` file, source files
- `--allow-write=/app/.env` — scoped write permission, only the `.env` file

No file system write access beyond `.env`. No subprocess spawning. No FFI.

## Admin Access Mode Guard

When `ADMIN_ACCESS_MODE=local`:

- Middleware checks for `cf-connecting-ip` HTTP header
- This header is set by Cloudflare on proxied requests
- If present → request came through the tunnel → 403 rejected
- If absent → request is direct (localhost) → allowed

This is a heuristic, not a cryptographic guarantee. An attacker who can set arbitrary headers on direct requests could bypass it. In practice, direct access requires being on the host machine.

## Known Limitations

- **No CSRF protection.** Forms rely on SameSite=Lax cookies. Modern browsers block cross-origin POST with SameSite=Lax, but older browsers may not.
- **Rate limiter is in-memory.** Resets on server restart. Not shared across instances (not relevant for single-instance deployment).
- **MCP auth is shared secret, not per-client.** All MCP clients use the same key. No per-client permissions or audit trail.
- **No encryption at rest.** PostgreSQL data is stored unencrypted on disk. Relies on OS-level disk encryption (LUKS, FileVault, etc.).
- **JWT secret rotation requires manual cookie invalidation.** Changing `ADMIN_JWT_SECRET` invalidates all sessions immediately (tokens can't be verified with the old key).
- **Config editor writes are not atomic.** A crash during `.env` write could leave a partial file. Mitigated by the file being small and writes being fast.

## Recommendations for Contributors

- Do not add `--allow-all` to the Deno command. Keep permissions scoped.
- Do not mount the Docker socket directly into the mcp-server container.
- Do not add web-based user registration. Keep user creation as a CLI-only operation.
- Do not store secrets in the database. Keep them in `.env` only.
- If adding new config keys, add them to `CONFIG_SCHEMA` in `mod.ts` with appropriate `secret: true/false`.
- If adding new Docker operations, update the proxy environment to allow only what's needed.
