/** Import/Export page. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  thoughtCount: number;
  brainUsers: { id: number; name: string }[];
  flash?: { type: string; message: string };
}

export const ImportExportPage: FC<Props> = ({
  user,
  notifications,
  thoughtCount,
  brainUsers,
  flash,
}) => (
  <Layout title="Import / Export" user={user} notifications={notifications}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Import / Export</h1>

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    <div class="grid grid-2">
      <div class="card">
        <h2>Export</h2>
        <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
          Download all thoughts as JSON or Markdown. The "no lock-in" feature.
        </p>
        <form method="POST" action="/admin/export" style="display:flex; flex-direction:column; gap:0.75rem">
          <div class="form-group" style="margin-bottom:0">
            <label for="export_format">Format</label>
            <select id="export_format" name="format">
              <option value="json">JSON (re-importable)</option>
              <option value="markdown">Markdown (human-readable)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label for="export_user">User (optional)</label>
            <select id="export_user" name="user_id">
              <option value="">All users</option>
              <option value="null">Global (no user)</option>
              {brainUsers.map((bu) => (
                <option value={String(bu.id)}>{bu.name}</option>
              ))}
            </select>
          </div>
          <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.875rem; color:#94a3b8">
            <input type="checkbox" name="include_archived" value="1" />
            Include archived thoughts
          </label>
          <button type="submit" class="btn btn-primary">
            Export {thoughtCount} thought{thoughtCount !== 1 ? "s" : ""}
          </button>
        </form>
      </div>

      <div class="card">
        <h2>Import</h2>
        <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
          Import thoughts from JSON, Markdown, or CSV files.
          Each imported thought goes through embedding + metadata extraction.
        </p>
        <form method="POST" action="/admin/import" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:0.75rem">
          <div class="form-group" style="margin-bottom:0">
            <label for="import_file">File</label>
            <input type="file" id="import_file" name="file" accept=".json,.md,.markdown,.txt,.csv" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label for="import_user">Import as user</label>
            <select id="import_user" name="user_id">
              <option value="">Global (no user)</option>
              {brainUsers.map((bu) => (
                <option value={String(bu.id)}>{bu.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Import</button>
        </form>
        <div style="margin-top:0.75rem; font-size:0.8rem; color:#64748b">
          <strong>Supported formats:</strong>
          <ul style="list-style:disc; margin-left:1.5rem; margin-top:0.25rem">
            <li>JSON — Local Brain export or array of objects with "content" field</li>
            <li>Markdown — each heading/section becomes a thought</li>
            <li>CSV — requires "content" column, optional "type" and "topics"</li>
          </ul>
        </div>
      </div>
    </div>
  </Layout>
);
