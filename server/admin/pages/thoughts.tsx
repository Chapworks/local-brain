/** Thoughts browser — paginated, filterable view of all captured thoughts. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface Thought {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  archived: boolean;
  expires_at: string | null;
  user_name: string | null;
}

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  thoughts: Thought[];
  total: number;
  page: number;
  pageSize: number;
  filterType: string;
  filterTopic: string;
  filterUser: string;
  showArchived: boolean;
  search: string;
  allTypes: string[];
  allTopics: string[];
  allUsers: { id: number; name: string }[];
}

export const ThoughtsPage: FC<Props> = ({
  user,
  notifications,
  thoughts,
  total,
  page,
  pageSize,
  filterType,
  filterTopic,
  filterUser,
  showArchived,
  search,
  allTypes,
  allTopics,
  allUsers,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (filterType) params.set("type", filterType);
    if (filterTopic) params.set("topic", filterTopic);
    if (filterUser) params.set("user_id", filterUser);
    if (showArchived) params.set("archived", "1");
    if (search) params.set("q", search);
    return `/admin/thoughts?${params.toString()}`;
  };

  return (
    <Layout title="Thoughts" user={user} notifications={notifications}>
      <h1 style="font-size:1.5rem; margin-bottom:1rem">Thoughts</h1>

      <div class="card">
        <form method="GET" action="/admin/thoughts" style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:flex-end">
          <div class="form-group" style="flex:1; min-width:12rem; margin-bottom:0">
            <label for="q">Search</label>
            <input type="text" id="q" name="q" value={search} placeholder="Search content..." />
          </div>
          <div class="form-group" style="min-width:7rem; margin-bottom:0">
            <label for="type">Type</label>
            <select id="type" name="type">
              <option value="">All types</option>
              {allTypes.map((t) => (
                <option value={t} selected={t === filterType}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div class="form-group" style="min-width:7rem; margin-bottom:0">
            <label for="topic">Topic</label>
            <select id="topic" name="topic">
              <option value="">All topics</option>
              {allTopics.map((t) => (
                <option value={t} selected={t === filterTopic}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div class="form-group" style="min-width:7rem; margin-bottom:0">
            <label for="user_id">User</label>
            <select id="user_id" name="user_id">
              <option value="">All users</option>
              <option value="null" selected={filterUser === "null"}>Global</option>
              {allUsers.map((u) => (
                <option value={String(u.id)} selected={filterUser === String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:#94a3b8; margin-bottom:0; white-space:nowrap">
            <input type="checkbox" name="archived" value="1" checked={showArchived} />
            Show archived
          </label>
          <button type="submit" class="btn btn-primary" style="margin-bottom:0">Filter</button>
          <a href="/admin/thoughts" class="btn btn-ghost" style="margin-bottom:0; text-decoration:none">Clear</a>
        </form>
      </div>

      <div class="card" style="padding:0; overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th style="width:2.5rem">#</th>
              <th style="width:7rem">Date</th>
              <th>Content</th>
              <th style="width:5rem">Type</th>
              <th style="width:5rem">User</th>
              <th style="width:5rem">Status</th>
              <th style="width:10rem">Actions</th>
            </tr>
          </thead>
          <tbody>
            {thoughts.length === 0 ? (
              <tr>
                <td colspan="7" style="text-align:center; padding:2rem; color:#94a3b8">
                  No thoughts found.
                </td>
              </tr>
            ) : (
              thoughts.map((t) => {
                const m = t.metadata || {};
                const topics = Array.isArray(m.topics)
                  ? (m.topics as string[]).join(", ")
                  : "";
                return (
                  <tr style={t.archived ? "opacity:0.6" : ""}>
                    <td style="color:#64748b">{t.id}</td>
                    <td style="color:#94a3b8; font-size:0.8rem; white-space:nowrap">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div class="content-preview" title={topics ? `Topics: ${topics}` : ""}>{t.content}</div>
                    </td>
                    <td>
                      {m.type && (
                        <span class="badge badge-blue">{m.type as string}</span>
                      )}
                    </td>
                    <td style="font-size:0.8rem; color:#94a3b8">
                      {t.user_name || "—"}
                    </td>
                    <td>
                      {t.archived && <span class="badge badge-gray">archived</span>}
                      {t.expires_at && !t.archived && (
                        <span class="badge badge-yellow" title={`Expires: ${new Date(t.expires_at).toLocaleDateString()}`}>
                          TTL
                        </span>
                      )}
                    </td>
                    <td style="display:flex; gap:0.25rem; flex-wrap:wrap">
                      <form method="POST" action="/admin/thoughts/archive" style="margin:0">
                        <input type="hidden" name="thought_id" value={String(t.id)} />
                        {t.archived && <input type="hidden" name="unarchive" value="1" />}
                        <button type="submit" class="btn btn-ghost" style="padding:0.2rem 0.4rem; font-size:0.7rem">
                          {t.archived ? "Unarchive" : "Archive"}
                        </button>
                      </form>
                      {!t.archived && (
                        <form method="POST" action="/admin/thoughts/set-ttl" style="margin:0; display:flex; gap:0.25rem">
                          <input type="hidden" name="thought_id" value={String(t.id)} />
                          <input type="number" name="days" placeholder="days" min="0" style="width:4rem; padding:0.2rem 0.3rem; font-size:0.7rem" />
                          <button type="submit" class="btn btn-ghost" style="padding:0.2rem 0.4rem; font-size:0.7rem">
                            Set TTL
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span class="info">
          {total} thought{total !== 1 ? "s" : ""} — page {page} of {totalPages}
        </span>
        {prevPage && (
          <a href={buildUrl(prevPage)} class="btn btn-ghost">
            Previous
          </a>
        )}
        {nextPage && (
          <a href={buildUrl(nextPage)} class="btn btn-ghost">
            Next
          </a>
        )}
      </div>
    </Layout>
  );
};
