/** AI cost tracking page. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";
import type { UsageSummary } from "../../usage.ts";

interface Props {
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  summary: UsageSummary;
  filterDays: number;
  brainUsers: { id: number; name: string }[];
  filterUser: string;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const UsagePage: FC<Props> = ({
  user,
  isSuperuser,
  notifications,
  version,
  summary,
  filterDays,
  brainUsers,
  filterUser,
}) => (
  <Layout title="AI Costs" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">AI Costs</h1>

    <div class="card">
      <form method="GET" action="/admin/usage" style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:flex-end">
        <div class="form-group" style="min-width:7rem; margin-bottom:0">
          <label for="days">Time Range</label>
          <select id="days" name="days">
            <option value="7" selected={filterDays === 7}>Last 7 days</option>
            <option value="30" selected={filterDays === 30}>Last 30 days</option>
            <option value="90" selected={filterDays === 90}>Last 90 days</option>
            <option value="0" selected={filterDays === 0}>All time</option>
          </select>
        </div>
        <div class="form-group" style="min-width:7rem; margin-bottom:0">
          <label for="user_id">User</label>
          <select id="user_id" name="user_id">
            <option value="">All users</option>
            <option value="null" selected={filterUser === "null"}>Global</option>
            {brainUsers.map((bu) => (
              <option value={String(bu.id)} selected={filterUser === String(bu.id)}>
                {bu.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-bottom:0">Filter</button>
      </form>
    </div>

    <div class="grid grid-3">
      <div class="card stat">
        <div class="value">{formatCost(summary.totalCost)}</div>
        <div class="label">Total Cost</div>
      </div>
      <div class="card stat">
        <div class="value">{formatTokens(summary.totalPromptTokens + summary.totalCompletionTokens)}</div>
        <div class="label">Total Tokens</div>
      </div>
      <div class="card stat">
        <div class="value">{summary.totalRequests}</div>
        <div class="label">API Calls</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Cost by Operation</h2>
        {summary.byOperation.length === 0 ? (
          <p style="color:#94a3b8; font-size:0.875rem">No usage recorded yet.</p>
        ) : (
          <ul style="list-style:none; font-size:0.875rem">
            {summary.byOperation.map(({ operation, requests, cost }) => (
              <li style="display:flex; justify-content:space-between; padding:0.25rem 0; border-bottom:1px solid #334155">
                <span>{operation} <span style="color:#64748b">({requests})</span></span>
                <span style="color:#94a3b8">{formatCost(cost)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="card">
        <h2>Cost by Model</h2>
        {summary.byModel.length === 0 ? (
          <p style="color:#94a3b8; font-size:0.875rem">No usage recorded yet.</p>
        ) : (
          <ul style="list-style:none; font-size:0.875rem">
            {summary.byModel.map(({ model, requests, cost }) => (
              <li style="display:flex; justify-content:space-between; padding:0.25rem 0; border-bottom:1px solid #334155">
                <span>{model} <span style="color:#64748b">({requests})</span></span>
                <span style="color:#94a3b8">{formatCost(cost)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>

    <div class="card">
      <h2>Daily Breakdown</h2>
      {summary.byDay.length === 0 ? (
        <p style="color:#94a3b8; font-size:0.875rem">No usage recorded yet.</p>
      ) : (
        <>
          <div style="margin-bottom:0.75rem">
            {summary.byDay.map(({ day, cost }) => {
              const maxCost = Math.max(...summary.byDay.map((d) => d.cost));
              const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
              return (
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem; font-size:0.8rem">
                  <span style="width:5rem; color:#94a3b8; flex-shrink:0">{day}</span>
                  <div style="flex:1; background:#0f172a; border-radius:2px; height:16px; overflow:hidden">
                    <div style={`width:${Math.max(pct, 1)}%; background:#3b82f6; height:100%; border-radius:2px`}></div>
                  </div>
                  <span style="width:4rem; text-align:right; color:#94a3b8; flex-shrink:0">{formatCost(cost)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>

    <div class="card">
      <h2>Token Details</h2>
      <div style="display:flex; gap:2rem; font-size:0.875rem">
        <div>
          <span style="color:#94a3b8">Prompt tokens: </span>
          <strong>{formatTokens(summary.totalPromptTokens)}</strong>
        </div>
        <div>
          <span style="color:#94a3b8">Completion tokens: </span>
          <strong>{formatTokens(summary.totalCompletionTokens)}</strong>
        </div>
        <div>
          <span style="color:#94a3b8">Avg cost/call: </span>
          <strong>{summary.totalRequests > 0 ? formatCost(summary.totalCost / summary.totalRequests) : "$0"}</strong>
        </div>
      </div>
    </div>
  </Layout>
);
