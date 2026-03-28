/** Shared HTML shell for all admin pages. */

import type { FC } from "hono/jsx";

export const Layout: FC<{ title: string; user?: string }> = ({
  title,
  user,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} — Local Brain</title>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
        a { color: #60a5fa; text-decoration: none; }
        a:hover { text-decoration: underline; }
        nav { background: #1e293b; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 1.5rem; border-bottom: 1px solid #334155; }
        nav .brand { font-weight: 700; font-size: 1.1rem; color: #f1f5f9; }
        nav .spacer { flex: 1; }
        nav .user { color: #94a3b8; font-size: 0.875rem; }
        main { max-width: 72rem; margin: 0 auto; padding: 1.5rem; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
        .card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        th { text-align: left; padding: 0.5rem 0.75rem; color: #94a3b8; border-bottom: 1px solid #334155; font-weight: 600; }
        td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e293b; }
        tr:hover td { background: #1e293b; }
        .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 0.375rem; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 500; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-danger:hover { background: #dc2626; }
        .btn-ghost { background: transparent; color: #94a3b8; border: 1px solid #475569; }
        .btn-ghost:hover { background: #334155; }
        input, select, textarea { background: #0f172a; border: 1px solid #475569; color: #e2e8f0; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; width: 100%; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; }
        .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .badge-green { background: #065f46; color: #6ee7b7; }
        .badge-blue { background: #1e3a5f; color: #93c5fd; }
        .badge-yellow { background: #713f12; color: #fcd34d; }
        .badge-gray { background: #334155; color: #94a3b8; }
        .stat { text-align: center; }
        .stat .value { font-size: 2rem; font-weight: 700; color: #f1f5f9; }
        .stat .label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .grid { display: grid; gap: 1rem; }
        .grid-3 { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
        .grid-2 { grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); }
        pre.logs { background: #020617; border: 1px solid #334155; border-radius: 0.375rem; padding: 1rem; font-family: ui-monospace, monospace; font-size: 0.8rem; overflow-x: auto; max-height: 32rem; overflow-y: auto; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.25rem; }
        .flash { padding: 0.75rem 1rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem; }
        .flash-success { background: #065f46; color: #6ee7b7; }
        .flash-error { background: #7f1d1d; color: #fca5a5; }
        .content-preview { max-width: 40rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pagination { display: flex; gap: 0.5rem; margin-top: 1rem; align-items: center; }
        .pagination .info { color: #94a3b8; font-size: 0.875rem; flex: 1; }
      `}</style>
    </head>
    <body>
      <nav>
        <span class="brand">Local Brain</span>
        <a href="/admin">Dashboard</a>
        <a href="/admin/thoughts">Thoughts</a>
        <a href="/admin/config">Config</a>
        <a href="/admin/logs">Logs</a>
        <span class="spacer" />
        {user && (
          <>
            <span class="user">{user}</span>
            <form method="POST" action="/admin/logout" style="margin:0">
              <button type="submit" class="btn btn-ghost" style="padding:0.25rem 0.75rem">
                Logout
              </button>
            </form>
          </>
        )}
      </nav>
      <main>{children}</main>
    </body>
  </html>
);
