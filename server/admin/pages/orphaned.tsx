/** Orphaned thoughts page — reassign thoughts with no user_id. Superuser only. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface OrphanedThought {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface UserOption {
  id: number;
  name: string;
  username: string;
}

export const OrphanedPage: FC<{
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  thoughts: OrphanedThought[];
  users: UserOption[];
  flash?: { type: string; message: string };
}> = ({ user, isSuperuser, notifications, version, thoughts, users, flash }) => (
  <Layout title="Unassigned Thoughts" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Unassigned Thoughts</h1>

    <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
      These thoughts were created with the deprecated global MCP_ACCESS_KEY and have no owner.
      Assign them to a user to include them in that user's thought graph.
    </p>

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    {thoughts.length === 0 ? (
      <div class="card" style="text-align:center; padding:3rem; color:#94a3b8">
        No unassigned thoughts.
      </div>
    ) : (
      <div>
        {thoughts.map((t) => {
          const m = t.metadata || {};
          return (
            <div class="card" style="display:flex; gap:1rem; align-items:flex-start">
              <div style="flex:1; min-width:0">
                <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem">
                  <span style="font-size:0.75rem; color:#64748b">#{t.id}</span>
                  {m.type && <span class="badge badge-blue">{String(m.type)}</span>}
                  <span style="font-size:0.75rem; color:#64748b">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div style="font-size:0.875rem; white-space:normal">
                  {t.content.slice(0, 300)}{t.content.length > 300 ? "..." : ""}
                </div>
              </div>
              <form method="POST" action="/admin/orphaned/reassign" style="margin:0; display:flex; gap:0.25rem; flex-shrink:0; align-items:center">
                <input type="hidden" name="thought_id" value={String(t.id)} />
                <select name="target_user_id" required style="width:auto; min-width:8rem">
                  <option value="">Assign to...</option>
                  {users.map((u) => (
                    <option value={String(u.id)}>{u.name} ({u.username})</option>
                  ))}
                </select>
                <button type="submit" class="btn btn-primary btn-sm">Assign</button>
              </form>
            </div>
          );
        })}
      </div>
    )}
  </Layout>
);
