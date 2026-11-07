import { cleanQuery, listEscalationRules, listRecentCases, searchCases } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionBadge, formatDuration } from "@/components/format";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Watch" };

const ACTION_LABEL = { timeout: "Timeout", kick: "Kick", ban: "Ban" } as const;

function windowLabel(minutes: number) {
  if (minutes % 60 === 0 && minutes <= 2880) return `${minutes / 60} h`;
  if (minutes % 1440 === 0) return `${minutes / 1440} d`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const q = cleanQuery((await searchParams).q);
  const db = getDb();
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

      <div className="g-card card-col">
        <div className="row-between">
          <div>
            <div className="g-label">Escalation ladder</div>
            <div className="g-help">
              Applied automatically when a member's active warnings reach a step. Undone warnings
              don't count.
            </div>
          </div>
          <span className="g-help">Garrison's default ladder</span>
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
                  {r.warnCount} warnings in {windowLabel(r.windowMinutes)}
                </span>
                <span className="big">
                  {ACTION_LABEL[r.action]}
                  {r.action === "timeout" ? ` ${formatDuration(r.durationSeconds)}` : ""}
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
                    {c.reason ?? <span className="muted">No reason given</span>}
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
