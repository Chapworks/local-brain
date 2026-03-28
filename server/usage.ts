/**
 * AI API usage tracking and cost estimation.
 *
 * Wraps embedding and chat API calls to capture token counts
 * and estimated costs from provider responses.
 */

import type { Pool } from "postgres";

// --- Cost rates per 1M tokens (as of early 2026, approximate) ---
// These are rough defaults. Users can set COST_OVERRIDES in env if needed.
const DEFAULT_RATES: Record<string, { input: number; output: number }> = {
  // OpenAI embeddings
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "openai/text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "openai/text-embedding-3-large": { input: 0.13, output: 0 },
  // OpenAI chat
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "openai/gpt-4o": { input: 2.50, output: 10.00 },
  // Anthropic
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-sonnet-4-5-20250929": { input: 3.00, output: 15.00 },
};

interface UsageRecord {
  userId: number | null;
  operation: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

/** Estimate cost from token counts and model name. */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = DEFAULT_RATES[model];
  if (!rates) return 0;
  return (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000;
}

/** Extract usage data from an OpenAI-format API response body. */
export function extractOpenAIUsage(
  responseBody: Record<string, unknown>,
  model: string,
  operation: string
): Omit<UsageRecord, "userId"> | null {
  const usage = responseBody.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;
  if (!usage) return null;

  const promptTokens = usage.prompt_tokens || usage.total_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;

  return {
    operation,
    model,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(model, promptTokens, completionTokens),
  };
}

/** Extract usage data from an Anthropic-format API response body. */
export function extractAnthropicUsage(
  responseBody: Record<string, unknown>,
  model: string,
  operation: string
): Omit<UsageRecord, "userId"> | null {
  const usage = responseBody.usage as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  if (!usage) return null;

  const promptTokens = usage.input_tokens || 0;
  const completionTokens = usage.output_tokens || 0;

  return {
    operation,
    model,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(model, promptTokens, completionTokens),
  };
}

/** Log a usage record to the database. */
export async function logUsage(
  pool: Pool,
  record: UsageRecord
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryObject(
      `INSERT INTO api_usage (user_id, operation, model, prompt_tokens, completion_tokens, estimated_cost)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        record.userId,
        record.operation,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.estimatedCost,
      ]
    );
  } finally {
    client.release();
  }
}

/** Query usage stats for the admin panel or MCP tool. */
export interface UsageSummary {
  totalCost: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  byOperation: { operation: string; requests: number; cost: number }[];
  byModel: { model: string; requests: number; cost: number }[];
  byDay: { day: string; requests: number; cost: number }[];
}

export async function getUsageSummary(
  pool: Pool,
  opts: {
    userId?: number | null;
    days?: number;
  } = {}
): Promise<UsageSummary> {
  const client = await pool.connect();
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (opts.userId !== undefined) {
      if (opts.userId === null) {
        conditions.push("user_id IS NULL");
      } else {
        conditions.push(`user_id = $${paramIdx}`);
        params.push(opts.userId);
        paramIdx++;
      }
    }

    if (opts.days) {
      conditions.push(`created_at >= NOW() - INTERVAL '${opts.days} days'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Totals
    const totalsResult = await client.queryObject<{
      total_cost: number;
      total_prompt: number;
      total_completion: number;
      total_requests: number;
    }>(
      `SELECT
        COALESCE(SUM(estimated_cost), 0)::numeric AS total_cost,
        COALESCE(SUM(prompt_tokens), 0)::int AS total_prompt,
        COALESCE(SUM(completion_tokens), 0)::int AS total_completion,
        COUNT(*)::int AS total_requests
       FROM api_usage ${where}`,
      params
    );

    const totals = totalsResult.rows[0] || {
      total_cost: 0,
      total_prompt: 0,
      total_completion: 0,
      total_requests: 0,
    };

    // By operation
    const byOpResult = await client.queryObject<{
      operation: string;
      requests: number;
      cost: number;
    }>(
      `SELECT operation,
              COUNT(*)::int AS requests,
              COALESCE(SUM(estimated_cost), 0)::numeric AS cost
       FROM api_usage ${where}
       GROUP BY operation
       ORDER BY cost DESC`,
      params
    );

    // By model
    const byModelResult = await client.queryObject<{
      model: string;
      requests: number;
      cost: number;
    }>(
      `SELECT model,
              COUNT(*)::int AS requests,
              COALESCE(SUM(estimated_cost), 0)::numeric AS cost
       FROM api_usage ${where}
       GROUP BY model
       ORDER BY cost DESC`,
      params
    );

    // By day (last 30 days max)
    const byDayResult = await client.queryObject<{
      day: string;
      requests: number;
      cost: number;
    }>(
      `SELECT DATE(created_at)::text AS day,
              COUNT(*)::int AS requests,
              COALESCE(SUM(estimated_cost), 0)::numeric AS cost
       FROM api_usage ${where}
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT 30`,
      params
    );

    return {
      totalCost: Number(totals.total_cost),
      totalPromptTokens: totals.total_prompt,
      totalCompletionTokens: totals.total_completion,
      totalRequests: totals.total_requests,
      byOperation: byOpResult.rows.map((r) => ({
        ...r,
        cost: Number(r.cost),
      })),
      byModel: byModelResult.rows.map((r) => ({
        ...r,
        cost: Number(r.cost),
      })),
      byDay: byDayResult.rows.map((r) => ({
        ...r,
        cost: Number(r.cost),
      })),
    };
  } finally {
    client.release();
  }
}
