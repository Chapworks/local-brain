/** Dashboard — overview of thoughts, service health, and system info. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface Stats {
  totalThoughts: number;
  archivedThoughts: number;
  types: Record<string, number>;
  topTopics: [string, number][];
  dateRange: string;
  services: { name: string; status: string; uptime: string }[];
  brainUsers: number;
  connections: number;
}

export const DashboardPage: FC<{ user: string; stats: Stats; notifications?: LayoutNotification[] }> = ({
  user,
  stats,
  notifications,
}) => (
  <Layout title="Dashboard" user={user} notifications={notifications}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Dashboard</h1>

    <div class="grid grid-3">
      <div class="card stat">
        <div class="value">{stats.totalThoughts}</div>
        <div class="label">Active Thoughts</div>
      </div>
      <div class="card stat">
        <div class="value">{stats.archivedThoughts}</div>
        <div class="label">Archived</div>
      </div>
      <div class="card stat">
        <div class="value">{stats.connections}</div>
        <div class="label">Connections</div>
      </div>
      <div class="card stat">
        <div class="value">{stats.brainUsers}</div>
        <div class="label">Brain Users</div>
      </div>
      <div class="card stat">
        <div class="value">{Object.keys(stats.types).length}</div>
        <div class="label">Thought Types</div>
      </div>
      <div class="card stat">
        <div class="value">{stats.topTopics.length}</div>
        <div class="label">Topics Tracked</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Types Breakdown</h2>
        {Object.keys(stats.types).length === 0 ? (
          <p style="color:#94a3b8; font-size:0.875rem">No thoughts captured yet.</p>
        ) : (
          <ul style="list-style:none; font-size:0.875rem">
            {Object.entries(stats.types)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <li style="display:flex; justify-content:space-between; padding:0.25rem 0; border-bottom:1px solid #334155">
                  <span>{type}</span>
                  <span style="color:#94a3b8">{count}</span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div class="card">
        <h2>Top Topics</h2>
        {stats.topTopics.length === 0 ? (
          <p style="color:#94a3b8; font-size:0.875rem">No topics yet.</p>
        ) : (
          <ul style="list-style:none; font-size:0.875rem">
            {stats.topTopics.map(([topic, count]) => (
              <li style="display:flex; justify-content:space-between; padding:0.25rem 0; border-bottom:1px solid #334155">
                <span>{topic}</span>
                <span style="color:#94a3b8">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>

    <div class="card">
      <h2>Services</h2>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Status</th>
            <th>Uptime</th>
          </tr>
        </thead>
        <tbody>
          {stats.services.map((svc) => (
            <tr>
              <td>{svc.name}</td>
              <td>
                <span
                  class={`badge ${
                    svc.status === "running" ? "badge-green" : "badge-yellow"
                  }`}
                >
                  {svc.status}
                </span>
              </td>
              <td style="color:#94a3b8; font-size:0.8rem">{svc.uptime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {stats.dateRange && (
      <p style="color:#64748b; font-size:0.75rem; text-align:center; margin-top:1rem">
        Data range: {stats.dateRange}
      </p>
    )}
  </Layout>
);
