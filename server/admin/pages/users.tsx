/** Brain users management page. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface BrainUser {
  id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  thought_count: number;
  created_at: string;
}

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  brainUsers: BrainUser[];
  flash?: { type: string; message: string };
}

export const UsersPage: FC<Props> = ({ user, notifications, brainUsers, flash }) => (
  <Layout title="Brain Users" user={user} notifications={notifications}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Brain Users</h1>

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    <div class="card">
      <h2>MCP Client Users</h2>
      <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
        Each brain user gets their own isolated set of thoughts. Create users via CLI:
      </p>
      <pre class="logs" style="max-height:3rem; margin-bottom:1rem">docker compose exec mcp-server deno run --allow-net --allow-env --allow-read /app/scripts/create-brain-user.ts &lt;name&gt;</pre>
    </div>

    <div class="card" style="padding:0; overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th style="width:3rem">ID</th>
            <th>Name</th>
            <th style="width:8rem">Key Prefix</th>
            <th style="width:6rem">Thoughts</th>
            <th style="width:5rem">Status</th>
            <th style="width:8rem">Created</th>
            <th style="width:6rem">Actions</th>
          </tr>
        </thead>
        <tbody>
          {brainUsers.length === 0 ? (
            <tr>
              <td colspan="7" style="text-align:center; padding:2rem; color:#94a3b8">
                No brain users yet. Use the CLI to create one.
              </td>
            </tr>
          ) : (
            brainUsers.map((bu) => (
              <tr>
                <td style="color:#64748b">{bu.id}</td>
                <td style="font-weight:600">{bu.name}</td>
                <td>
                  <code style="font-size:0.8rem; color:#60a5fa">{bu.key_prefix}...</code>
                </td>
                <td style="text-align:center">{bu.thought_count}</td>
                <td>
                  <span class={`badge ${bu.is_active ? "badge-green" : "badge-gray"}`}>
                    {bu.is_active ? "active" : "disabled"}
                  </span>
                </td>
                <td style="color:#94a3b8; font-size:0.8rem; white-space:nowrap">
                  {new Date(bu.created_at).toLocaleDateString()}
                </td>
                <td>
                  <form method="POST" action="/admin/users/toggle" style="margin:0">
                    <input type="hidden" name="user_id" value={String(bu.id)} />
                    <input type="hidden" name="is_active" value={bu.is_active ? "false" : "true"} />
                    <button type="submit" class={`btn ${bu.is_active ? "btn-danger" : "btn-primary"}`} style="padding:0.25rem 0.5rem; font-size:0.75rem">
                      {bu.is_active ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2>Legacy Mode</h2>
      <p style="font-size:0.875rem; color:#94a3b8">
        If <code>MCP_ACCESS_KEY</code> is set in your .env, it acts as a global key with no user scoping.
        Thoughts captured with the global key have no user_id and are visible to all admin users.
        For multi-user isolation, create brain users instead.
      </p>
    </div>
  </Layout>
);
