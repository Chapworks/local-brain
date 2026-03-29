/** Backups management page — shows backup inventory, cloud sync status, and manual trigger. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface BackupInfo {
  name: string;
  size: string;
  date: string;
}

interface Props {
  user: string;
  isSuperuser?: boolean;
  notifications?: LayoutNotification[];
  version?: string;
  localBackups: BackupInfo[];
  cloudBackupNames: string[];
  cloudConfigured: boolean;
  encryptionEnabled: boolean;
  cronSchedule: string;
  retainCount: number;
  cloudRetainCount: number;
  rcloneRemote: string;
  recentLogs: string;
  flash?: { type: "success" | "error"; message: string };
}

export const BackupsPage: FC<Props> = ({
  user,
  isSuperuser,
  notifications,
  version,
  localBackups,
  cloudBackupNames,
  cloudConfigured,
  encryptionEnabled,
  cronSchedule,
  retainCount,
  cloudRetainCount,
  rcloneRemote,
  recentLogs,
  flash,
}) => {
  const cloudSet = new Set(cloudBackupNames);

  // Total size of local backups
  const totalSize = localBackups.reduce((acc, b) => {
    const match = b.size.match(/^([\d.]+)([KMGT]?)$/i);
    if (!match) return acc;
    const num = parseFloat(match[1]);
    const unit = (match[2] || "").toUpperCase();
    const multiplier: Record<string, number> = { "": 1, K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
    return acc + num * (multiplier[unit] || 1);
  }, 0);

  const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  // Count how many local backups are also in cloud
  const syncedCount = localBackups.filter((b) => cloudSet.has(b.name)).length;
  // Cloud-only backups (pruned locally but still in cloud)
  const cloudOnlyCount = cloudBackupNames.filter((n) => !localBackups.some((b) => b.name === n)).length;

  return (
    <Layout title="Backups" user={user} isSuperuser={isSuperuser} notifications={notifications} version={version}>
      <h1 style="font-size:1.5rem; margin-bottom:1rem">Backups</h1>

      {flash && (
        <div class={`flash flash-${flash.type}`}>{flash.message}</div>
      )}

      {/* Status cards */}
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); margin-bottom:1rem">
        <div class="card stat">
          <div class="value">{localBackups.length}</div>
          <div class="label">Local</div>
        </div>
        {cloudConfigured && (
          <div class="card stat">
            <div class="value">{cloudBackupNames.length}</div>
            <div class="label">Cloud</div>
          </div>
        )}
        <div class="card stat">
          <div class="value">{totalSize > 0 ? formatSize(totalSize) : "—"}</div>
          <div class="label">Local Size</div>
        </div>
        <div class="card stat">
          <div class="value">
            {encryptionEnabled ? (
              <span class="badge badge-green">On</span>
            ) : (
              <span class="badge badge-yellow">Off</span>
            )}
          </div>
          <div class="label">Encryption</div>
        </div>
        <div class="card stat">
          <div class="value">
            {cloudConfigured ? (
              <span class="badge badge-green">Active</span>
            ) : (
              <span class="badge badge-gray">Off</span>
            )}
          </div>
          <div class="label">Cloud Sync</div>
        </div>
      </div>

      {/* Schedule + actions */}
      <div class="card" style="margin-bottom:1rem">
        <h2>Schedule</h2>
        <div style="display:flex; gap:2rem; flex-wrap:wrap; align-items:flex-start">
          <div>
            <p style="margin-bottom:0.25rem"><strong>Cron:</strong> <code>{cronSchedule}</code></p>
            <p style="margin-bottom:0.25rem"><strong>Local retention:</strong> {retainCount} backups</p>
            {cloudConfigured && (
              <>
                <p style="margin-bottom:0.25rem"><strong>Cloud retention:</strong> {cloudRetainCount} backups</p>
                <p style="margin-bottom:0.25rem; font-size:0.8rem; color:#94a3b8">
                  <strong>Remote:</strong> <code style="font-size:0.75rem">{rcloneRemote}</code>
                </p>
              </>
            )}
          </div>
          <div>
            <form method="POST" action="/admin/backups/run" style="display:inline">
              <button type="submit" class="btn btn-primary">
                Run Backup Now
              </button>
            </form>
            <p style="color:#64748b; font-size:0.75rem; margin-top:0.375rem">
              Immediate backup{cloudConfigured ? " + cloud upload" : ""}.
            </p>
          </div>
        </div>
      </div>

      {/* Backup file inventory */}
      <div class="card" style="margin-bottom:1rem">
        <h2>Backup Files</h2>
        {localBackups.length === 0 && cloudOnlyCount === 0 ? (
          <p style="color:#94a3b8">No backups found. The db-backup container may not be running.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Size</th>
                  <th>Encrypted</th>
                  <th>Cloud</th>
                  <th style="font-family:ui-monospace,monospace; font-size:0.75rem; color:#64748b">File</th>
                </tr>
              </thead>
              <tbody>
                {localBackups.map((b) => {
                  const isEncrypted = b.name.endsWith(".gpg");
                  const inCloud = cloudSet.has(b.name);
                  return (
                    <tr>
                      <td>{b.date}</td>
                      <td>{b.size}</td>
                      <td>
                        {isEncrypted ? (
                          <span class="badge badge-green">Yes</span>
                        ) : (
                          <span class="badge badge-gray">No</span>
                        )}
                      </td>
                      <td>
                        {!cloudConfigured ? (
                          <span style="color:#64748b">—</span>
                        ) : inCloud ? (
                          <span class="badge badge-green">Synced</span>
                        ) : (
                          <span class="badge badge-yellow">Local only</span>
                        )}
                      </td>
                      <td style="font-family:ui-monospace,monospace; font-size:0.75rem; color:#94a3b8">{b.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {cloudOnlyCount > 0 && (
              <p style="color:#94a3b8; font-size:0.8rem; margin-top:0.75rem">
                + {cloudOnlyCount} older backup{cloudOnlyCount > 1 ? "s" : ""} in cloud storage (pruned locally).
              </p>
            )}

            {cloudConfigured && syncedCount > 0 && (
              <p style="color:#6ee7b7; font-size:0.8rem; margin-top:0.5rem">
                {syncedCount} of {localBackups.length} local backup{localBackups.length > 1 ? "s" : ""} confirmed in cloud.
              </p>
            )}
          </>
        )}
      </div>

      {/* Logs */}
      <div class="card">
        <h2>Recent Backup Logs</h2>
        <pre class="logs">{recentLogs || "No logs available. The db-backup container may not be running."}</pre>
      </div>

      <p style="color:#64748b; font-size:0.75rem; margin-top:1rem">
        Configure backup settings in <a href="/admin/config">Config</a> under the Backups section.
        See <code>BACKUPS.md</code> for cloud storage setup and restore instructions.
      </p>
    </Layout>
  );
};
