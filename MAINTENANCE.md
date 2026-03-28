# Maintenance Risk Assessment

The central question: can I destroy everything in a year by running an update?

## Short Answer

No. The risky parts are protocol-layer (MCP SDK), not infrastructure. Your data lives in PostgreSQL, which has a 25+ year track record of backward compatibility. Everything else is pinned.

## Component-by-Component

### PostgreSQL + pgvector — Very Low Risk

PostgreSQL is one of the most mature databases in existence. Major version upgrades (16 → 17) require a migration step (`pg_upgrade`), but this is well-documented and reliable. Minor version updates (16.1 → 16.2) are drop-in replacements. pgvector follows the same model. Your data is safe.

**What could go wrong:** Forgetting to run `pg_upgrade` on a major version bump. Solution: don't upgrade PostgreSQL major versions unless you have a reason to. Pin the Docker image tag (e.g., `ankane/pgvector:pg16`) instead of using `latest`.

### Deno Runtime — Low Risk

Deno 2.x has been stable with good backward compatibility. The server uses standard APIs (fetch, env vars, TCP). Deno doesn't break these.

**What could go wrong:** A Deno 3.x release with breaking changes. Solution: pin the Deno version in the Dockerfile (currently `denoland/deno:2.3.3`).

### Cloudflare Tunnel — Very Low Risk

Cloudflare's tunnel client (`cloudflared`) is mature and well-maintained. The Docker image auto-updates when you pull. The tunnel reconnects automatically after outages.

**What could go wrong:** Cloudflare changes their tunnel API or deprecates the free tier. Both are unlikely — tunnels are core infrastructure for their Zero Trust product. If it ever happens, you can switch to Caddy + port forwarding (see HOME-HOSTING.md, Option 3).

### MCP SDK (`@modelcontextprotocol/sdk@1.24.3`) — Moderate Risk

This is the youngest dependency. The MCP protocol is still maturing and the SDK is actively developed. Breaking changes are possible as the spec evolves.

**What could go wrong:** A future version of Claude Code requires a newer MCP protocol version that's incompatible with 1.24.3. You'd need to update the SDK and potentially adjust the server code.

**Mitigation:** The version is pinned. Your server will keep working with current MCP clients indefinitely. You only need to update when you want to — and when you do, the changes should be small (the integration surface is ~30 lines).

### @hono/mcp (`0.1.1`) — Higher Risk (but Small Surface)

Pre-1.0 library. The API could change.

**What could go wrong:** The transport API changes in a future version. Solution: the integration is ~10 lines of code. Even a breaking change would take 15 minutes to fix.

### OpenRouter — Low Risk (but External Dependency)

OpenRouter is a proxy to various AI providers. If they go down or change pricing, you can switch to direct OpenAI API or even a local model (Ollama) by changing two env vars.

## The Dangerous Commands

Things that will actually destroy your data:

- `docker compose down -v` — the `-v` flag deletes volumes, including your PostgreSQL data. **Never use `-v` unless you mean it.**
- `docker volume rm pgdata` — same thing, more explicit
- Dropping the `thoughts` table in PostgreSQL

Everything else is recoverable. Containers can be rebuilt. Images can be re-pulled. Config can be re-applied. Only the data volume matters.

## Recommended Update Strategy

1. **Don't update unless something is broken.** Pinned versions mean your stack is frozen in a known-good state.
2. **When you do update:** change one thing at a time. Update the MCP SDK, test, then move on.
3. **Always back up before updating:** `pg_dump` takes seconds and saves everything.
4. **Pin your PostgreSQL Docker image** to a specific tag (e.g., `ankane/pgvector:pg16`) instead of `latest`.
5. **Test after any update** by running all four MCP tools: capture, search, list, stats.
