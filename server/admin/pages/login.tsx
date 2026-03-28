/** Login page. */

import type { FC } from "hono/jsx";

export const LoginPage: FC<{ error?: string }> = ({ error }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Login — Local Brain</title>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 2rem; width: 100%; max-width: 24rem; }
        .login-card h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
        .login-card .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.25rem; }
        input { background: #0f172a; border: 1px solid #475569; color: #e2e8f0; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; width: 100%; }
        input:focus { outline: none; border-color: #3b82f6; }
        .btn { display: block; width: 100%; padding: 0.625rem 1rem; border-radius: 0.375rem; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 600; background: #3b82f6; color: white; }
        .btn:hover { background: #2563eb; }
        .error { background: #7f1d1d; color: #fca5a5; padding: 0.5rem 0.75rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem; }
      `}</style>
    </head>
    <body>
      <div class="login-card">
        <h1>Local Brain</h1>
        <p class="subtitle">Admin Panel</p>
        {error && <div class="error">{error}</div>}
        <form method="POST" action="/admin/login">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required autofocus />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required />
          </div>
          <button type="submit" class="btn">Sign in</button>
        </form>
      </div>
    </body>
  </html>
);
