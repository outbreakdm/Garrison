import { type DashboardAction, listDashboardActions } from "@garrison/db";
import { getDb } from "@/lib/db";
import { REQUEST_ERRORS } from "@/lib/outcome";
import { ACTION_KIND, ACTION_STATUS } from "@/lib/rally-schema";
import { AutoRefresh } from "./AutoRefresh";
import { formatTime } from "./format";

/**
 * What you asked Garrison to do from this page, and how it went. Refreshes
 * itself while a request is waiting. A form that names the control to come
 * back to (`at`) gets its result shown beside that control instead, by
 * <Outcome>, so the panel doesn't repeat the notice.
 */
export async function RequestsPanel({
  guildId,
  kinds,
  query,
  actions: loaded,
  limit = 6,
}: {
  guildId: string;
  kinds: string[];
  query: Record<string, string | string[] | undefined>;
  /** The page's own listDashboardActions, newest first, to save a second read. */
  actions?: DashboardAction[];
  limit?: number;
}) {
  const all = loaded ?? (await listDashboardActions(await getDb(), guildId, 30));
  const actions = all.filter((a) => kinds.includes(a.kind)).slice(0, limit);
  const working = actions.some((a) => a.status === "pending" || a.status === "running");
  const inline = typeof query.at === "string";
  const queued = !inline && typeof query.queued === "string" && kinds.includes(query.queued);
  const error =
    !inline && typeof query.error === "string" ? REQUEST_ERRORS[query.error] : undefined;
  if (!actions.length && !queued && !error) return null;
  return (
    <section id="requests" className="g-card table-card" aria-label="Requests">
      {working ? <AutoRefresh /> : null}
      <div className="table-card__head row-between">
        <span className="g-label">Requests</span>
        <span className="g-help">Garrison does these in Discord, usually within seconds.</span>
      </div>
      {queued && !error ? (
        <div className="table-card__head">
          <span className="notice notice--ok" role="status">
            Queued: {ACTION_KIND[String(query.queued)] ?? "request"}. This updates by itself.
          </span>
        </div>
      ) : null}
      {error ? (
        <div className="table-card__head">
          <span className="notice" role="alert">
            {error}
          </span>
        </div>
      ) : null}
      {actions.length ? (
        <div className="table-wrap">
          <table className="g-table">
            <tbody>
              {actions.map((a) => {
                const st = ACTION_STATUS[a.status] ?? { label: a.status, tone: "g-badge" };
                return (
                  <tr key={a.id}>
                    <td>
                      <span className={st.tone}>{st.label}</span>
                    </td>
                    <td>{ACTION_KIND[a.kind] ?? a.kind}</td>
                    <td className="muted">{a.message ?? "Waiting for Garrison"}</td>
                    <td>{a.requestedByName}</td>
                    <td className="mono">{formatTime(a.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
