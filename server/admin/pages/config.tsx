/** Configuration viewer/editor — shows current .env values with masked secrets. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface ConfigEntry {
  key: string;
  value: string;
  masked: boolean;
  section: string;
}

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  version?: string;
  config: ConfigEntry[];
  flash?: { type: "success" | "error"; message: string };
}

export const ConfigPage: FC<Props> = ({ user, notifications, version, config, flash }) => {
  const sections = [...new Set(config.map((c) => c.section))];

  return (
    <Layout title="Configuration" user={user} notifications={notifications} version={version}>
      <h1 style="font-size:1.5rem; margin-bottom:1rem">Configuration</h1>

      {flash && (
        <div class={`flash flash-${flash.type}`}>{flash.message}</div>
      )}

      <form method="POST" action="/admin/config">
        {sections.map((section) => (
          <div class="card">
            <h2>{section}</h2>
            {config
              .filter((c) => c.section === section)
              .map((entry) => (
                <div class="form-group">
                  <label for={entry.key}>{entry.key}</label>
                  <div style="display:flex; gap:0.5rem">
                    <input
                      type={entry.masked ? "password" : "text"}
                      id={entry.key}
                      name={entry.key}
                      value={entry.masked ? "" : entry.value}
                      placeholder={
                        entry.masked
                          ? `Current: ****${entry.value.slice(-4)}`
                          : ""
                      }
                    />
                  </div>
                  {entry.masked && (
                    <small style="color:#64748b; font-size:0.75rem">
                      Leave blank to keep current value.
                    </small>
                  )}
                </div>
              ))}
          </div>
        ))}

        <div style="display:flex; gap:0.75rem; margin-top:1rem; flex-wrap:wrap">
          <button type="submit" class="btn btn-primary">
            Save Configuration
          </button>
          <button
            type="submit"
            name="_restart"
            value="1"
            class="btn btn-danger"
          >
            Save &amp; Restart MCP Server
          </button>
          <button
            type="submit"
            name="_restart_backup"
            value="1"
            class="btn btn-danger"
          >
            Save &amp; Restart Backup Service
          </button>
        </div>
      </form>

      <p style="color:#64748b; font-size:0.75rem; margin-top:1rem">
        Changes are written to the .env file. Some changes require a service restart to take effect.
      </p>
    </Layout>
  );
};
