/** Thoughts browser — paginated, filterable view of all captured thoughts. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";

interface Thought {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Props {
  user: string;
  thoughts: Thought[];
  total: number;
  page: number;
  pageSize: number;
  filterType: string;
  filterTopic: string;
  search: string;
  allTypes: string[];
  allTopics: string[];
}

export const ThoughtsPage: FC<Props> = ({
  user,
  thoughts,
  total,
  page,
  pageSize,
  filterType,
  filterTopic,
  search,
  allTypes,
  allTopics,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (filterType) params.set("type", filterType);
    if (filterTopic) params.set("topic", filterTopic);
    if (search) params.set("q", search);
    return `/admin/thoughts?${params.toString()}`;
  };

  return (
    <Layout title="Thoughts" user={user}>
      <h1 style="font-size:1.5rem; margin-bottom:1rem">Thoughts</h1>

      <div class="card">
        <form method="GET" action="/admin/thoughts" style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:flex-end">
          <div class="form-group" style="flex:1; min-width:12rem; margin-bottom:0">
            <label for="q">Search</label>
            <input type="text" id="q" name="q" value={search} placeholder="Search content..." />
          </div>
          <div class="form-group" style="min-width:8rem; margin-bottom:0">
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
          <div class="form-group" style="min-width:8rem; margin-bottom:0">
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
              <th style="width:6rem">Type</th>
              <th style="width:10rem">Topics</th>
            </tr>
          </thead>
          <tbody>
            {thoughts.length === 0 ? (
              <tr>
                <td colspan="5" style="text-align:center; padding:2rem; color:#94a3b8">
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
                  <tr>
                    <td style="color:#64748b">{t.id}</td>
                    <td style="color:#94a3b8; font-size:0.8rem; white-space:nowrap">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div class="content-preview">{t.content}</div>
                    </td>
                    <td>
                      {m.type && (
                        <span class="badge badge-blue">{m.type as string}</span>
                      )}
                    </td>
                    <td style="font-size:0.8rem; color:#94a3b8">{topics}</td>
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
