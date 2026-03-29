/** Account settings — change password, view MCP key prefix. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

export const AccountPage: FC<{
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  keyPrefix: string;
  flash?: { type: "success" | "error"; message: string };
}> = ({ user, isSuperuser, notifications, version, keyPrefix, flash }) => (
  <Layout title="Account" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Account Settings</h1>

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    <div class="grid grid-2">
      <div class="card">
        <h2>Change Password</h2>
        <form method="POST" action="/admin/account/password">
          <div class="form-group">
            <label>Current Password</label>
            <input type="password" name="current_password" required />
          </div>
          <div class="form-group">
            <label>New Password (min 8 characters)</label>
            <input type="password" name="new_password" minlength={8} required />
          </div>
          <div class="form-group">
            <label>Confirm New Password</label>
            <input type="password" name="confirm_password" minlength={8} required />
          </div>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </form>
      </div>

      <div class="card">
        <h2>MCP API Key</h2>
        <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
          Your MCP key prefix: <code>{keyPrefix || "none"}</code>
        </p>
        <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
          The full key was shown once when your account was created.
          If you've lost it, rotate to a new key.
        </p>
        <p style="font-size:0.75rem; color:#64748b; margin-bottom:1rem">
          Key rotation: use the CLI to generate a new key while the old one still works.
        </p>
        <pre class="logs" style="font-size:0.75rem; max-height:none; padding:0.75rem">{`# Generate secondary key (both work)
create-user.ts ${user} --rotate

# Update your MCP clients, then promote
create-user.ts ${user} --promote`}</pre>
      </div>
    </div>
  </Layout>
);
