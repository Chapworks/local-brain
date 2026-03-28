# MCP Tools Spec

## Overview

Local Brain exposes nine MCP tools via the Streamable HTTP Transport protocol. All tools are registered on a single `McpServer` instance named `local-brain`. The version is read from the `VERSION` file at the repository root.

## Authentication

Every request to the MCP endpoint requires an access key, provided via:

- `x-brain-key` HTTP header, OR
- `key` query parameter (e.g., `?key=YOUR_KEY`)

Requests without a valid key receive `401 { error: "Invalid or missing access key" }`.

## Tools

### `capture_thought`

Saves a new thought. Generates an embedding and extracts metadata automatically.

**Input:**
- `content` (string, required) — the thought to capture

**Process:**
1. Calls embedding API and chat API in parallel (`Promise.all`)
2. Embedding API returns 1536-dimension vector
3. Chat API extracts metadata as JSON: `type`, `topics[]`, `people[]`, `action_items[]`, `dates_mentioned[]`
4. Inserts into `thoughts` table with content, embedding vector, and metadata (plus `source: "mcp"`)

**Output:** Confirmation string with type, topics, people, and action items.

**Error handling:** Returns `isError: true` with error message. Never throws.

### `search_thoughts`

Semantic search across all captured thoughts using vector similarity (cosine distance).

**Input:**
- `query` (string, required) — what to search for
- `limit` (number, optional, default: 10) — max results
- `threshold` (number, optional, default: 0.5) — minimum similarity score (0-1)

**Process:**
1. Converts query to embedding via embedding API
2. Runs vector similarity query: `1 - (embedding <=> query_embedding)`
3. Filters by threshold, orders by similarity, limits results

**Output:** Formatted results with similarity percentage, date, type, topics, people, action items, and full content. Or "No thoughts found" message.

### `list_thoughts`

Lists recent thoughts with optional metadata filters. Uses exact matching, not semantic search.

**Input:**
- `limit` (number, optional, default: 10)
- `type` (string, optional) — filter by metadata type: `observation`, `task`, `idea`, `reference`, `person_note`
- `topic` (string, optional) — filter by topic tag (JSONB `?` operator)
- `person` (string, optional) — filter by person mentioned (JSONB `?` operator)
- `days` (number, optional) — only thoughts from the last N days

**Process:** Builds dynamic SQL WHERE clause from provided filters. Orders by `created_at DESC`.

**Output:** Numbered list with date, type, topics, and content.

### `thought_stats`

Summary statistics across all captured thoughts.

**Input:** None.

**Process:** Queries all thoughts, aggregates metadata in memory.

**Output:**
- Total count
- Date range (earliest to latest)
- Types breakdown with counts
- Top 10 topics with counts
- People mentioned with counts
- Thought connections count

### `get_thought_connections`

Get connections between thoughts — find what's related to a specific thought, or browse the full connection graph.

**Input:**
- `thought_id` (number, optional) — get connections for a specific thought. If omitted, returns the top connections across all thoughts.
- `limit` (number, optional, default 50) — max connections to return

**Output:** List of connected thought pairs with similarity scores and content previews.

### `export_thoughts`

Export all thoughts as JSON or Markdown. The "no lock-in" feature.

**Input:**
- `format` (string, optional, default "json") — "json" or "markdown"
- `include_archived` (boolean, optional, default false)

**Output:** Full export of all thoughts with metadata.

### `archive_thought`

Archive or unarchive a thought. Archived thoughts are hidden from search and list but not deleted.

**Input:**
- `thought_id` (number, required)
- `unarchive` (boolean, optional, default false) — set to true to unarchive

**Output:** Confirmation message.

### `usage_stats`

Get AI API usage and cost statistics.

**Input:**
- `days` (number, optional, default 30) — look back this many days (0 = all time)

**Output:** Total cost, token counts, API calls broken down by operation, model, and day.

### `system_health`

Check the health of the Local Brain system. Designed for AI agents to monitor the system over time.

**Input:** None.

**Output:**
- Version (with update availability check against latest GitHub release)
- Database stats (active/archived thoughts, connections, brain users, database size)
- Backup status (schedule, encryption, cloud sync configuration)
- Active problems (errors and warnings from the notification system)
- Configuration summary (embedding model, chat model, API format)

## Metadata Extraction

The chat API receives a system prompt instructing it to extract structured metadata:

```
Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.
```

If metadata extraction fails (API error, invalid JSON), the fallback is:

```json
{ "topics": ["uncategorized"], "type": "observation" }
```

## API Format Support

### OpenAI-compatible (`CHAT_API_FORMAT=openai`)

- Endpoint: `{CHAT_API_BASE}/chat/completions`
- Auth: `Authorization: Bearer {CHAT_API_KEY}`
- Uses `response_format: { type: "json_object" }` for structured output
- Response path: `choices[0].message.content` (JSON string)

### Anthropic (`CHAT_API_FORMAT=anthropic`)

- Endpoint: `{CHAT_API_BASE}/messages`
- Auth: `x-api-key: {CHAT_API_KEY}`, `anthropic-version: 2023-06-01`
- System prompt appended with: "Respond with only valid JSON, no other text."
- Max tokens: 1024
- Response path: `content[0].text` (JSON string)

### Embeddings (always OpenAI-compatible)

- Endpoint: `{EMBEDDING_API_BASE}/embeddings`
- Auth: `Authorization: Bearer {EMBEDDING_API_KEY}`
- Response path: `data[0].embedding` (number array, 1536 dimensions)
