# The Journey — From Question to Open Source, Without Touching a Computer

This file tracks the story of building and releasing Local Brain — a self-hosted Open Brain fork — entirely from a phone via Claudegram (a Telegram bot running Claude Code). No laptop, no desktop, no IDE. Just a phone and an AI agent.

---

## The Thesis

Can you go from a casual question to a shipped open source product without ever touching a computer? What does that workflow look like? Where does it break? What does it reveal about AI-assisted development in 2026?

---

## Timeline

### March 28, 2026

**The spark.** Nick is working on band lore for Until The Day Is Over — building out characters, backstory, and release logistics — all from his phone via Claudegram. Mid-conversation, he asks about "Claude Remote" — something he heard was replacing Claudegram. Claude researches it and finds Remote Control, an official Claude Code feature.

**The pivot.** Nick mentions Nate B. Jones talks about connecting to "Open Brain" on MCP. Sounds like a product. Claude researches it. Finds OB1 — an open-source personal knowledge/memory layer that any AI tool can read from and write to via MCP. Uses Supabase cloud, PostgreSQL + pgvector, OpenRouter for embeddings.

**The question that changed everything.** Nick asks: "Do you have enough information to help me install the whole stack on my own Linode VM?" Then: "I don't mind how complex things are to set up, since you will be helping me. What I care about is the complexity and riskiness of maintenance."

**The deep dive.** Claude clones the OB1 repo, reads the entire codebase (~430 lines of server code, 5 pinned dependencies), finds a Kubernetes self-hosted variant that already stripped out Supabase. Assesses every dependency for maintenance risk. Conclusion: PostgreSQL is battle-tested, the MCP SDK is the only moderate risk, and the whole thing is remarkably simple.

**The fork begins.** Nick says to create it in the chapworks products folder. Claude builds the full project:
- Docker Compose with three services (PostgreSQL + pgvector, Deno MCP server, Caddy reverse proxy)
- Database schema (init.sql)
- Environment config template
- Setup guide
- Maintenance risk assessment
- Four home-hosting options documented (Cloudflare Tunnel, Tailscale, port forwarding, hybrid Linode relay)

**Home hosting decision.** Nick wants to run this on a computer in his house, accessible from the internet. Claude documents four approaches. Nick chooses Cloudflare Tunnel — no ports to open, home IP never exposed, free tier.

**The name.** Nick suggests "Local Brain" — Open Brain is cloud-first, Local Brain is yours-first. The name is the differentiation.

**Cloudflare Tunnel.** Nick chooses Option 1. Claude writes the full Cloudflare Tunnel setup guide and a modified docker-compose.yml replacing Caddy with cloudflared.

**This file is created.** Nick wants to track the journey from question to open source release, all done from his phone. The constraint is the story.

**Licensing.** Nick asks if forking is the right technique. Claude reads the FSL-1.1-MIT license and finds a Competing Use restriction — can't sell it or offer as a hosted service, but free open source release is clearly permitted. MIT conversion happens automatically in 2028. Claude adds the full upstream license to the repo, adds MIT license for Chapworks original additions, adds attribution headers to the server code, and creates an internal licensing spec (`foundation/local-brain-licensing-spec.md`) with plain-language rights and restrictions.

**Renamed everything.** Project folder, database, MCP server name, Docker Compose, all docs — everything now says Local Brain. Caddyfile removed since Cloudflare Tunnel is the chosen approach.

**Deployment target chosen.** Local Linux computer in Nick's house, accessible via Cloudflare Tunnel. All of this decided and built from a phone.

**Multi-provider AI support.** Nick asks: can we let users choose their own AI providers instead of being locked to OpenRouter? Claude adds a `CHAT_API_FORMAT` env var and rewrites the server to support both OpenAI-compatible APIs and the Anthropic API natively. The `.env.example` now documents four clear options: (A) OpenRouter for everything, (B) OpenAI direct, (C) OpenAI embeddings + Claude for metadata, (D) OpenRouter embeddings + Claude for metadata. Users pick one, uncomment it, done. No code changes needed — just environment variables.

