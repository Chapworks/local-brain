/** Shared HTML shell for all admin pages. */

import type { FC } from "hono/jsx";

export interface LayoutNotification {
  id: number;
  level: "info" | "warning" | "error";
  title: string;
  message: string;
  link: string | null;
}

const LEVEL_STYLES: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  error: { bg: "#7f1d1d", border: "#ef4444", color: "#fca5a5", icon: "!!" },
  warning: { bg: "#713f12", border: "#f59e0b", color: "#fcd34d", icon: "!" },
  info: { bg: "#1e3a5f", border: "#3b82f6", color: "#93c5fd", icon: "i" },
};

export const Layout: FC<{
  title: string;
  user?: string;
  isSuperuser?: boolean;
  version?: string;
  notifications?: LayoutNotification[];
}> = ({
  title,
  user,
  isSuperuser,
  version,
  notifications,
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
        nav { background: #1e293b; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 1.5rem; border-bottom: 1px solid #334155; flex-wrap: wrap; }
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
        .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
        input, select, textarea { background: #0f172a; border: 1px solid #475569; color: #e2e8f0; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; width: 100%; }
        input[type="checkbox"] { width: auto; }
        input[type="file"] { padding: 0.375rem; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; }
        .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .badge-green { background: #065f46; color: #6ee7b7; }
        .badge-blue { background: #1e3a5f; color: #93c5fd; }
        .badge-yellow { background: #713f12; color: #fcd34d; }
        .badge-gray { background: #334155; color: #94a3b8; }
        .badge-red { background: #7f1d1d; color: #fca5a5; }
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
        code { font-family: ui-monospace, monospace; font-size: 0.85em; background: #0f172a; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
        .notif-bar { padding: 0; }
        .notif-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1.5rem; font-size: 0.8125rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .notif-item:last-child { border-bottom: none; }
        .notif-icon { width: 1.25rem; height: 1.25rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.65rem; flex-shrink: 0; }
        .notif-content { flex: 1; min-width: 0; }
        .notif-title { font-weight: 600; }
        .notif-msg { color: inherit; opacity: 0.85; }
        .notif-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
      `}</style>
    </head>
    <body>
      <nav>
        <span class="brand">Local Brain{version && <span style="font-weight:400; font-size:0.75rem; color:#64748b; margin-left:0.5rem">v{version}</span>}</span>
        <a href="/admin">Dashboard</a>
        <a href="/admin/thoughts">Thoughts</a>
        <a href="/admin/graph">Graph</a>
        {isSuperuser && <a href="/admin/users">Users</a>}
        <a href="/admin/import-export">Import/Export</a>
        <a href="/admin/digests">Digests</a>
        <a href="/admin/usage">AI Costs</a>
        {isSuperuser && <a href="/admin/backups">Backups</a>}
        {isSuperuser && <a href="/admin/config">Config</a>}
        {isSuperuser && <a href="/admin/logs">Logs</a>}
        <a href="/admin/account">Account</a>
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

      {notifications && notifications.length > 0 && (
        <div class="notif-bar">
          {notifications.map((n) => {
            const s = LEVEL_STYLES[n.level] || LEVEL_STYLES.info;
            return (
              <div
                class="notif-item"
                style={`background:${s.bg}; color:${s.color}; border-left:3px solid ${s.border}`}
              >
                <span class="notif-icon" style={`background:${s.border}; color:#fff`}>
                  {s.icon}
                </span>
                <div class="notif-content">
                  <span class="notif-title">{n.title}</span>
                  {" — "}
                  <span class="notif-msg">{n.message}</span>
                </div>
                <div class="notif-actions">
                  {n.link && (
                    <a href={n.link} style={`color:${s.color}; text-decoration:underline; font-size:0.75rem`}>
                      Fix
                    </a>
                  )}
                  <form method="POST" action="/admin/notifications/dismiss" style="margin:0">
                    <input type="hidden" name="id" value={String(n.id)} />
                    <button type="submit" class="btn btn-ghost btn-sm" style={`color:${s.color}; border-color:${s.border}`}>
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {notifications.length > 1 && (
            <div style="text-align:right; padding:0.25rem 1.5rem 0.5rem">
              <form method="POST" action="/admin/notifications/dismiss-all" style="display:inline">
                <button type="submit" class="btn btn-ghost btn-sm">
                  Dismiss all
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      <main>{children}</main>
    </body>
  </html>
);
