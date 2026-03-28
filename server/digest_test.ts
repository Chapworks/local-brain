import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatDigest } from "./digest.ts";

// --- formatDigest ---

Deno.test("formatDigest — full data produces complete output", () => {
  const data = {
    user_name: "Nick",
    period: "Last 24 hours",
    total_thoughts: 12,
    types: { observation: 5, idea: 4, task: 3 },
    top_topics: [["ai", 6], ["productivity", 3]] as [string, number][],
    people_mentioned: ["Sarah", "Jake"],
    action_items: ["Review PR", "Send invoice"],
    sample_thoughts: ["First thought here", "Second thought here"],
  };

  const result = formatDigest(data);

  // Header
  assertEquals(result.includes("Local Brain Digest — Nick"), true);
  assertEquals(result.includes("Period: Last 24 hours"), true);
  assertEquals(result.includes("Total new thoughts: 12"), true);

  // Types
  assertEquals(result.includes("observation: 5"), true);
  assertEquals(result.includes("idea: 4"), true);
  assertEquals(result.includes("task: 3"), true);

  // Topics
  assertEquals(result.includes("ai: 6"), true);
  assertEquals(result.includes("productivity: 3"), true);

  // People
  assertEquals(result.includes("People mentioned: Sarah, Jake"), true);

  // Action items
  assertEquals(result.includes("• Review PR"), true);
  assertEquals(result.includes("• Send invoice"), true);

  // Sample thoughts
  assertEquals(result.includes("— First thought here"), true);
  assertEquals(result.includes("— Second thought here"), true);
});

Deno.test("formatDigest — empty data (no thoughts)", () => {
  const data = {
    user_name: "TestUser",
    period: "Last 7 days",
    total_thoughts: 0,
    types: {},
    top_topics: [] as [string, number][],
    people_mentioned: [],
    action_items: [],
    sample_thoughts: [],
  };

  const result = formatDigest(data);

  assertEquals(result.includes("TestUser"), true);
  assertEquals(result.includes("Total new thoughts: 0"), true);
  // Should NOT include section headers for empty sections
  assertEquals(result.includes("Types:"), false);
  assertEquals(result.includes("Top topics:"), false);
  assertEquals(result.includes("People mentioned:"), false);
  assertEquals(result.includes("Open action items:"), false);
  assertEquals(result.includes("Recent thoughts:"), false);
});

Deno.test("formatDigest — partial data (types only)", () => {
  const data = {
    user_name: "Partial",
    period: "Last 24 hours",
    total_thoughts: 3,
    types: { idea: 3 },
    top_topics: [] as [string, number][],
    people_mentioned: [],
    action_items: [],
    sample_thoughts: [],
  };

  const result = formatDigest(data);
  assertEquals(result.includes("Types:"), true);
  assertEquals(result.includes("idea: 3"), true);
  assertEquals(result.includes("Top topics:"), false);
});

Deno.test("formatDigest — weekly period string", () => {
  const data = {
    user_name: "Weekly",
    period: "Last 7 days",
    total_thoughts: 42,
    types: {},
    top_topics: [] as [string, number][],
    people_mentioned: [],
    action_items: [],
    sample_thoughts: [],
  };

  const result = formatDigest(data);
  assertEquals(result.includes("Period: Last 7 days"), true);
});

Deno.test("formatDigest — long sample thoughts get ellipsis", () => {
  const longThought = "x".repeat(200);
  const data = {
    user_name: "Test",
    period: "Last 24 hours",
    total_thoughts: 1,
    types: {},
    top_topics: [] as [string, number][],
    people_mentioned: [],
    action_items: [],
    sample_thoughts: [longThought],
  };

  const result = formatDigest(data);
  assertEquals(result.includes("..."), true);
});

Deno.test("formatDigest — short sample thoughts have no ellipsis", () => {
  const data = {
    user_name: "Test",
    period: "Last 24 hours",
    total_thoughts: 1,
    types: {},
    top_topics: [] as [string, number][],
    people_mentioned: [],
    action_items: [],
    sample_thoughts: ["Short thought"],
  };

  const result = formatDigest(data);
  assertEquals(result.includes("— Short thought"), true);
  // The "..." should NOT appear after the short thought
  const lines = result.split("\n");
  const thoughtLine = lines.find((l) => l.includes("Short thought"));
  assertEquals(thoughtLine!.endsWith("..."), false);
});

Deno.test("formatDigest — multiple action items", () => {
  const data = {
    user_name: "Test",
    period: "Last 24 hours",
    total_thoughts: 5,
    types: {},
    top_topics: [] as [string, number][],
    people_mentioned: [],
    action_items: ["Task A", "Task B", "Task C"],
    sample_thoughts: [],
  };

  const result = formatDigest(data);
  assertEquals(result.includes("Open action items:"), true);
  assertEquals(result.includes("• Task A"), true);
  assertEquals(result.includes("• Task B"), true);
  assertEquals(result.includes("• Task C"), true);
});