**Doc consistency pass.** The conversation hit a context limit mid-task. Claude resumed in a new session, picked up exactly where it left off, and synced the `CHAT_API_FORMAT` env var into the CLOUDFLARE-TUNNEL.md embedded docker-compose example. This is the first time the project spanned multiple Claudegram sessions — a natural consequence of building something real from a phone. The context window is the constraint, not the phone.

**Admin panel.** Nick says "let's get crazy" — he wants a full web admin UI. Requirements: configuration wizard, database browser with filtering, Docker container logs, service restarts, OAuth protection, dual access mode (localhost vs remote). Claude plans the architecture (same Deno + Hono stack, server-rendered JSX, no React, no build step), then builds the entire thing:

- `server/admin/` module with auth (bcrypt + JWT), middleware (access mode guard + session check), and five pages (login, dashboard, thoughts browser, config editor, log viewer)
- Docker socket proxy (`tecnativa/docker-socket-proxy`) as a 4th container — never mounts the raw socket into the app server
- CLI user management script (`scripts/create-user.ts`) — no web-based registration, no attack surface
- Login rate limiting (5 attempts/IP/minute)
- Config editor reads/writes the actual `.env` file with secrets masked in the UI
- Health check endpoint at `/health`
- All docs updated: README, CLOUDFLARE-TUNNEL.md, new ADMIN.md

The admin panel adds zero new external UI frameworks. Hono JSX renders everything server-side. CSS is inline in the layout component. The only new dependencies are `bcrypt` and `jose` — both mature, both zero-dependency.

