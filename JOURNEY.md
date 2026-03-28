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
- [ ] Set up the Linux host (Docker, Docker Compose)
- [ ] Create Cloudflare Tunnel
- [ ] Create `.env` with real credentials
- [ ] `docker compose up -d` — first boot
- [ ] Test all four MCP tools (capture, search, list, stats)
- [ ] Connect Claude Code as MCP client
- [ ] Create a public GitHub repo
- [ ] Write a Ship With Intent post about the journey
- [ ] Release

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
