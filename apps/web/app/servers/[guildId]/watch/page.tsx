import { cleanQuery, listEscalationRules, listRecentCases, searchCases } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionBadge, formatDuration, plainMentions } from "@/components/format";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";
import {
  durationText,
  LADDER_DURATIONS,
  LADDER_MAX_STEPS,
  LADDER_WINDOWS,
  windowText,
} from "@/lib/settings-schema";
import { saveLadder } from "../settings/actions";

export const metadata: Metadata = { title: "Watch" };

const ACTION_LABEL = { timeout: "Timeout", kick: "Kick", ban: "Ban" } as const;

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const q = cleanQuery(query.q);
  const db = await getDb();
  const [cases, rules] = await Promise.all([
    q ? searchCases(db, guild.id, q, 50) : listRecentCases(db, guild.id, 50),
    listEscalationRules(db, guild.id),
  ]);
  const first = rules[0]?.warnCount ?? 0;
  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Watch · Moderation</span>
          <h1>Watch</h1>
          <p>Escalation rules and every moderation case. Undo a case from Discord with /case.</p>
        </div>
      </div>

      {query.saved === "escalation" ? (
        <div className="notice notice--ok" role="status">
          Saved the escalation ladder. It applies from the next warning.
        </div>
      ) : query.error === "ladder" ? (
        <div className="notice" role="alert">
          Nothing was saved. Each step needs warnings (1 to 50), a time window and an action, a
          timeout needs a length, and no two steps can share a warning count.
        </div>
      ) : query.error === "unchanged" ? (
        <div className="notice" role="alert">
          Nothing changed.
        </div>
      ) : null}
      <div className="g-card card-col">
        <div className="row-between">
          <div>
            <div className="g-label">Escalation ladder</div>
            <div className="g-help">
              Applied automatically when a member's active warnings reach a step. Undone warnings
              don't count.
            </div>
          </div>
          <a className="g-btn g-btn--ghost" href="?edit=1#edit-ladder">
            Edit ladder
          </a>
        </div>
        {rules.length ? (
          <div className="ladder">
            {first > 1 ? (
              <div className="ladder__step">
                <span className="mono">
                  {first === 2 ? "1 warning" : `1–${first - 1} warnings`}
                </span>
                <span className="big">Recorded</span>
              </div>
            ) : null}
            {rules.map((r, i) => (
              <div
                key={r.id}
                className={`ladder__step ${r.action === "ban" ? "ladder__step--alert" : ""}`}
              >
                <span className={`mono ${i === rules.length - 1 ? "tone-alert" : "tone-caution"}`}>
                  {r.warnCount} warnings in {windowText(r.windowMinutes)}
                </span>
                <span className="big">
                  {ACTION_LABEL[r.action]}
                  {r.action === "timeout" && r.durationSeconds
                    ? ` ${durationText(r.durationSeconds)}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            No rules: warnings are recorded, but nothing happens automatically.
          </p>
        )}
      </div>

      <details className="g-card ladder-edit" id="edit-ladder" open={query.edit === "1"}>
        <summary className="g-label">Edit ladder</summary>
        <form
          action={saveLadder}
          className="card-col"
          key={rules
            .map((r) => `${r.warnCount}:${r.windowMinutes}:${r.action}:${r.durationSeconds}`)
            .join("|")}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <p className="g-help">
            Up to {LADDER_MAX_STEPS} steps. Leave a row's warnings blank to remove it. Every change
            is in Settings history and can be undone there.
          </p>
          {Array.from({ length: LADDER_MAX_STEPS }, (_, i) => {
            const r = rules[i];
            return (
              <fieldset key={r?.id ?? `new-${i}`} className="ladder-row">
                <legend className="sr-only">Step {i + 1}</legend>
                <label className="g-field">
                  <span>Warnings</span>
                  <input
                    className="g-input"
                    name={`step${i}_warns`}
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={r?.warnCount ?? ""}
                  />
                </label>
                <label className="g-field">
                  <span>Within</span>
                  <select
                    className="g-input"
                    name={`step${i}_window`}
                    defaultValue={String(r?.windowMinutes ?? 1440)}
                  >
                    {LADDER_WINDOWS.map((m) => (
                      <option key={m} value={m}>
                        {windowText(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="g-field">
                  <span>Then</span>
                  <select
                    className="g-input"
                    name={`step${i}_action`}
                    defaultValue={r?.action ?? ""}
                  >
                    <option value="">No step</option>
                    <option value="timeout">Timeout</option>
                    <option value="kick">Kick</option>
                    <option value="ban">Ban</option>
                  </select>
                </label>
                <label className="g-field">
                  <span>Timeout for</span>
                  <select
                    className="g-input"
                    name={`step${i}_duration`}
                    defaultValue={String(r?.durationSeconds ?? 3600)}
                  >
                    {LADDER_DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {durationText(d)}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            );
          })}
          <button type="submit" className="g-btn g-btn--primary">
            Save ladder
          </button>
        </form>
      </details>

      <div className="g-card table-card">
        <div className="table-card__head row-between">
          <span className="g-label">{q ? `Cases matching “${q}”` : "Latest 50 cases"}</span>
          <search>
            <form className="row-between" method="get">
              <label className="sr-only" htmlFor="case-search">
                Search member or case number
              </label>
              <input
                id="case-search"
                className="g-input g-input--sm"
                name="q"
                type="search"
                maxLength={64}
                placeholder="Search member or case #"
                defaultValue={q ?? ""}
              />
              {q ? (
                <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/watch`}>
                  Clear
                </Link>
              ) : null}
            </form>
          </search>
        </div>
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["Case", "Action", "Member", "Reason", "By", "When"].map((h) => (
                  <th key={h} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className={c.revokedAt ? "revoked" : undefined}>
                  <td className="mono">#{c.caseNumber}</td>
                  <td>
                    <ActionBadge action={c.action} />{" "}
                    <span className="mono">{formatDuration(c.durationSeconds)}</span>
                  </td>
                  {/* React escapes all of this: user-typed reasons can't inject markup. */}
                  <td>{c.targetTag ?? "—"}</td>
                  <td>
                    {c.reason ? (
                      plainMentions(c.reason)
                    ) : (
                      <span className="muted">No reason given</span>
                    )}
                    {c.revokedAt ? <span className="muted"> · undone</span> : null}
                  </td>
                  <td className="muted">
                    {c.source === "manual"
                      ? c.moderatorTag
                      : c.source === "escalation"
                        ? "Escalation rule"
                        : "Automod"}
                  </td>
                  <td className="mono">
                    {c.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cases.length === 0 ? <div className="table-card__head muted">No cases yet.</div> : null}
        </div>
      </div>
    </>
  );
}
