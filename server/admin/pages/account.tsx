/** Account settings — change password, view MCP key prefix, recovery codes, admin reset policy. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

export const AccountPage: FC<{
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  keyPrefix: string;
  recoveryCodeCount?: number;
  adminResetPolicy?: string;
  mustChangePassword?: boolean;
  newRecoveryCodes?: string[];
  flash?: { type: "success" | "error"; message: string };
}> = ({ user, isSuperuser, notifications, version, keyPrefix, recoveryCodeCount, adminResetPolicy, mustChangePassword, newRecoveryCodes, flash }) => (
  <Layout title="Account" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Account Settings</h1>

    {mustChangePassword && (
      <div class="flash flash-error" style="font-weight:600">
        You must change your password before continuing.
      </div>
    )}

    {flash && (
      <div class={`flash flash-${flash.type}`}>{flash.message}</div>
    )}

    {newRecoveryCodes && newRecoveryCodes.length > 0 && (
      <div class="card" style="border-color:#f59e0b; background:#1c1917">
        <h2 style="color:#fcd34d">New Recovery Codes</h2>
        <p style="font-size:0.875rem; color:#fcd34d; margin-bottom:1rem">
          Save these codes now. They will not be shown again.
        </p>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:0.5rem; margin-bottom:1rem">
          {newRecoveryCodes.map((code) => (
            <code style="font-size:1rem; padding:0.5rem; text-align:center; background:#0f172a; border-radius:0.375rem">{code}</code>
          ))}
        </div>
      </div>
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

      <div class="card">
        <h2>Recovery Codes</h2>
        <p style="font-size:0.875rem; color:#94a3b8; margin-bottom:1rem">
          {typeof recoveryCodeCount === "number"
            ? `${recoveryCodeCount} of 8 recovery codes remaining.`
            : "Recovery codes let you regain access if you lose your password."}
        </p>
        <p style="font-size:0.75rem; color:#64748b; margin-bottom:1rem">
          Regenerating codes invalidates all previous ones. You'll need your current password.
        </p>
        <form method="POST" action="/admin/account/recovery-codes">
          <div class="form-group">
            <label>Current Password (to confirm)</label>
            <input type="password" name="current_password" required />
          </div>
          <button type="submit" class="btn btn-primary">Regenerate Recovery Codes</button>
        </form>
      </div>

      <div class="card">
        <h2>Admin Reset Policy</h2>
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:1rem">
          Controls what happens if you lose your password and recovery codes and need a superuser to reset your account.
          This is a best-effort privacy protection — it is not foolproof. A determined server admin with database access could bypass these controls.
        </p>
        <form method="POST" action="/admin/account/reset-policy">
          <div class="form-group">
            <label style="display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer; margin-bottom:0.5rem">
              <input type="radio" name="admin_reset_policy" value="reset_full" checked={adminResetPolicy === "reset_full"} />
              <span><strong>Reset, Keep Content</strong> — An admin can reset your password and your data stays.</span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer; margin-bottom:0.5rem">
              <input type="radio" name="admin_reset_policy" value="reset_lossy" checked={adminResetPolicy === "reset_lossy"} />
              <span><strong>Reset, Lose Content</strong> — An admin can reset your password, but your thoughts are deleted.</span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer; margin-bottom:0.5rem">
              <input type="radio" name="admin_reset_policy" value="none" checked={adminResetPolicy === "none"} />
              <span><strong>No Reset</strong> — Nobody can reset your password. If you lose access, it's gone.</span>
            </label>
          </div>
          <button type="submit" class="btn btn-primary">Save Policy</button>
        </form>
      </div>
    </div>
  </Layout>
);
