import { getMemberRank, levelForXp, listCasesForTarget, listDashboardActions } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionBadge, formatDuration, formatTime, plainMentions, When } from "@/components/format";
import { MemberAvatar } from "@/components/MemberAvatar";
import { Outcome } from "@/components/Outcome";
import { CardHead, PageHead } from "@/components/PageHead";
import { RequestsHistory, RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listGuildRoles } from "@/lib/discord";
import { errorAt, latestOutcome, payloadField } from "@/lib/outcome";
import { PAGES } from "@/lib/pages";
import { requireGuildAccess } from "@/lib/session";
import { durationText } from "@/lib/settings-schema";
import { requestAction } from "../../../requests";

export const metadata: Metadata = { title: "Member" };

const TIMEOUTS = [60, 600, 3600, 21_600, 86_400, 604_800, 2_419_200];
const UNDOABLE = new Set(["warn", "timeout", "ban"]);
const KINDS = ["mod_action", "undo_case"];
const joined = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" }).format(d);

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId, userId } = await params;
  const { guild, session } = await requireGuildAccess(guildId);
  if (!/^\d{17,20}$/.test(userId)) notFound();
  const query = await searchParams;
  const db = await getDb();
  const [member, cases, rank, roles, actions] = await Promise.all([
    fetchMemberCard(guild.id, userId).catch(() => null),
    listCasesForTarget(db, guild.id, userId, 25),
    getMemberRank(db, guild.id, userId),
    listGuildRoles(guild.id).catch(() => []),
    listDashboardActions(db, guild.id, 30),
  ]);
  // Someone Discord no longer knows can still have cases here: show those under their last name.
  const name = member?.name ?? cases[0]?.targetTag ?? rank?.username ?? null;
  if (!name) notFound();
  const here = Boolean(member?.joinedAt);
  const page = `watch/member/${userId}`;
  const isSelf = userId === session.userId;
  const memberRoles = roles.filter((r) => member?.roleIds.includes(r.id));
  const warnings = cases.filter((c) => c.action === "warn" && !c.revokedAt).length;
  const level = rank ? levelForXp(rank.xp) : null;
  // Your last action on this member, and your last undo of one of their cases.
  const moderated = latestOutcome(actions, {
    userId: session.userId,
    kinds: ["mod_action"],
    match: (p) => payloadField(p, "userId") === userId,
  });
  const theirCases = new Set(cases.map((c) => String(c.caseNumber)));
  /** Requests about this member only: other members' aren't this page's business. */
  const aboutThem = (a: { payload: unknown }) =>
    payloadField(a.payload, "userId") === userId ||
    theirCases.has(payloadField(a.payload, "caseNumber") ?? "");
  const undone = latestOutcome(actions, {
    userId: session.userId,
    kinds: ["undo_case"],
    match: (p) => theirCases.has(payloadField(p, "caseNumber") ?? ""),
  });

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="kind" value="mod_action" />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="at" value="moderate" />
    </>
  );
  const reason = (id: string) => (
    <label className="g-field" htmlFor={id}>
      <span>Reason</span>
      <input
        className="g-input"
        id={id}
        name="reason"
        maxLength={512}
        placeholder="Shown to them and in the log"
      />
    </label>
  );

  return (
    <>
      <PageHead
        back={{ href: `/servers/${guild.id}/watch`, label: PAGES.watch.title }}
        title={
          <span className="member-head">
            <MemberAvatar name={name} src={member?.avatar ?? null} size="lg" />
            <span>{name}</span>
          </span>
        }
        description={
          <span className="mono">
            {member && member.username !== name ? `${member.username} · ` : ""}
            {userId}
            {member?.bot ? " · bot" : ""}
          </span>
        }
      >
        <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/ledger?user=${userId}`}>
          Their events in the log
        </Link>
      </PageHead>

      <RequestsPanel kinds={KINDS} query={query} actions={actions} match={aboutThem} />

      <div className="grid-stats">
        <div className="g-card stat">
          <span className="stat__label">In this server</span>
          <span className="g-stat stat-text">
            {here && member?.joinedAt ? `Since ${joined(member.joinedAt)}` : "Not a member"}
          </span>
          {member?.timedOutUntil ? (
            <span className="tone-caution mono">
              Timed out until {formatTime(member.timedOutUntil)}
            </span>
          ) : null}
        </div>
        <div className="g-card stat">
          <span className="stat__label">Active warnings</span>
          <span className={`g-stat ${warnings ? "tone-caution" : ""}`}>{warnings}</span>
          <span className="muted">{cases.length} cases in all</span>
        </div>
        <div className="g-card stat">
          <span className="stat__label">Level</span>
          <span className="g-stat stat-text">
            {rank && level ? `Level ${level.level}` : "No XP yet"}
          </span>
          {rank ? (
            <span className="muted mono">
              #{rank.position} on the leaderboard · {rank.xp.toLocaleString("en-US")} XP
            </span>
          ) : null}
        </div>
      </div>

      {memberRoles.length ? (
        <div className="g-card card-col">
          <h2 className="card-title">Roles</h2>
          <div className="chip-row">
            {memberRoles.map((r) => (
              <span className="g-badge" key={r.id}>
                {r.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {isSelf ? (
        <div className="g-card muted">This is you. Moderators can't act on themselves.</div>
      ) : (
        <section className="g-card card-col" id="moderate" aria-label="Moderate">
          <CardHead
            title={`Moderate ${name}`}
            help="Garrison acts in Discord as you, usually within seconds, and records a case. You need the matching Discord permission, such as Kick Members to kick."
          />
          <Outcome action={moderated} error={errorAt(query, "moderate")} />
          <div className="mod-grid">
            <form action={requestAction} className="mod-action">
              {hidden("warn")}
              <h3>Warn</h3>
              <p className="g-help">Enough warnings lead to an automatic timeout or ban.</p>
              {reason("warn-reason")}
              <button type="submit" className="g-btn g-btn--secondary" disabled={!here}>
                Warn {name}
              </button>
            </form>
            <form action={requestAction} className="mod-action">
              {hidden("timeout")}
              <h3>Time out</h3>
              <p className="g-help">They can read, but not talk or join voice.</p>
              <label className="g-field" htmlFor="timeout-duration">
                <span>For</span>
                <select
                  className="g-input"
                  id="timeout-duration"
                  name="duration"
                  defaultValue="3600"
                >
                  {TIMEOUTS.map((s) => (
                    <option key={s} value={s}>
                      {durationText(s)}
                    </option>
                  ))}
                </select>
              </label>
              {reason("timeout-reason")}
              <button type="submit" className="g-btn g-btn--secondary" disabled={!here}>
                Time out {name}
              </button>
            </form>
            <div className="mod-action">
              <h3>Kick</h3>
              <p className="g-help">Removes them. They can rejoin with an invite.</p>
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--ghost">Kick…</summary>
                <form action={requestAction} className="card-col">
                  {hidden("kick")}
                  {reason("kick-reason")}
                  <button type="submit" className="g-btn g-btn--danger" disabled={!here}>
                    Yes, kick {name}
                  </button>
                </form>
              </details>
            </div>
            <div className="mod-action">
              <h3>Ban</h3>
              <p className="g-help">
                Works whether or not they're in the server. Undo it from their cases.
              </p>
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--ghost">Ban…</summary>
                <form action={requestAction} className="card-col">
                  {hidden("ban")}
                  <label className="g-field" htmlFor="ban-delete">
                    <span>Delete their recent messages</span>
                    <select className="g-input" id="ban-delete" name="deleteMessages">
                      <option value="0">Don't delete any</option>
                      <option value="3600">Last hour</option>
                      <option value="86400">Last 24 hours</option>
                      <option value="604800">Last 7 days</option>
                    </select>
                  </label>
                  {reason("ban-reason")}
                  <button type="submit" className="g-btn g-btn--danger">
                    Yes, ban {name}
                  </button>
                </form>
              </details>
            </div>
          </div>
          {!here ? (
            <p className="g-help">
              {name} isn't in the server, so only a ban is possible. It stops them joining.
            </p>
          ) : null}
        </section>
      )}

      <div className="g-card table-card" id="cases">
        <div className="table-card__head">
          <h2>Their cases</h2>
        </div>
        {undone || errorAt(query, "cases") ? (
          <div className="table-card__head">
            <Outcome action={undone} error={errorAt(query, "cases")} />
          </div>
        ) : null}
        {cases.length ? (
          <div className="table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  {["Case", "Action", "Reason", "By", "When", ""].map((h) => (
                    <th key={h || "actions"} scope="col">
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
                      <span className="nowrap">
                        <ActionBadge action={c.action} />{" "}
                        <span className="mono">{formatDuration(c.durationSeconds)}</span>
                      </span>
                    </td>
                    {/* React escapes this: a typed reason can't inject markup. */}
                    <td>
                      {c.reason ? (
                        plainMentions(c.reason)
                      ) : (
                        <span className="muted">No reason given</span>
                      )}
                    </td>
                    <td className="muted">
                      {c.source === "manual"
                        ? c.moderatorTag
                        : c.source === "escalation"
                          ? "Escalation rule"
                          : "Automod"}
                    </td>
                    <td>
                      <When date={c.createdAt} mono />
                    </td>
                    <td>
                      {c.revokedAt ? (
                        <span className="g-badge">Undone</span>
                      ) : UNDOABLE.has(c.action) ? (
                        <form action={requestAction}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value={page} />
                          <input type="hidden" name="kind" value="undo_case" />
                          <input type="hidden" name="caseNumber" value={c.caseNumber} />
                          <input type="hidden" name="at" value="cases" />
                          <button type="submit" className="g-btn g-btn--ghost">
                            Undo
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-card__head muted">No cases. A clean record.</div>
        )}
      </div>

      <RequestsHistory kinds={KINDS} actions={actions} match={aboutThem} />
    </>
  );
}
