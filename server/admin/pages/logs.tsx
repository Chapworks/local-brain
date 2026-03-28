/** Log viewer — shows Docker container logs for each service. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  version?: string;
  service: string;
  logs: string;
  services: string[];
}

export const LogsPage: FC<Props> = ({ user, notifications, version, service, logs, services }) => (
  <Layout title="Logs" user={user} notifications={notifications} version={version}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Logs</h1>

    <div class="card">
      <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap">
        {services.map((svc) => (
          <a
            href={`/admin/logs?service=${svc}`}
            class={`btn ${svc === service ? "btn-primary" : "btn-ghost"}`}
            style="text-decoration:none"
          >
            {svc}
          </a>
        ))}
        <span class="spacer" style="flex:1" />
        <a
          href={`/admin/logs?service=${service}`}
          class="btn btn-ghost"
          style="text-decoration:none"
        >
          Refresh
        </a>
      </div>
    </div>

    <div class="card" style="padding:0.75rem">
      <pre class="logs">{logs || "No logs available."}</pre>
    </div>

    <div style="display:flex; gap:0.75rem; margin-top:0.5rem">
      <form method="POST" action={`/admin/api/services/${service}/restart`}>
        <button type="submit" class="btn btn-danger">
          Restart {service}
        </button>
      </form>
    </div>
  </Layout>
);
