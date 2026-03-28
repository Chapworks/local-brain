/** Digest configuration page. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface DigestConfig {
  id: number;
  user_name: string;
  frequency: string;
  delivery: string;
  webhook_url: string;
  is_active: boolean;
  last_sent_at: string | null;
}

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  version?: string;
  configs: DigestConfig[];
  brainUsers: { id: number; name: string }[];
  flash?: { type: string; message: string };
}

export const DigestsPage: FC<Props> = ({
  user,
  notifications,
  version,
  configs,
  brainUsers,
  flash,
}) => (
  <Layout title="Digests" user={user} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Scheduled Digests</h1>

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    <div class="card">
      <h2>How It Works</h2>
      <p style="font-size:0.875rem; color:#94a3b8">
        Digests send a summary of recent thoughts to a webhook URL on a schedule.
        Daily digests cover the last 24 hours. Weekly digests cover the last 7 days.
        The webhook receives a JSON POST with the digest text and structured data.
      </p>
    </div>

    <div class="card">
      <h2>New Digest</h2>
      <form method="POST" action="/admin/digests" style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:flex-end">
        <div class="form-group" style="min-width:8rem; margin-bottom:0">
          <label for="digest_user">User</label>
          <select id="digest_user" name="user_id" required>
            {brainUsers.map((bu) => (
              <option value={String(bu.id)}>{bu.name}</option>
            ))}
          </select>
        </div>
        <div class="form-group" style="min-width:8rem; margin-bottom:0">
          <label for="digest_frequency">Frequency</label>
          <select id="digest_frequency" name="frequency">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div class="form-group" style="flex:1; min-width:16rem; margin-bottom:0">
          <label for="digest_webhook">Webhook URL</label>
          <input type="url" id="digest_webhook" name="webhook_url" placeholder="https://hooks.slack.com/..." required />
        </div>
        <button type="submit" class="btn btn-primary" style="margin-bottom:0">Create</button>
      </form>
    </div>

    <div class="card" style="padding:0; overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th style="width:3rem">ID</th>
            <th>User</th>
            <th style="width:6rem">Frequency</th>
            <th>Webhook</th>
            <th style="width:5rem">Status</th>
            <th style="width:9rem">Last Sent</th>
            <th style="width:10rem">Actions</th>
          </tr>
        </thead>
        <tbody>
          {configs.length === 0 ? (
            <tr>
              <td colspan="7" style="text-align:center; padding:2rem; color:#94a3b8">
                No digest configurations yet.
              </td>
            </tr>
          ) : (
            configs.map((dc) => (
              <tr>
                <td style="color:#64748b">{dc.id}</td>
                <td style="font-weight:600">{dc.user_name}</td>
                <td>
                  <span class="badge badge-blue">{dc.frequency}</span>
                </td>
                <td style="font-size:0.8rem; color:#94a3b8; max-width:15rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                  {dc.webhook_url}
                </td>
                <td>
                  <span class={`badge ${dc.is_active ? "badge-green" : "badge-gray"}`}>
                    {dc.is_active ? "active" : "paused"}
                  </span>
                </td>
                <td style="color:#94a3b8; font-size:0.8rem; white-space:nowrap">
                  {dc.last_sent_at
                    ? new Date(dc.last_sent_at).toLocaleString()
                    : "Never"}
                </td>
                <td style="display:flex; gap:0.5rem">
                  <form method="POST" action="/admin/digests/toggle" style="margin:0">
                    <input type="hidden" name="config_id" value={String(dc.id)} />
                    <input type="hidden" name="is_active" value={dc.is_active ? "false" : "true"} />
                    <button type="submit" class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                      {dc.is_active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form method="POST" action="/admin/digests/delete" style="margin:0">
                    <input type="hidden" name="config_id" value={String(dc.id)} />
                    <button type="submit" class="btn btn-danger" style="padding:0.25rem 0.5rem; font-size:0.75rem"
                      onclick="return confirm('Delete this digest configuration?')">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </Layout>
);
