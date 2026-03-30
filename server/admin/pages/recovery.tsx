/** Recovery code login page. */

import type { FC } from "hono/jsx";

export const RecoveryPage: FC<{
  error?: string;
  success?: string;
  remainingCodes?: number;
}> = ({ error, success, remainingCodes }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Account Recovery — Local Brain</title>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 2rem; width: 100%; max-width: 28rem; }
        .card h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
        .card .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.25rem; }
        input { background: #0f172a; border: 1px solid #475569; color: #e2e8f0; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; width: 100%; }
        input:focus { outline: none; border-color: #3b82f6; }
        .btn { display: block; width: 100%; padding: 0.625rem 1rem; border-radius: 0.375rem; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 600; background: #3b82f6; color: white; }
        .btn:hover { background: #2563eb; }
        .error { background: #7f1d1d; color: #fca5a5; padding: 0.5rem 0.75rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem; }
        .success { background: #065f46; color: #6ee7b7; padding: 0.5rem 0.75rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem; }
        a { color: #60a5fa; text-decoration: none; font-size: 0.8rem; }
      `}</style>
    </head>
    <body>
      <div class="card">
        <h1>Account Recovery</h1>
        <p class="subtitle">Use a one-time recovery code to reset your password</p>
        {error && <div class="error">{error}</div>}
        {success && (
          <div class="success">
            {success}
            {typeof remainingCodes === "number" && (
              <span> You have {remainingCodes} recovery code(s) remaining.</span>
            )}
          </div>
        )}
        <form method="POST" action="/admin/recovery">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required autofocus />
          </div>
          <div class="form-group">
            <label for="recovery_code">Recovery Code</label>
            <input type="text" id="recovery_code" name="recovery_code" placeholder="XXXX-XXXX-XXXX" required />
          </div>
          <div class="form-group">
            <label for="new_password">New Password</label>
            <input type="password" id="new_password" name="new_password" required minLength={8} />
          </div>
          <div class="form-group">
            <label for="confirm_password">Confirm New Password</label>
            <input type="password" id="confirm_password" name="confirm_password" required minLength={8} />
          </div>
          <button type="submit" class="btn">Reset Password</button>
        </form>
        <p style="text-align:center; margin-top:1rem">
          <a href="/admin/login">Back to login</a>
        </p>
      </div>
    </body>
  </html>
);
