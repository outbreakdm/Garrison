import { appealsOpen, listCasesForTarget } from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionBadge, formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { memberSpace } from "@/lib/member";

export const metadata: Metadata = { title: "Your record" };

/** "1 h", "3 d": how long a timeout or temporary ban ran. */
const span = (seconds: number) =>
  seconds < 3600
    ? `${Math.round(seconds / 60)} min`
    : seconds < 172_800
      ? `${Math.round(seconds / 3600)} h`
      : `${Math.round(seconds / 86_400)} d`;

/**
 * A member's own warnings, timeouts, kicks and bans in this server, newest first, and how to
 * appeal. Only their own, and only when the server shows it. Who acted is left out, the same
 * as in the DM Garrison sends.
 */
export default async function RecordPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { session, guild, show } = await memberSpace(guildId);
  if (!show.record) notFound();
  const db = await getDb();
  const [cases, appeals] = await Promise.all([
    listCasesForTarget(db, guild.id, session.userId, 50),
    appealsOpen(db, guild.id),
  ]);
  const standing = cases.filter((c) => !c.revokedAt);

  return (
    <div className="member__page">
      <div className="page-head">
        <div>
          <h1>Your record</h1>
          <p>
            {cases.length
              ? `${standing.length} of ${cases.length} ${cases.length === 1 ? "case stands" : "cases stand"}. Undone cases stay listed, marked as undone.`
              : "Nothing here: no warnings, timeouts or bans in this server."}
          </p>
        </div>
      </div>

      {cases.length ? (
        <section className="g-card table-card" aria-labelledby="record-title">
          <div className="table-card__head">
            <h2 className="card-title" id="record-title">
              Cases <span className="count">{cases.length}</span>
            </h2>
          </div>
          <ul className="member-record">
            {cases.map((c) => (
              <li
                key={c.id}
                className={c.revokedAt ? "member-record__row is-undone" : "member-record__row"}
              >
                <span className="member-record__n mono">#{c.caseNumber}</span>
                <ActionBadge action={c.action} />
                <span className="member-record__why">
                  {c.reason ?? "No reason given"}
                  {c.durationSeconds ? (
                    <span className="muted"> · {span(c.durationSeconds)}</span>
                  ) : null}
                  {c.revokedAt ? <span className="g-badge g-badge--off">Undone</span> : null}
                </span>
                <span className="member-record__when muted">{formatTime(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {cases.length && appeals ? (
        <p className="g-help">
          Think one was a mistake? <a href={`/appeal/${guild.id}`}>Appeal it</a>: the server's staff
          read every appeal.
        </p>
      ) : cases.length ? (
        <p className="g-help">
          This server doesn't take appeals here. Ask its staff in Discord if something looks wrong.
        </p>
      ) : null}
    </div>
  );
}
