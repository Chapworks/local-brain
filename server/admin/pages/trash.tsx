/** Trash page — view, restore, and permanently delete trashed thoughts. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface TrashedThought {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  trashed_at: string;
}

export const TrashPage: FC<{
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  thoughts: TrashedThought[];
}> = ({ user, isSuperuser, notifications, version, thoughts }) => (
  <Layout title="Trash" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem">
      <h1 style="font-size:1.5rem">Trash</h1>
      {thoughts.length > 0 && (
        <form method="POST" action="/admin/trash/empty" style="margin:0"
          onsubmit="return confirm('Permanently delete all trashed thoughts? This cannot be undone.')">
          <button type="submit" class="btn btn-danger">Empty Trash ({thoughts.length})</button>
        </form>
      )}
    </div>

    <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
      Trashed thoughts are automatically deleted after 30 days.
    </p>

    {thoughts.length === 0 ? (
      <div class="card" style="text-align:center; padding:3rem; color:#94a3b8">
        Trash is empty.
      </div>
    ) : (
      <div>
        {thoughts.map((t) => {
          const m = t.metadata || {};
          const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(t.trashed_at).getTime()) / (1000 * 60 * 60 * 24)));
          return (
            <div class="card" style="display:flex; gap:1rem; align-items:flex-start">
              <div style="flex:1; min-width:0">
                <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem">
                  <span style="font-size:0.75rem; color:#64748b">#{t.id}</span>
                  {m.type && <span class="badge badge-blue">{String(m.type)}</span>}
                  <span class={`badge ${daysLeft <= 7 ? "badge-red" : "badge-yellow"}`}>{daysLeft}d left</span>
                  <span style="font-size:0.75rem; color:#64748b">
                    Trashed {new Date(t.trashed_at).toLocaleDateString()}
                  </span>
                </div>
                <div class="content-preview" style="font-size:0.875rem; white-space:normal">
                  {t.content.slice(0, 300)}{t.content.length > 300 ? "..." : ""}
                </div>
              </div>
              <div style="display:flex; gap:0.25rem; flex-shrink:0">
                <form method="POST" action="/admin/thoughts/restore" style="margin:0">
                  <input type="hidden" name="thought_id" value={String(t.id)} />
                  <button type="submit" class="btn btn-primary btn-sm">Restore</button>
                </form>
                <form method="POST" action="/admin/thoughts/permanent-delete" style="margin:0"
                  onsubmit="return confirm('Permanently delete this thought? This cannot be undone.')">
                  <input type="hidden" name="thought_id" value={String(t.id)} />
                  <button type="submit" class="btn btn-danger btn-sm">Delete</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Layout>
);