**GitHub repo goes live.** Nick authenticates `gh` CLI (the one concession — auth setup isn't building). Claude creates the repo (`Chapworks/local-brain`), initializes git inside the product folder, commits 25 files / 2,921 lines, and pushes. Then clones to `../local-brain` as its own repo and removes the code from the chapworks monorepo. Updates `CLAUDE.md` references to point to the new standalone repo.

**Prerequisites and system requirements.** Nick points out that the setup guide assumes too much. Claude adds full prerequisites to the README: OS support (Linux, macOS, Windows/WSL2), kernel requirements, hardware specs (minimum: RPi 4+, 1GB RAM; recommended: 2GB+, SSD), software (Git, Docker 20.10+, openssl, curl), and external accounts needed. SETUP.md gets rewritten with a pre-flight checklist, `git clone` step, admin user creation, localhost-only path, and troubleshooting section.

**Cloud hosting.** Nick asks: what if someone wants to run this on a cloud VM instead of at home? Claude builds a complete parallel deployment path: `docker-compose.cloud.yml` (swaps Cloudflare Tunnel for Caddy reverse proxy), `Caddyfile`, and `CLOUD-HOSTING.md` with VM hardening (UFW firewall, SSH lockdown), Docker install, DNS setup, Let's Encrypt auto-HTTPS, security checklist, and cost estimate ($5-12/month). The README gets restructured with side-by-side hosting options.

**Specs (vibe coded, then documented).** Nick says "we vibe coded this" — he wants specs written after the fact so contributors and AI agents can understand what was built. Claude creates five spec files in `specs/`: architecture (system diagram, services, routing, schema, file tree), MCP tools (all 4 tools with inputs/outputs, metadata extraction, API formats), admin panel (pages, auth flow, rate limiting, Docker proxy, design decisions), environment (all env vars with defaults and provider patterns), and security (threat model, auth layers, permissions, known limitations). Every spec describes what IS, not what was planned.

**Contributing guide.** Nick asks whether repos normally invite PRs in the README — they do, but you have to say it. Claude writes `CONTRIBUTING.md` with design principles (minimal deps, no build step, server-rendered, scoped permissions, no telemetry), PR guidelines, "good first contributions" list, explicit welcome for AI-assisted contributions, and a clear "won't accept" list. The README gets Specs and Contributing sections.

**Architecture diagrams.** Nick wants visual diagrams that render on GitHub. Claude creates two SVG files: home install (Cloudflare Tunnel, green network boundary, 4 containers, outbound-only tunnel, localhost access path) and cloud install (Caddy, UFW firewall boundary, Let's Encrypt, exposed ports). Both are dark-themed, color-coded by concern, and embedded in the README via standard markdown image syntax.

**Roadmap brainstorm.** Nick asks for 5 feature suggestions. Claude proposes: (1) thought connections / graph view, (2) scheduled digests, (3) thought expiration and archiving, (4) import/export, (5) multi-user with isolated brains. All five are added to the roadmap.

---

## Key Decisions

- **Skip Supabase entirely.** Self-host PostgreSQL + pgvector directly. The OB1 K8s variant already did the hard work of replacing Supabase client calls with raw SQL.
- **Cloudflare Tunnel for home hosting.** No router configuration, no exposed IP, free, simple.
- **Docker Compose for orchestration.** Three containers: database, MCP server, reverse proxy. Simple to start, stop, back up, and update.
- **Fork, don't just install.** Nick wants to release this as a self-hosted option for others. The cloud-first approach of the original OB1 is a barrier for people who want to own their data.
- **Multi-provider, not single-vendor.** Users choose their AI providers via env vars. Support OpenAI-compatible APIs (OpenRouter, OpenAI direct) and Anthropic API natively. No vendor lock-in.

---

## What's Been Built So Far

- `README.md` — project overview and architecture
- `docker-compose.yml` — three-service stack (PostgreSQL, MCP server, Cloudflare Tunnel)
- `init.sql` — database schema with vector search
- `server/index.ts` — MCP server (from OB1 K8s variant, attributed)
- `server/deno.json` — pinned dependencies
- `server/Dockerfile` — Deno container
- `.env.example` — secrets template with four AI provider options (OpenRouter, OpenAI, Claude, mixed)
- `.gitignore` — keeps .env out of git
- `LICENSE.md` — FSL-1.1-MIT (upstream) + MIT (our additions)
- `SETUP.md` — step-by-step installation
- `CLOUDFLARE-TUNNEL.md` — Cloudflare Tunnel setup guide
- `MAINTENANCE.md` — risk assessment
- `HOME-HOSTING.md` — four options for internet access from home
- `ADMIN.md` — admin panel setup and documentation
- `server/admin/auth.ts` — bcrypt + JWT authentication
- `server/admin/middleware.ts` — access mode guard + session check
- `server/admin/mod.ts` — admin Hono sub-app with all routes
- `server/admin/pages/layout.tsx` — shared HTML shell
- `server/admin/pages/login.tsx` — login form
- `server/admin/pages/dashboard.tsx` — stats overview + service health
- `server/admin/pages/thoughts.tsx` — paginated database browser
- `server/admin/pages/config.tsx` — configuration viewer/editor
- `server/admin/pages/logs.tsx` — Docker container log viewer
- `server/scripts/create-user.ts` — CLI admin user management
- `CONTRIBUTING.md` — contribution guidelines and design principles
- `CLOUD-HOSTING.md` — cloud VM hosting guide (Caddy + Let's Encrypt)
- `docker-compose.cloud.yml` — cloud deployment (Caddy instead of tunnel)
- `Caddyfile` — reverse proxy config for cloud hosting
- `docs/architecture-home.svg` — home install architecture diagram
- `docs/architecture-cloud.svg` — cloud install architecture diagram
- `specs/architecture.md` — system architecture spec
- `specs/mcp-tools.md` — MCP tools spec
- `specs/admin-panel.md` — admin panel spec
- `specs/environment.md` — environment variables spec
- `specs/security.md` — security spec
- `server/admin/pages/graph.tsx` — thought connections force-directed graph
- `server/admin/pages/users.tsx` — brain user management
- `server/admin/pages/import-export.tsx` — import/export with multi-format parsing
- `server/admin/pages/digests.tsx` — scheduled digest configuration
- `server/admin/pages/usage.tsx` — AI cost tracking with bar charts
- `server/admin/pages/backups.tsx` — backup inventory with cloud sync status
- `server/digest.ts` — scheduled digest generation and webhook delivery
- `server/import-parsers.ts` — JSON, Markdown, CSV import parsing
- `server/usage.ts` — AI API cost tracking and estimation
- `server/user-scope.ts` — per-user query scoping for multi-user isolation
- `server/notifications.ts` — notification system with backup health checks
- `scripts/backup.sh` — 3-stage backup pipeline (dump, encrypt, cloud sync)
- `scripts/restore.sh` — backup restoration with auto-download and decryption
- `scripts/Dockerfile.backup` — custom backup container (PostgreSQL + rclone + GPG)
- `scripts/create-brain-user.ts` — CLI brain user creation with bcrypt key hashing
- `migrations/` — incremental database schema migrations
- `BACKUPS.md` — backup and restore guide (local, encrypted, cloud)
- `JOURNEY.md` — this file

---

## What's Next

- [x] Set up Cloudflare Tunnel configuration
- [x] Decide on a name for the fork — **Local Brain**
- [x] Licensing — FSL-1.1-MIT upstream + MIT for our additions
- [x] All deployment files created
- [x] Multi-provider AI support (OpenAI-compatible + Anthropic API)
- [x] Admin web panel (dashboard, thoughts browser, config, logs, restarts)
- [x] Auth system (bcrypt + JWT, CLI user management, rate limiting)
- [x] Docker socket proxy for safe container operations
- [x] Public GitHub repo — github.com/Chapworks/local-brain
- [x] Prerequisites and system requirements documented
- [x] Cloud VM hosting guide with Caddy + Let's Encrypt
- [x] Specs (architecture, MCP tools, admin panel, environment, security)
- [x] Contributing guide and PR invitation
- [x] Architecture diagrams (home + cloud SVGs, embedded in README)
- [ ] Set up the Linux host (Docker, Docker Compose)
- [ ] Create Cloudflare Tunnel (or Caddy for cloud)
- [ ] Create `.env` with real credentials
- [ ] `docker compose up -d` — first boot
- [ ] Test all four MCP tools (capture, search, list, stats)
- [ ] Connect Claude Code as MCP client
- [ ] Write a Ship With Intent post about the journey
- [ ] Release

### Roadmap — Future Features

- [x] **Thought connections / graph view** — auto-link each thought to its 3 most similar existing thoughts by embedding distance. Admin panel gets a force-directed graph visualization showing clusters of related ideas.
- [x] **Scheduled digests** — daily/weekly summary of captured thoughts via webhook. Top topics, open action items, people mentioned. Runs as a Deno.cron job inside the container.
- [x] **Thought expiration and archiving** — optional TTL per thought. Scratch thoughts auto-archive after a configurable period. Admin panel shows archive/TTL controls per thought. Keeps active dataset lean for faster search.
- [x] **Import/export** — import from JSON, Markdown, or CSV files. Export entire brain as JSON or markdown. The "no lock-in" feature. Admin panel has a dedicated page.
- [x] **Multi-user with isolated brains** — per-user namespaces, separate thoughts and embeddings, per-user MCP access keys via bcrypt-hashed keys with prefix lookup. Share one instance without seeing each other's data.
- [x] **AI cost tracking** — per-request token and cost logging for all embedding and metadata API calls. Admin panel shows costs by operation, model, and day with bar chart visualization.
- [x] **Automated backups** — scheduled pg_dump with gzip compression, optional GPG encryption, optional cloud sync via rclone. Supports Backblaze B2, Cloudflare R2, S3, and any rclone-compatible provider. Admin panel shows backup inventory with per-file cloud sync status.
- [x] **Notification system** — persistent notification bar across all admin pages. Backup health checks run every 6 hours and create warnings for missing encryption or off-site storage. Notifications are dismissable per-user with deduplication by source and title.

### Roadmap — What's Left

- [ ] **Multi-user with isolated brains (phase 2)** — admin UI for creating brain users (currently CLI-only)
- [ ] **Thought connections graph (phase 2)** — similarity threshold tuning, cluster labeling, time-based filtering

---

## Operational Awareness

Nick has built systems like this before. He knows how they degrade.

The pattern is always the same: someone sets up backups once, confirms they run, and never checks again. Six months later the disk fills up, the cron job silently fails, the encryption key gets rotated without re-encrypting old backups, or the cloud credentials expire. The system looks healthy from the outside. The backups are worthless.

This is why Local Brain doesn't just have a backup script — it has a backup page in the admin panel that shows every backup file, its size, its date, whether it's encrypted, and whether it made it to the cloud. You can see at a glance if something is wrong. You don't have to SSH into the machine and run `ls -la /backups` to find out.

And that's why there's a notification system. The server checks backup health every 6 hours. If encryption isn't enabled, you get a warning. If off-site storage isn't configured, you get a warning. The notification bar appears on every admin page until you dismiss it or fix the problem. You can't miss it.

The philosophy: **if it's not visible, it's not working.** A backup that nobody monitors is a backup that will fail when you need it. A health check that doesn't surface its results is a health check that doesn't exist. The admin panel isn't just a dashboard — it's the mechanism that keeps the system honest over time.

This matters more for self-hosted software than for anything else. There's no ops team. There's no PagerDuty. There's just you and a machine in your house. The software has to tell you when something needs attention, because nobody else will.

---

## Notes for the Story

- This whole project started because Nick was doing band work (Until The Day Is Over) and casually asked about a tool he'd heard about. The conversation went: band lore → Claude Remote → Open Brain → "can I self-host this?" → "can I release this as open source?" — all in one session, all from a phone.
- The irony: Nick is building a memory system for AI tools while using an AI tool that has its own memory system (MEMORY.md files in the chapworks repo). The self-hosted version is the more ambitious version of what he's already doing.
- The constraint (phone only, no computer) isn't a limitation — it's the proof of concept. If you can build and ship a product this way, that says something about where AI-assisted development is heading.
- Claudegram is the tool being used to build the thing that might eventually replace the need for Claudegram. There's a recursion to this.
- Nick's instinct to ask about maintenance risk before setup complexity reveals his priorities: he's not impressed by getting something running once. He wants to know if it'll still be running in a year without babysitting.
- The project hit its first context window boundary during the multi-provider work. Claude picked up seamlessly in a new session using a conversation summary. This is worth noting: the AI doing the building has its own memory limitations, and the workaround (context summaries, persistent files) mirrors the exact problem Local Brain is trying to solve for users. The tool and the product share the same constraint.
- "Let's get crazy" — Nick's request for an admin panel led to a full web UI being built without touching a framework installer, a package manager, or a build tool. The entire admin panel is server-rendered JSX that Deno compiles at runtime. The CSS is inline. There is no `node_modules`, no `npm install`, no webpack, no vite. Just files that run. This is what minimal dependency looks like when an AI writes the code from a phone.
- Nick is outside working on the trailer while all of this is happening. He's multitasking — physical work with his hands, product development on his phone between tasks. The mental model here isn't "sitting at a desk building software." It's "having a conversation with an AI that happens to produce a deployable product." The barrier to building isn't access to a computer. It's having the idea and knowing what to ask for.
- The project went from "what is Open Brain?" to a public GitHub repo with architecture diagrams, five spec files, a contributing guide, two deployment paths, and a roadmap — in a single day, from a phone, while working on a trailer. The commit history tells the story: 7 commits, each one a coherent step forward. No false starts, no reverts. The AI maintained the thread across context boundaries and sessions.
- "We vibe coded this" — Nick's framing is honest and deliberate. The specs came after the code. This is the opposite of traditional software engineering, and it worked. The specs exist to help the next person (or AI) understand what was built, not to justify what was planned. That's a different kind of documentation.
