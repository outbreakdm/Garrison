import { listDashboardActions } from "@garrison/db";
import { getDb } from "@/lib/db";
import { ACTION_KIND, ACTION_STATUS } from "@/lib/rally-schema";
import { AutoRefresh } from "./AutoRefresh";
import { formatTime } from "./format";

const ERRORS: Record<string, string> = {
  invalid: "Some values weren't valid. Nothing was queued.",
  not_found: "That has changed since the page loaded. Refresh and try again.",
  channel: "Pick a text channel from this server.",
  owner_only: "Only the server owner can change anti-nuke.",
  busy: "Garrison has 10 requests waiting for this server. Try again shortly.",
  too_fast: "That's a lot of requests at once. Wait a minute and try again.",
  cooldown: "That was done recently. Try again later.",
  self: "You can't moderate yourself.",
  qm_request: "Describe what to build, in 500 characters or fewer.",
  profile:
    "That change wasn't valid. Nicknames are up to 32 characters, bios up to 190, and images must be PNG, JPEG or GIF.",
  profile_pro: "Garrison's own avatar, banner and bio in your server are part of Garrison Pro.",
  menu_empty: "Add at least one role and save the menu before posting it.",
  menu_paused: "This menu is paused: the server has more menus than its plan runs.",
  panel_empty: "Add a topic and save the panel before posting it.",
  panel_paused: "This panel is paused: the server has more panels than its plan runs.",
  giveaway:
    "Some giveaway details weren't valid: a prize, 1 to 20 winners and a length. Nothing was queued.",
  giveaway_pro: "Entry rules, bonus entries and your own colour are part of Garrison Pro.",
  giveaway_full: "This server runs as many giveaways at once as its plan allows. End one first.",
  ticket_closed: "That ticket is already closed.",
  qm_not_yours: "Only the person who asked for a plan can apply it. You can discard it.",
};

/**
 * What you asked Garrison to do from this page, and how it went. Refreshes
 * itself while a request is waiting.
 */
export async function RequestsPanel({
  guildId,
  kinds,
  query,
}: {
  guildId: string;
  kinds: string[];
  query: Record<string, string | string[] | undefined>;
}) {
  const all = await listDashboardActions(await getDb(), guildId, 30);
  const actions = all.filter((a) => kinds.includes(a.kind)).slice(0, 6);
  const working = actions.some((a) => a.status === "pending" || a.status === "running");
  const queued = typeof query.queued === "string" && kinds.includes(query.queued);
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  if (!actions.length && !queued && !error) return null;
  return (
    <section id="requests" className="g-card table-card" aria-label="Requests">
      {working ? <AutoRefresh /> : null}
      <div className="table-card__head row-between">
        <h2 className="card-title">Requests</h2>
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
