/** User management page. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface UserRow {
  id: number;
  name: string;
  username: string;
  key_prefix: string;
  is_active: boolean;
  is_superuser: boolean;
  last_active_at: string | null;
  thought_count: number;
  created_at: string;
}

interface DeletedUserRow {
  id: number;
  deleted_username: string;
  deleted_name: string;
  deleted_at: string;
}

interface Props {
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  users: UserRow[];
  deletedUsers?: DeletedUserRow[];
  currentUserId: number;
  flash?: { type: string; message: string };
}

export const UsersPage: FC<Props> = ({ user, isSuperuser, notifications, version, users, deletedUsers, currentUserId, flash }) => (
  <Layout title="Users" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Users</h1>

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    <div class="card">
      <h2>Create User</h2>
      <form method="POST" action="/admin/users/create" style="display:flex; gap:0.75rem; align-items:flex-end; flex-wrap:wrap">
        <div class="form-group" style="margin-bottom:0; flex:1; min-width:12rem">
          <label>Username</label>
          <input type="text" name="username" pattern="[a-z0-9][a-z0-9-]*" minlength={3} maxlength={100} required placeholder="lowercase, letters/numbers/hyphens" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer">
            <input type="checkbox" name="is_superuser" value="true" />
            <span style="font-size:0.875rem">Superuser</span>
          </label>
        </div>
        <button type="submit" class="btn btn-primary">Create User</button>
      </form>
    </div>

    <div class="card" style="padding:0; overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th style="width:3rem">ID</th>
            <th>Name</th>
            <th>Username</th>
            <th style="width:8rem">Key Prefix</th>
            <th style="width:6rem">Thoughts</th>
            <th style="width:5rem">Role</th>
            <th style="width:5rem">Status</th>
            <th style="width:8rem">Last Active</th>
            <th style="width:8rem">Created</th>
            <th style="width:16rem">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colspan="10" style="text-align:center; padding:2rem; color:#94a3b8">
                No users yet. Create one above or use the CLI.
              </td>
            </tr>
          ) : (
            users.map((bu) => (
              <tr>
                <td style="color:#64748b">{bu.id}</td>
                <td style="font-weight:600">{bu.name}</td>
                <td style="font-size:0.85rem; color:#94a3b8">{bu.username}</td>
                <td>
                  <code style="font-size:0.8rem; color:#60a5fa">{bu.key_prefix}...</code>
                </td>
                <td style="text-align:center">{bu.thought_count}</td>
                <td>
                  {bu.is_superuser ? (
                    <span class="badge badge-yellow">superuser</span>
                  ) : (
                    <span class="badge badge-blue">user</span>
                  )}
                </td>
                <td>
                  <span class={`badge ${bu.is_active ? "badge-green" : "badge-gray"}`}>
                    {bu.is_active ? "active" : "disabled"}
                  </span>
                </td>
                <td style="color:#94a3b8; font-size:0.8rem; white-space:nowrap">
                  {bu.last_active_at
                    ? new Date(bu.last_active_at).toLocaleDateString()
                    : "Never"}
                </td>
                <td style="color:#94a3b8; font-size:0.8rem; white-space:nowrap">
                  {new Date(bu.created_at).toLocaleDateString()}
                </td>
                <td style="display:flex; gap:0.25rem; flex-wrap:wrap">
                  <form method="POST" action="/admin/users/toggle" style="margin:0">
                    <input type="hidden" name="user_id" value={String(bu.id)} />
                    <input type="hidden" name="is_active" value={bu.is_active ? "false" : "true"} />
                    <button type="submit" class={`btn ${bu.is_active ? "btn-danger" : "btn-primary"}`} style="padding:0.25rem 0.5rem; font-size:0.75rem">
                      {bu.is_active ? "Disable" : "Enable"}
                    </button>
                  </form>
                  {bu.id !== currentUserId && (
                    <>
                      <form method="POST" action="/admin/users/toggle-superuser" style="margin:0">
                        <input type="hidden" name="user_id" value={String(bu.id)} />
                        <input type="hidden" name="is_superuser" value={bu.is_superuser ? "false" : "true"} />
                        <button type="submit" class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                          {bu.is_superuser ? "Revoke Super" : "Make Super"}
                        </button>
                      </form>
                      <form method="POST" action="/admin/users/reset-password" style="margin:0"
                        onsubmit={`return confirm('Reset password for ${bu.username}? This respects their admin reset policy.')`}>
                        <input type="hidden" name="user_id" value={String(bu.id)} />
                        <button type="submit" class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                          Reset Password
                        </button>
                      </form>
                      <form method="POST" action="/admin/users/delete" style="margin:0"
                        onsubmit={`return confirm('Delete ${bu.username}? Their content will be trashed for 30 days then permanently deleted.')`}>
                        <input type="hidden" name="user_id" value={String(bu.id)} />
                        <input type="hidden" name="username" value={bu.username} />
                        <button type="submit" class="btn btn-danger" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                          Delete
                        </button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    {deletedUsers && deletedUsers.length > 0 && (
      <div class="card" style="padding:0; overflow-x:auto; margin-top:1rem">
        <div style="padding:1rem 1.25rem">
          <h2>Deleted Accounts (within 30-day retention)</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:3rem">ID</th>
              <th>Original Username</th>
              <th>Original Name</th>
              <th>Deleted At</th>
              <th style="width:6rem">Days Left</th>
              <th style="width:8rem">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deletedUsers.map((du) => {
              const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(du.deleted_at).getTime()) / (1000 * 60 * 60 * 24)));
              return (
                <tr>
                  <td style="color:#64748b">{du.id}</td>
                  <td style="font-weight:600">{du.deleted_username}</td>
                  <td style="color:#94a3b8">{du.deleted_name}</td>
                  <td style="color:#94a3b8; font-size:0.8rem">{new Date(du.deleted_at).toLocaleDateString()}</td>
                  <td>
                    <span class={`badge ${daysLeft <= 7 ? "badge-red" : "badge-yellow"}`}>{daysLeft}d</span>
                  </td>
                  <td>
                    <form method="POST" action="/admin/users/restore" style="margin:0">
                      <input type="hidden" name="user_id" value={String(du.id)} />
                      <button type="submit" class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </Layout>
);
