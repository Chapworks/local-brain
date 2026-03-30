/** One-time credential display page — shown after user creation, password reset, or account restoration. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

export const CredentialsPage: FC<{
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  title: string;
  targetUsername: string;
  tempPassword?: string;
  mcpKey?: string;
  recoveryCodes?: string[];
  message?: string;
}> = ({ user, isSuperuser, notifications, version, title, targetUsername, tempPassword, mcpKey, recoveryCodes, message }) => (
  <Layout title={title} user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">{title}</h1>

    <div class="card" style="border-color:#f59e0b; background:#1c1917; max-width:40rem">
      <h2 style="color:#fcd34d">Save These Credentials Now</h2>
      <p style="font-size:0.875rem; color:#fcd34d; margin-bottom:1.5rem">
        This information will not be shown again.
        {message && <span> {message}</span>}
      </p>

      <div style="margin-bottom:1.5rem">
        <p style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; margin-bottom:0.25rem">Username</p>
        <code style="font-size:1.1rem; display:block; padding:0.5rem; background:#0f172a; border-radius:0.375rem">{targetUsername}</code>
      </div>

      {tempPassword && (
        <div style="margin-bottom:1.5rem">
          <p style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; margin-bottom:0.25rem">Temporary Password</p>
          <code style="font-size:1.1rem; display:block; padding:0.5rem; background:#0f172a; border-radius:0.375rem">{tempPassword}</code>
          <p style="font-size:0.75rem; color:#64748b; margin-top:0.25rem">The user will be required to change this on first login.</p>
        </div>
      )}

      {mcpKey && (
        <div style="margin-bottom:1.5rem">
          <p style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; margin-bottom:0.25rem">MCP Access Key</p>
          <code style="font-size:0.85rem; display:block; padding:0.5rem; background:#0f172a; border-radius:0.375rem; word-break:break-all">{mcpKey}</code>
          <p style="font-size:0.75rem; color:#64748b; margin-top:0.25rem">Use this in the x-brain-key header when connecting MCP clients.</p>
        </div>
      )}

      {recoveryCodes && recoveryCodes.length > 0 && (
        <div style="margin-bottom:1.5rem">
          <p style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; margin-bottom:0.5rem">Recovery Codes</p>
          <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:0.5rem">
            {recoveryCodes.map((code) => (
              <code style="font-size:0.95rem; padding:0.5rem; text-align:center; background:#0f172a; border-radius:0.375rem">{code}</code>
            ))}
          </div>
          <p style="font-size:0.75rem; color:#64748b; margin-top:0.5rem">Use these to recover access if the password is lost.</p>
        </div>
      )}

      <a href="/admin/users" class="btn btn-primary" style="text-align:center; text-decoration:none; display:block; margin-top:1rem">Back to Users</a>
    </div>
  </Layout>
);
