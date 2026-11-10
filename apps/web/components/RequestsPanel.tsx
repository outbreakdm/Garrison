import type { DashboardAction } from "@garrison/db";
import { OUTCOME_WINDOW_MS, REQUEST_ERRORS } from "../lib/outcome";
import { ACTION_KIND, ACTION_STATUS } from "../lib/rally-schema";
import { AutoRefresh } from "./AutoRefresh";
import { When } from "./format";

type Query = Record<string, string | string[] | undefined>;

/** Still being worked on, or finished in the last few minutes. */
const isLive = (a: DashboardAction, now: number) =>
  a.status === "pending" ||
  a.status === "running" ||
  now - (a.processedAt ?? a.createdAt).getTime() < OUTCOME_WINDOW_MS;

function Rows({ actions }: { actions: DashboardAction[] }) {
  return (
    <div className="table-wrap">
      <table className="g-table requests">
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
                <td>
                  <When date={a.createdAt} mono />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What Garrison is doing for this page right now: requests still waiting, and
 * ones that finished in the last few minutes. Sits at the top and refreshes
 * the page while something is waiting. Shows nothing when all is quiet, so old
 * requests don't push the page down: those are in <RequestsHistory>.
 *
 * A form that names the control to come back to (`at`) gets its result shown
 * beside that control by <Outcome>, so the panel doesn't repeat the notice.
 */
export function RequestsPanel({
  kinds,
  query,
  actions: all,
  match,
}: {
  kinds: string[];
  query: Query;
  /** The page's own listDashboardActions, newest first. */
  actions: DashboardAction[];
  /** Narrow to what this page is about, e.g. one member. */
  match?: (action: DashboardAction) => boolean;
}) {
  const now = Date.now();
  const mine = all.filter((a) => kinds.includes(a.kind) && (match ? match(a) : true));
  const live = mine.filter((a) => isLive(a, now)).slice(0, 6);
  const working = live.some((a) => a.status === "pending" || a.status === "running");
  const inline = typeof query.at === "string";
  const queued = !inline && typeof query.queued === "string" && kinds.includes(query.queued);
  const error =
    !inline && typeof query.error === "string" ? REQUEST_ERRORS[query.error] : undefined;
  if (!live.length && !queued && !error) return null;
  return (
    <section id="requests" className="g-card table-card" aria-label="Requests in progress">
      {working ? <AutoRefresh /> : null}
      <div className="table-card__head row-between">
        <h2>{working ? "Garrison is working on it" : "Just done"}</h2>
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
      {live.length ? <Rows actions={live} /> : null}
    </section>
  );
}

/** Earlier requests from this page, folded away at the bottom. */
export function RequestsHistory({
  kinds,
  actions: all,
  match,
}: {
  kinds: string[];
  actions: DashboardAction[];
  match?: (action: DashboardAction) => boolean;
}) {
  const now = Date.now();
  const earlier = all
    .filter((a) => kinds.includes(a.kind) && (match ? match(a) : true) && !isLive(a, now))
    .slice(0, 8);
  if (!earlier.length) return null;
  return (
    <details className="g-card table-card fold">
      <summary className="fold__summary">
        <span>Earlier requests from this page</span>
        <span className="mono">{earlier.length}</span>
      </summary>
      <Rows actions={earlier} />
    </details>
  );
}
