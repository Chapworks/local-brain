import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseJSON,
  parseMarkdown,
  parseCSV,
  parseImport,
} from "./import-parsers.ts";

// --- parseJSON ---

Deno.test("parseJSON — array of thoughts", () => {
  const input = JSON.stringify([
    { content: "First thought" },
    { content: "Second thought", metadata: { type: "idea" } },
  ]);
  const result = parseJSON(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].content, "First thought");
  assertEquals(result[1].metadata, { type: "idea" });
});

Deno.test("parseJSON — wrapped { thoughts: [] } format", () => {
  const input = JSON.stringify({
    thoughts: [{ content: "Wrapped thought" }],
  });
  const result = parseJSON(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "Wrapped thought");
});

Deno.test("parseJSON — filters empty content", () => {
  const input = JSON.stringify([
    { content: "Valid" },
    { content: "" },
    { content: "   " },
  ]);
  const result = parseJSON(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "Valid");
});

Deno.test("parseJSON — empty array", () => {
  assertEquals(parseJSON("[]"), []);
});

Deno.test("parseJSON — throws on invalid JSON", () => {
  assertThrows(() => parseJSON("not json"));
});

Deno.test("parseJSON — items without content field get empty string", () => {
  const input = JSON.stringify([{ title: "no content field" }]);
  const result = parseJSON(input);
  assertEquals(result.length, 0); // empty string filtered out
});

// --- parseMarkdown ---

Deno.test("parseMarkdown — splits on headings", () => {
  const input = `# Heading One
Some text under heading one.

## Heading Two
Text under heading two.`;
  const result = parseMarkdown(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].content, "Heading One\nSome text under heading one.");
  assertEquals(result[1].content, "Heading Two\nText under heading two.");
});

Deno.test("parseMarkdown — splits on horizontal rules", () => {
  const input = `First section content.

---

Second section content.`;
  const result = parseMarkdown(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].content, "First section content.");
  assertEquals(result[1].content, "Second section content.");
});

Deno.test("parseMarkdown — splits on *** horizontal rules", () => {
  const input = `Part A.

***

Part B.`;
  const result = parseMarkdown(input);
  assertEquals(result.length, 2);
});

Deno.test("parseMarkdown — splits on double blank lines", () => {
  const input = `Paragraph one about something.


Paragraph two about something else.`;
  const result = parseMarkdown(input);
  assertEquals(result.length, 2);
});

Deno.test("parseMarkdown — single paragraph stays as one thought", () => {
  const input = `Just one paragraph.
With multiple lines.
But no separators.`;
  const result = parseMarkdown(input);
  assertEquals(result.length, 1);
});

Deno.test("parseMarkdown — empty input", () => {
  assertEquals(parseMarkdown(""), []);
});

Deno.test("parseMarkdown — ### headings work", () => {
  const input = `### Small heading
Content here.`;
  const result = parseMarkdown(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "Small heading\nContent here.");
});

// --- parseCSV ---

Deno.test("parseCSV — basic content column", () => {
  const input = `content
First thought
Second thought`;
  const result = parseCSV(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].content, "First thought");
  assertEquals(result[1].content, "Second thought");
});

Deno.test("parseCSV — with type and topics columns", () => {
  const input = `content,type,topics
My idea,idea,ai;productivity
A task,task,work`;
  const result = parseCSV(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].metadata, { type: "idea", topics: ["ai", "productivity"] });
  assertEquals(result[1].metadata, { type: "task", topics: ["work"] });
});

Deno.test("parseCSV — quoted fields with commas", () => {
  const input = `content,type
"Hello, world",observation`;
  const result = parseCSV(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "Hello, world");
});

Deno.test("parseCSV — escaped quotes inside quoted fields", () => {
  const input = `content
"He said ""hello""."`;
  const result = parseCSV(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].content, 'He said "hello".');
});

Deno.test("parseCSV — throws if no content column", () => {
  const input = `title,type
Something,idea`;
  assertThrows(() => parseCSV(input), Error, 'CSV must have a "content" column.');
});

Deno.test("parseCSV — skips rows with empty content", () => {
  const input = `content,type
Valid,idea
,task
Also valid,observation`;
  const result = parseCSV(input);
  assertEquals(result.length, 2);
});

Deno.test("parseCSV — header-only (no data rows)", () => {
  assertEquals(parseCSV("content"), []);
});

Deno.test("parseCSV — empty input", () => {
  assertEquals(parseCSV(""), []);
});

Deno.test("parseCSV — no metadata when type and topics are absent", () => {
  const input = `content
Simple thought`;
  const result = parseCSV(input);
  assertEquals(result[0].metadata, undefined);
});

Deno.test("parseCSV — case-insensitive header matching", () => {
  const input = `Content,Type
My thought,idea`;
  const result = parseCSV(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "My thought");
});

// --- parseImport ---

Deno.test("parseImport — detects .json extension", () => {
  const input = JSON.stringify([{ content: "JSON file" }]);
  const result = parseImport(input, "notes.json");
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "JSON file");
});

Deno.test("parseImport — detects .csv extension", () => {
  const input = `content
CSV thought`;
  const result = parseImport(input, "data.csv");
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "CSV thought");
});

Deno.test("parseImport — detects .md extension", () => {
  const input = `# Heading
Content below heading.`;
  const result = parseImport(input, "notes.md");
  assertEquals(result.length, 1);
});

Deno.test("parseImport — detects .txt extension", () => {
  const input = `Some text.

---

More text.`;
  const result = parseImport(input, "notes.txt");
  assertEquals(result.length, 2);
});

Deno.test("parseImport — detects .markdown extension", () => {
  const result = parseImport("# Test\nContent.", "file.markdown");
  assertEquals(result.length, 1);
});

Deno.test("parseImport — unknown extension tries JSON first", () => {
  const input = JSON.stringify([{ content: "Mystery format" }]);
  const result = parseImport(input, "data.unknown");
  assertEquals(result.length, 1);
  assertEquals(result[0].content, "Mystery format");
});

Deno.test("parseImport — unknown extension falls back to markdown if JSON fails", () => {
  const input = `Not JSON content.

---

Second section.`;
  const result = parseImport(input, "file.xyz");
  assertEquals(result.length, 2);
});
