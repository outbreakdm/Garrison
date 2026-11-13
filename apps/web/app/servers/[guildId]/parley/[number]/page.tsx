import {
  getOpsTimezone,
  getTicketByNumber,
  listTicketMessages,
  listTicketNotes,
  TICKET_LIMITS,
  waitingOn,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTime, plainMentions } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../../requests";
import { addNote } from "../actions";

export const metadata: Metadata = { title: "Ticket" };

/** Only files Discord hosts are linked: the transcript never links anywhere else. */
const DISCORD_CDN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//;

const WAITS = {
  staff: { label: "Waiting on staff", tone: "g-badge--caution" },
  member: { label: "Waiting on member", tone: "g-badge--intel" },
  closed: { label: "Closed", tone: "g-badge--off" },
} as const;

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId, number: raw } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1) notFound();
  const db = await getDb();
  const [ticket, tz] = await Promise.all([
    getTicketByNumber(db, guild.id, number),
    getOpsTimezone(db, guild.id),
  ]);
  if (!ticket) notFound();
  const [lines, notes, flash] = await Promise.all([
    listTicketMessages(db, ticket.id),
    listTicketNotes(db, ticket.id),
    readFlash(),
  ]);
  const waits = WAITS[waitingOn(ticket)];
  const when = (d: Date) => formatTime(d, tz);
  const page = `parley/${ticket.number}`;
  const open = ticket.status === "open";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            #{ticket.number} · {ticket.topicLabel}
          </h1>
          <p>
            Opened by {ticket.openerName} on {when(ticket.openedAt)}.{" "}
            {ticket.claimedName ? `Claimed by ${ticket.claimedName}.` : "Nobody has claimed it."}
          </p>
        </div>
        <div className="ticket-head__side">
          <span className={`g-badge ${waits.tone}`}>{waits.label}</span>
          <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/parley`}>
            Back to Tickets
          </Link>
        </div>
      </div>

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

      <RequestsPanel guildId={guild.id} kinds={["ticket_action"]} query={query} />

      <div className="ticket-layout">
        <section className="g-card transcript" aria-labelledby="transcript-title">
          <div className="transcript__head">
            <h2 className="card-title" id="transcript-title">
              Transcript
            </h2>
            <span className="g-help">
              {ticket.messageCount} {ticket.messageCount === 1 ? "message" : "messages"}
              {ticket.expiresAt ? ` · kept until ${when(ticket.expiresAt)}` : ""} ·{" "}
              <a href={`/servers/${guild.id}/parley/${ticket.number}/transcript`} download>
                Download as text
              </a>
            </span>
          </div>
          {ticket.answers.length ? (
            <dl className="answers">
              {ticket.answers.map((a) => (
                <div key={a.question}>
                  <dt className="g-label">{a.question}</dt>
                  <dd>{a.answer}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {lines.length ? (
            <ol className="transcript__list">
              {lines.map((m) =>
                m.kind === "event" ? (
                  <li className="tline tline--event" key={m.id}>
                    <span>{plainMentions(m.content)}</span>
                    <time className="mono" dateTime={m.createdAt.toISOString()}>
                      {when(m.createdAt)}
                    </time>
                  </li>
                ) : (
                  <li className={`tline${m.deletedAt ? " tline--deleted" : ""}`} key={m.id}>
                    <div className="tline__meta">
                      <span className="tline__author">{m.authorName}</span>
                      {m.staff ? <span className="g-badge g-badge--go">Staff</span> : null}
                      <time className="mono" dateTime={m.createdAt.toISOString()}>
                        {when(m.createdAt)}
                      </time>
                      {m.editedAt ? <span className="g-help">edited</span> : null}
                      {m.deletedAt ? <span className="g-help">deleted in Discord</span> : null}
                    </div>
                    {m.content ? <p className="tline__text">{plainMentions(m.content)}</p> : null}
                    {m.attachments.length ? (
                      <ul className="tline__files">
                        {m.attachments.map((a) => (
                          <li key={a.url}>
                            {DISCORD_CDN.test(a.url) ? (
                              <a href={a.url} rel="noreferrer noopener" target="_blank">
                                {a.name}
                              </a>
                            ) : (
                              a.name
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ),
              )}
            </ol>
          ) : (
            <p className="muted">Nothing written yet.</p>
          )}
          {lines.some((m) => m.attachments.length) ? (
            <p className="g-help">Discord's file links expire after a while; open them soon.</p>
          ) : null}
        </section>

        <aside className="card-col ticket-side">
          <div className="g-card card-col">
            <h2 className="card-title">Ticket</h2>
            <dl className="ticket-facts">
              <div>
                <dt className="g-label">Opened by</dt>
                <dd>{ticket.openerName}</dd>
              </div>
              <div>
                <dt className="g-label">Claimed by</dt>
                <dd>{ticket.claimedName ?? "Nobody"}</dd>
              </div>
              {ticket.firstResponseAt ? (
                <div>
                  <dt className="g-label">First staff reply</dt>
                  <dd>{when(ticket.firstResponseAt)}</dd>
                </div>
              ) : null}
              {ticket.closedAt ? (
                <div>
                  <dt className="g-label">Closed</dt>
                  <dd>
                    {when(ticket.closedAt)} by {ticket.closedByName ?? "staff"}
                    {ticket.closeReason ? `: ${ticket.closeReason}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            {open ? (
              <>
                <form action={requestAction}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="page" value={page} />
                  <input type="hidden" name="kind" value="ticket_action" />
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="op" value="claim" />
                  <button type="submit" className="g-btn g-btn--secondary">
                    Claim it myself
                  </button>
                </form>
                {/* Closing deletes the channel, so it asks once. */}
                <details className="confirm">
                  <summary className="confirm__toggle g-btn g-btn--danger">Close ticket…</summary>
                  <form action={requestAction} className="card-col">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="page" value={page} />
                    <input type="hidden" name="kind" value="ticket_action" />
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="op" value="close" />
                    <label className="g-field" htmlFor="reason">
                      <span>Reason (optional)</span>
                      <input
                        className="g-input"
                        id="reason"
                        name="reason"
                        maxLength={TICKET_LIMITS.reason}
                        placeholder="Kept with the transcript"
                      />
                    </label>
                    <button type="submit" className="g-btn g-btn--danger">
                      Close ticket
                    </button>
                    <span className="g-help">
                      Garrison deletes the channel 10 seconds later. The transcript stays here.
                    </span>
                  </form>
                </details>
              </>
            ) : (
              <form action={requestAction} className="card-col">
                <input type="hidden" name="guildId" value={guild.id} />
                <input type="hidden" name="page" value={page} />
                <input type="hidden" name="kind" value="ticket_action" />
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input type="hidden" name="op" value="reopen" />
                <button type="submit" className="g-btn g-btn--secondary">
                  Reopen ticket
                </button>
                <span className="g-help">
                  Garrison opens a new channel for {ticket.openerName} and the staff. The transcript
                  carries on here.
                </span>
              </form>
            )}
          </div>

          <div className="g-card card-col" id="notes">
            <h2 className="card-title">Staff notes</h2>
            <p className="g-help">Only staff on the dashboard see these, never the member.</p>
            {notes.length ? (
              <ul className="notes">
                {notes.map((n) => (
                  <li key={n.id}>
                    <p>{n.body}</p>
                    <span className="g-help">
                      {n.authorName} · {when(n.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={addNote} className="card-col">
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="number" value={ticket.number} />
              <label className="g-field" htmlFor="body">
                <span>Add a note</span>
                <textarea
                  className="g-input"
                  id="body"
                  name="body"
                  rows={3}
                  maxLength={TICKET_LIMITS.note}
                  required
                />
              </label>
              <button type="submit" className="g-btn g-btn--secondary">
                Add note
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
