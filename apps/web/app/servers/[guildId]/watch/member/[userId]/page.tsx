import {
  getMemberRank,
  levelForXp,
  listCasesForTarget,
  listMemberNotes,
  NOTE_MAX,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionBadge, formatDuration, formatTime, plainMentions } from "@/components/format";
import { MemberAvatar } from "@/components/MemberAvatar";
import { RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listGuildRoles } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { durationText } from "@/lib/settings-schema";
import { requestAction } from "../../../requests";
import { addNote, removeNote } from "../../actions";

export const metadata: Metadata = { title: "Member" };

const TIMEOUTS = [60, 600, 3600, 21_600, 86_400, 604_800, 2_419_200];
const UNDOABLE = new Set(["warn", "timeout", "ban"]);

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
  const [member, cases, rank, roles, notes, flash] = await Promise.all([
    fetchMemberCard(guild.id, userId).catch(() => null),
    listCasesForTarget(db, guild.id, userId, 25),
    getMemberRank(db, guild.id, userId),
    listGuildRoles(guild.id).catch(() => []),
    listMemberNotes(db, guild.id, userId),
    readFlash(),
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

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="kind" value="mod_action" />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={action} />
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
      <div className="page-head">
        <div className="member-head">
          <MemberAvatar name={name} src={member?.avatar ?? null} size="lg" />
          <div>
            <h1>{name}</h1>
            <p className="mono">
              {member && member.username !== name ? `${member.username} · ` : ""}
              {userId}
              {member?.bot ? " · bot" : ""}
            </p>
          </div>
        </div>
        <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/watch`}>
          Back to Watch
        </Link>
      </div>

      <RequestsPanel guildId={guild.id} kinds={["mod_action", "undo_case"]} query={query} />

      <section className="g-card readout readout--3" aria-label="Member">
        <div className="readout__cell">
          <span className="g-label">In this server</span>
          <span className="readout__value readout__value--text">
            {here && member?.joinedAt
              ? `Since ${member.joinedAt.toISOString().slice(0, 10)}`
              : "Not a member"}
          </span>
          {member?.timedOutUntil ? (
            <span className="tone-caution mono">
              Timed out until {formatTime(member.timedOutUntil)}
            </span>
          ) : null}
        </div>
        <div className="readout__cell">
          <span className="g-label">Active warnings</span>
          <span className={`readout__value ${warnings ? "tone-caution" : ""}`}>{warnings}</span>
          <span className="g-help">{cases.length} cases in all</span>
        </div>
        <div className="readout__cell">
          <span className="g-label">Rank</span>
          <span className="readout__value readout__value--text">
            {rank && level ? `Level ${level.level}` : "No XP yet"}
          </span>
          {rank ? (
            <span className="g-help mono">
              #{rank.position} · {rank.xp.toLocaleString("en-US")} XP
            </span>
          ) : null}
        </div>
      </section>

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
        <section className="g-card card-col" aria-label="Moderate">
          <div>
            <h2 className="card-title">Moderate</h2>
            <p className="g-help">
              Garrison acts in Discord as you, usually within seconds, and records a case. You need
              the matching Discord permission, such as Kick Members to kick.
            </p>
          </div>
          <div className="mod-grid">
            <form action={requestAction} className="mod-action">
              {hidden("warn")}
              <h2>Warn</h2>
              <p className="g-help">Counts toward the escalation ladder.</p>
              {reason("warn-reason")}
              <button type="submit" className="g-btn g-btn--secondary" disabled={!here}>
                Warn {name}
              </button>
            </form>
            <form action={requestAction} className="mod-action">
              {hidden("timeout")}
              <h2>Time out</h2>
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
              <h2>Kick</h2>
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
              <h2>Ban</h2>
              <p className="g-help">
                Works whether or not they're in the server. A temporary ban lifts itself; any ban
                can be undone from their cases.
              </p>
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--ghost">Ban…</summary>
                <form action={requestAction} className="card-col">
                  {hidden("ban")}
                  <label className="g-field" htmlFor="ban-length">
                    <span>How long</span>
                    <select className="g-input" id="ban-length" name="banLength" defaultValue="0">
                      <option value="0">Permanent (until undone)</option>
                      <option value="3600">1 hour</option>
                      <option value="86400">1 day</option>
                      <option value="259200">3 days</option>
                      <option value="604800">1 week</option>
                      <option value="2592000">30 days</option>
                      <option value="7776000">90 days</option>
                    </select>
                  </label>
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

      <section className="g-card card-col" id="notes" aria-labelledby="notes-title">
        <h2 className="card-title" id="notes-title">
          Staff notes <span className="count">{notes.length}</span>
        </h2>
        <p className="g-help">Only staff see these, here and with /note in Discord.</p>
        {flash?.ok ? (
          <div className="notice notice--ok" role="status">
            {flash.ok}
          </div>
        ) : null}
        {flash?.error ? (
          <div className="notice" role="alert">
            {flash.error}
          </div>
        ) : null}
        {notes.length ? (
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <p>{n.body}</p>
                <span className="g-help">
                  {n.authorName} · {formatTime(n.createdAt)}
                </span>
                <form action={removeNote}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="userId" value={userId} />
                  <input type="hidden" name="noteId" value={n.id} />
                  <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addNote} className="card-col">
          <input type="hidden" name="guildId" value={guild.id} />
          <input type="hidden" name="userId" value={userId} />
          <label className="g-field" htmlFor="note-body">
            <span>Add a note</span>
            <textarea
              className="g-input"
              id="note-body"
              name="body"
              rows={2}
              maxLength={NOTE_MAX}
              required
            />
          </label>
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--secondary">
              Add note
            </button>
          </div>
        </form>
      </section>

      <div className="g-card table-card">
        <div className="table-card__head row-between">
          <h2 className="card-title">Cases</h2>
          <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/ledger?user=${userId}`}>
            Their log events
          </Link>
        </div>
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
                      <ActionBadge action={c.action} />{" "}
                      <span className="mono">{formatDuration(c.durationSeconds)}</span>
                    </td>
                    {/* React escapes this: a typed reason can't inject markup. */}
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
                    <td className="mono">{formatTime(c.createdAt)}</td>
                    <td>
                      {!c.revokedAt && UNDOABLE.has(c.action) ? (
                        <form action={requestAction}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value={page} />
                          <input type="hidden" name="kind" value="undo_case" />
                          <input type="hidden" name="caseNumber" value={c.caseNumber} />
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
    </>
  );
}
