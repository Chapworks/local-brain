# Contributing to Local Brain

Pull requests are welcome. This project was built with AI assistance (Claude Code via Claudegram) and we're happy to receive contributions built the same way — or by hand.

## Before You Start

Read the specs in the `specs/` directory. They describe what exists and why:

- **[specs/architecture.md](specs/architecture.md)** — system architecture, services, request routing, database schema, file structure
- **[specs/mcp-tools.md](specs/mcp-tools.md)** — the four MCP tools, authentication, metadata extraction, API format support
- **[specs/admin-panel.md](specs/admin-panel.md)** — admin UI pages, auth flow, rate limiting, Docker proxy integration, design decisions
- **[specs/environment.md](specs/environment.md)** — all environment variables, defaults, provider configuration patterns
- **[specs/security.md](specs/security.md)** — threat model, authentication layers, permissions, known limitations

These specs were written after the code (we vibe coded it). They describe what was built, not what was planned. If the code and the spec disagree, the code is the source of truth — and the spec should be updated.

## Design Principles

These aren't rules, but they explain the decisions behind the code:

- **Minimal dependencies.** Every new dependency is a future maintenance risk. If Hono already does it, use Hono. If Deno's standard library does it, use that. Don't add a library for something that takes 20 lines to write.
- **No build step.** Deno runs TypeScript directly. Hono JSX compiles at runtime. There is no webpack, vite, or npm. Keep it that way.
- **Server-rendered UI.** The admin panel is HTML forms and server-rendered pages. No React, no Vue, no client-side framework. Client-side JS is acceptable for progressive enhancement (log auto-refresh, etc.) but the UI must work without it.
- **Scoped permissions.** Deno's permission flags are explicit. Don't add `--allow-all`. The Docker socket is proxied, not mounted. Config writes are scoped to one file.
- **Self-hosted means self-owned.** No phone-home, no telemetry, no external service calls except the user's chosen AI provider. The user's data stays on their machine.

## How to Contribute

### Good First Contributions

- Fix a bug you hit while setting up
- Improve error messages or documentation
- Add a new MCP tool (see `specs/mcp-tools.md` for the pattern)
- Add admin panel features (thought detail view, export, etc.)
- Improve the Docker Compose setup for specific platforms (ARM, NAS devices, etc.)

### Making Changes

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Make your changes
4. Update the relevant spec file in `specs/` if you changed behavior
5. Test locally with `docker compose up -d`
6. Submit a pull request

### PR Guidelines

- Keep PRs focused. One feature or fix per PR.
- If you're adding a new dependency, explain why in the PR description.
- If you changed the database schema, include a migration command for existing installations.
- If you added a new environment variable, add it to `.env.example` and `specs/environment.md`.
- If you changed security behavior, update `specs/security.md`.

### AI-Assisted Contributions

This project was built entirely by an AI agent (Claude Code) working from a phone. If you use AI tools to write your contributions, that's completely fine. Just make sure you understand what the code does before submitting. The specs exist to help both humans and AI tools understand the codebase.

If you're using Claude Code or similar tools, point them at the `specs/` directory first. The specs are designed to give AI agents enough context to make good changes without reading every file.

## What We Won't Accept

- Dependencies that require a build step (webpack, vite, etc.)
- Client-side JavaScript frameworks (React, Vue, Svelte, etc.)
- Telemetry, analytics, or any phone-home behavior
- Breaking changes to the MCP tool interface (these are consumed by AI clients)
- Web-based user registration (user management stays CLI-only for security)

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project (see [LICENSE.md](LICENSE.md)). Original OB1 code is FSL-1.1-MIT; our additions are MIT.
