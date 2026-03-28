/**
 * Import parsers for various formats.
 *
 * Supported: JSON (Local Brain export), Markdown files, CSV.
 * Each parser returns an array of { content, metadata? } objects.
 */

export interface ImportedThought {
  content: string;
  metadata?: Record<string, unknown>;
}

/** Parse Local Brain JSON export format. */
export function parseJSON(text: string): ImportedThought[] {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : data.thoughts || [];

  return items.map((item: Record<string, unknown>) => ({
    content: String(item.content || ""),
    metadata: (item.metadata as Record<string, unknown>) || undefined,
  })).filter((t: ImportedThought) => t.content.trim().length > 0);
}

/** Parse Markdown — each heading or paragraph becomes a thought. */
export function parseMarkdown(text: string): ImportedThought[] {
  const thoughts: ImportedThought[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Headings start a new thought
    if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      if (current.trim()) {
        thoughts.push({ content: current.trim() });
      }
      current = trimmed.replace(/^#+\s*/, "") + "\n";
    } else if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      // Horizontal rules split thoughts
      if (current.trim()) {
        thoughts.push({ content: current.trim() });
      }
      current = "";
    } else if (trimmed === "") {
      // Double blank lines split thoughts
      if (current.endsWith("\n\n")) {
        if (current.trim()) {
          thoughts.push({ content: current.trim() });
        }
        current = "";
      } else {
        current += "\n";
      }
    } else {
      current += trimmed + "\n";
    }
  }

  if (current.trim()) {
    thoughts.push({ content: current.trim() });
  }

  return thoughts.filter((t) => t.content.length > 0);
}

/** Parse CSV — expects a "content" column, optional "type" and "topics" columns. */
export function parseCSV(text: string): ImportedThought[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const contentIdx = headers.indexOf("content");
  if (contentIdx === -1) {
    throw new Error('CSV must have a "content" column.');
  }

  const typeIdx = headers.indexOf("type");
  const topicsIdx = headers.indexOf("topics");

  const thoughts: ImportedThought[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const content = cols[contentIdx]?.trim();
    if (!content) continue;

    const metadata: Record<string, unknown> = {};
    if (typeIdx >= 0 && cols[typeIdx]?.trim()) {
      metadata.type = cols[typeIdx].trim();
    }
    if (topicsIdx >= 0 && cols[topicsIdx]?.trim()) {
      metadata.topics = cols[topicsIdx].split(";").map((t) => t.trim()).filter(Boolean);
    }

    thoughts.push({
      content,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }

  return thoughts;
}

/** Simple CSV line parser that handles quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/** Auto-detect format and parse. */
export function parseImport(text: string, filename: string): ImportedThought[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) return parseJSON(text);
  if (lower.endsWith(".csv")) return parseCSV(text);
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
    return parseMarkdown(text);
  }

  // Try JSON first, fall back to markdown
  try {
    return parseJSON(text);
  } catch {
    return parseMarkdown(text);
  }
}
