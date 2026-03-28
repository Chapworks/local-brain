import {
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  estimateCost,
  extractOpenAIUsage,
  extractAnthropicUsage,
} from "./usage.ts";

// --- estimateCost ---

Deno.test("estimateCost — text-embedding-3-small", () => {
  // $0.02 per 1M input tokens, $0 output
  const cost = estimateCost("text-embedding-3-small", 1_000_000, 0);
  assertAlmostEquals(cost, 0.02, 0.001);
});

Deno.test("estimateCost — gpt-4o-mini with both input and output", () => {
  // $0.15 per 1M input, $0.60 per 1M output
  const cost = estimateCost("gpt-4o-mini", 500, 200);
  const expected = (500 * 0.15 + 200 * 0.60) / 1_000_000;
  assertAlmostEquals(cost, expected, 1e-10);
});

Deno.test("estimateCost — gpt-4o", () => {
  const cost = estimateCost("gpt-4o", 1000, 500);
  const expected = (1000 * 2.50 + 500 * 10.00) / 1_000_000;
  assertAlmostEquals(cost, expected, 1e-10);
});

Deno.test("estimateCost — claude-sonnet-4-5 model", () => {
  const cost = estimateCost("claude-sonnet-4-5-20250929", 1000, 500);
  const expected = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
  assertAlmostEquals(cost, expected, 1e-10);
});

Deno.test("estimateCost — claude-haiku-4-5 model", () => {
  const cost = estimateCost("claude-haiku-4-5-20251001", 2000, 1000);
  const expected = (2000 * 0.80 + 1000 * 4.00) / 1_000_000;
  assertAlmostEquals(cost, expected, 1e-10);
});

Deno.test("estimateCost — OpenRouter-prefixed model", () => {
  const cost = estimateCost("openai/text-embedding-3-small", 1_000_000, 0);
  assertAlmostEquals(cost, 0.02, 0.001);
});

Deno.test("estimateCost — unknown model returns 0", () => {
  assertEquals(estimateCost("unknown-model-xyz", 1000, 500), 0);
});

Deno.test("estimateCost — zero tokens returns 0", () => {
  assertEquals(estimateCost("gpt-4o-mini", 0, 0), 0);
});

Deno.test("estimateCost — embedding model has zero output cost", () => {
  const cost = estimateCost("text-embedding-3-small", 1000, 9999);
  // Output tokens should not contribute since output rate is 0
  const expected = (1000 * 0.02) / 1_000_000;
  assertAlmostEquals(cost, expected, 1e-10);
});

// --- extractOpenAIUsage ---

Deno.test("extractOpenAIUsage — standard response with prompt and completion tokens", () => {
  const body = {
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };
  const result = extractOpenAIUsage(body, "gpt-4o-mini", "metadata");
  assertEquals(result!.operation, "metadata");
  assertEquals(result!.model, "gpt-4o-mini");
  assertEquals(result!.promptTokens, 100);
  assertEquals(result!.completionTokens, 50);
  // Verify cost is calculated
  const expected = (100 * 0.15 + 50 * 0.60) / 1_000_000;
  assertAlmostEquals(result!.estimatedCost, expected, 1e-10);
});

Deno.test("extractOpenAIUsage — embedding response with only total_tokens", () => {
  const body = {
    usage: {
      total_tokens: 42,
    },
  };
  const result = extractOpenAIUsage(body, "text-embedding-3-small", "embedding");
  assertEquals(result!.promptTokens, 42);
  assertEquals(result!.completionTokens, 0);
});

Deno.test("extractOpenAIUsage — missing usage object returns null", () => {
  const body = { data: [{ embedding: [0.1, 0.2] }] };
  assertEquals(extractOpenAIUsage(body, "gpt-4o-mini", "test"), null);
});

Deno.test("extractOpenAIUsage — empty usage object still works", () => {
  const body = { usage: {} };
  const result = extractOpenAIUsage(body, "gpt-4o-mini", "test");
  assertEquals(result!.promptTokens, 0);
  assertEquals(result!.completionTokens, 0);
});

Deno.test("extractOpenAIUsage — preserves operation string", () => {
  const body = { usage: { prompt_tokens: 10 } };
  const result = extractOpenAIUsage(body, "gpt-4o-mini", "embedding:search");
  assertEquals(result!.operation, "embedding:search");
});

// --- extractAnthropicUsage ---

Deno.test("extractAnthropicUsage — standard Anthropic response", () => {
  const body = {
    usage: {
      input_tokens: 200,
      output_tokens: 100,
    },
  };
  const result = extractAnthropicUsage(body, "claude-sonnet-4-5-20250929", "metadata");
  assertEquals(result!.operation, "metadata");
  assertEquals(result!.model, "claude-sonnet-4-5-20250929");
  assertEquals(result!.promptTokens, 200);
  assertEquals(result!.completionTokens, 100);
});

Deno.test("extractAnthropicUsage — missing usage returns null", () => {
  const body = { content: [{ text: "hello" }] };
  assertEquals(extractAnthropicUsage(body, "claude-sonnet-4-5-20250929", "test"), null);
});

Deno.test("extractAnthropicUsage — empty usage object", () => {
  const body = { usage: {} };
  const result = extractAnthropicUsage(body, "claude-sonnet-4-5-20250929", "metadata");
  assertEquals(result!.promptTokens, 0);
  assertEquals(result!.completionTokens, 0);
});

Deno.test("extractAnthropicUsage — cost estimation for known model", () => {
  const body = { usage: { input_tokens: 1000, output_tokens: 500 } };
  const result = extractAnthropicUsage(body, "claude-sonnet-4-5-20250929", "metadata");
  const expected = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
  assertAlmostEquals(result!.estimatedCost, expected, 1e-10);
});

Deno.test("extractAnthropicUsage — unknown model gives zero cost", () => {
  const body = { usage: { input_tokens: 1000, output_tokens: 500 } };
  const result = extractAnthropicUsage(body, "claude-unknown-99", "metadata");
  assertEquals(result!.estimatedCost, 0);
});
