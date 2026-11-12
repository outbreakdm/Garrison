import { and, asc, count, desc, eq, gte, ilike, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  type Ticket,
  type TicketAnswer,
  type TicketAttachment,
  type TicketMessage,
  type TicketNote,
  type TicketPanelPost,
  ticketMessages,
  ticketNotes,
  ticketPanelPosts,
  ticketSettings,
  tickets,
} from "../schema";
import { readTicketConfig, type TicketConfig, type TicketView } from "../tickets";
import { likeEscape } from "./search";

// --- Setup -------------------------------------------------------------------

/** A server's ticket setup, with defaults for anything not set. */
export async function getTicketConfig(db: Db, guildId: string): Promise<TicketConfig> {
  const [row] = await db.select().from(ticketSettings).where(eq(ticketSettings.guildId, guildId));
  return readTicketConfig(row ?? null);
}

export async function listTicketPanelPosts(db: Db, guildId: string): Promise<TicketPanelPost[]> {
  return db.select().from(ticketPanelPosts).where(eq(ticketPanelPosts.guildId, guildId));
}

export async function getTicketPanelPost(
  db: Db,
  guildId: string,
  panelId: string,
): Promise<TicketPanelPost | null> {
  const [row] = await db
    .select()
    .from(ticketPanelPosts)
    .where(and(eq(ticketPanelPosts.guildId, guildId), eq(ticketPanelPosts.panelId, panelId)));
  return row ?? null;
}

/** Bot side: remember the message a panel was posted as, replacing any earlier one. */
export async function recordTicketPanelPost(
  db: Db,
  post: { guildId: string; panelId: string; channelId: string; messageId: string },
  now = new Date(),
) {
  await db
    .insert(ticketPanelPosts)
    .values({ ...post, postedAt: now })
    .onConflictDoUpdate({
      target: [ticketPanelPosts.guildId, ticketPanelPosts.panelId],
      set: { channelId: post.channelId, messageId: post.messageId, postedAt: now },
    });
}

// --- Tickets (bot side) --------------------------------------------------------

export interface OpenTicketInput {
  guildId: string;
  panelId: string;
  topicId: string;
  topicLabel: string;
  openerId: string;
  openerName: string;
  channelId: string;
  answers: TicketAnswer[];
  claimedBy?: string | null;
  claimedName?: string | null;
}

/** The next ticket number for a server. Numbers are never reused. */
export async function nextTicketNumber(db: Db, guildId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(max(${tickets.number}), 0)::int` })
    .from(tickets)
    .where(eq(tickets.guildId, guildId));
  return (row?.n ?? 0) + 1;
}

/**
 * Record a ticket under the number its channel was named for. If another ticket
 * took that number meanwhile, the next free one is used and returned.
 */
export async function openTicket(db: Db, input: OpenTicketInput & { number: number }) {
  const values = {
    guildId: input.guildId,
    panelId: input.panelId,
    topicId: input.topicId,
    topicLabel: input.topicLabel,
    openerId: input.openerId,
    openerName: input.openerName,
    channelId: input.channelId,
    answers: input.answers,
    claimedBy: input.claimedBy ?? null,
    claimedName: input.claimedName ?? null,
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = attempt === 0 ? input.number : await nextTicketNumber(db, input.guildId);
    const [row] = await db
      .insert(tickets)
      .values({ ...values, number })
      .onConflictDoNothing({ target: [tickets.guildId, tickets.number] })
      .returning();
    if (row) return row;
  }
  throw new Error("Could not number the ticket");
}

/** Every open ticket's channel, so the bot knows which messages belong to a transcript. */
export async function listOpenTicketChannels(db: Db) {
  return db
    .select({
      id: tickets.id,
      guildId: tickets.guildId,
      channelId: tickets.channelId,
      openerId: tickets.openerId,
    })
    .from(tickets)
    .where(eq(tickets.status, "open"));
}

export async function getTicket(db: Db, guildId: string, id: string): Promise<Ticket | null> {
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.id, id)));
  return row ?? null;
}

export async function getOpenTicketByChannel(db: Db, channelId: string): Promise<Ticket | null> {
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.channelId, channelId), eq(tickets.status, "open")));
  return row ?? null;
}

/** How many tickets this member has open in this server. */
export async function countOpenTickets(db: Db, guildId: string, openerId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(tickets)
    .where(
      and(eq(tickets.guildId, guildId), eq(tickets.openerId, openerId), eq(tickets.status, "open")),
    );
  return row?.n ?? 0;
}

/** Open tickets per staff member who has claimed any, for auto-assign. */
export async function openClaimCounts(db: Db, guildId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ by: tickets.claimedBy, n: count() })
    .from(tickets)
    .where(
      and(eq(tickets.guildId, guildId), eq(tickets.status, "open"), isNotNull(tickets.claimedBy)),
    )
    .groupBy(tickets.claimedBy);
  return new Map(rows.flatMap((r) => (r.by ? [[r.by, r.n] as const] : [])));
}

export async function claimTicket(db: Db, id: string, by: { id: string; name: string }) {
  const [row] = await db
    .update(tickets)
    .set({ claimedBy: by.id, claimedName: by.name })
    .where(and(eq(tickets.id, id), eq(tickets.status, "open")))
    .returning();
  return row ?? null;
}

export interface TicketLine {
  ticketId: string;
  guildId: string;
  discordMessageId: string;
  authorId: string;
  authorName: string;
  staff: boolean;
  content: string;
  attachments: TicketAttachment[];
  createdAt: Date;
}

/** Add a message to a ticket's transcript and note who it now waits on. */
export async function recordTicketMessage(db: Db, line: TicketLine) {
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(ticketMessages)
      .values({ ...line, kind: "message", content: line.content.slice(0, 6000) })
      .onConflictDoNothing({ target: ticketMessages.discordMessageId })
      .returning({ id: ticketMessages.id });
    if (!inserted) return;
    await tx
      .update(tickets)
      .set({
        lastFrom: line.staff ? "staff" : "member",
        lastMessageAt: line.createdAt,
        messageCount: sql`${tickets.messageCount} + 1`,
        ...(line.staff
          ? { firstResponseAt: sql`coalesce(${tickets.firstResponseAt}, ${line.createdAt})` }
          : {}),
      })
      .where(eq(tickets.id, line.ticketId));
  });
}

/** Garrison's own line in a transcript: opened, claimed, someone added, closed. */
export async function recordTicketEvent(
  db: Db,
  event: { ticketId: string; guildId: string; text: string; at?: Date },
) {
  await db.insert(ticketMessages).values({
    ticketId: event.ticketId,
    guildId: event.guildId,
    kind: "event",
    authorName: "Garrison",
    content: event.text.slice(0, 6000),
    createdAt: event.at ?? new Date(),
  });
}

/** A message in a ticket was edited: the transcript keeps the latest text. */
export async function editTicketMessage(
  db: Db,
  discordMessageId: string,
  edit: { content: string; attachments: TicketAttachment[]; at: Date },
) {
  await db
    .update(ticketMessages)
    .set({
      content: edit.content.slice(0, 6000),
      attachments: edit.attachments,
      editedAt: edit.at,
    })
    .where(eq(ticketMessages.discordMessageId, discordMessageId));
}

/** A message in a ticket was deleted: the transcript keeps it, marked deleted. */
export async function markTicketMessageDeleted(db: Db, discordMessageId: string, at = new Date()) {
  await db
    .update(ticketMessages)
    .set({ deletedAt: at })
    .where(eq(ticketMessages.discordMessageId, discordMessageId));
}

/** Close an open ticket. Null when it was already closed (a double press). */
export async function closeTicket(
  db: Db,
  close: {
    id: string;
    by: { id: string; name: string };
    reason: string | null;
    expiresAt: Date;
    at?: Date;
  },
) {
  const [row] = await db
    .update(tickets)
    .set({
      status: "closed",
      closedAt: close.at ?? new Date(),
      closedBy: close.by.id,
      closedByName: close.by.name,
      closeReason: close.reason,
      expiresAt: close.expiresAt,
    })
    .where(and(eq(tickets.id, close.id), eq(tickets.status, "open")))
    .returning();
  return row ?? null;
}

/** The ticket's channel is gone. Only if it's still that channel: a reopened ticket has a new one. */
export async function markTicketChannelGone(db: Db, id: string, channelId: string) {
  await db
    .update(tickets)
    .set({ channelGone: true })
    .where(and(eq(tickets.id, id), eq(tickets.channelId, channelId)));
}

/** Reopen a closed ticket in a new channel. Null when it wasn't closed (a double press). */
export async function reopenTicket(db: Db, id: string, channelId: string) {
  const [row] = await db
    .update(tickets)
    .set({
      status: "open",
      channelId,
      channelGone: false,
      closedAt: null,
      closedBy: null,
      closedByName: null,
      closeReason: null,
      expiresAt: null,
    })
    .where(and(eq(tickets.id, id), eq(tickets.status, "closed")))
    .returning();
  return row ?? null;
}

/** Closed tickets whose channel is still there a minute after closing (a restart in between). */
export async function listClosedTicketChannels(db: Db, before: Date) {
  return db
    .select({ id: tickets.id, guildId: tickets.guildId, channelId: tickets.channelId })
    .from(tickets)
    .where(
      and(
        eq(tickets.status, "closed"),
        eq(tickets.channelGone, false),
        lt(tickets.closedAt, before),
      ),
    )
    .limit(50);
}

/** Remove closed tickets past their expiry, with their transcripts and notes. */
export async function pruneTickets(db: Db, now = new Date()) {
  const gone = await db
    .delete(tickets)
    .where(and(eq(tickets.status, "closed"), lt(tickets.expiresAt, now)))
    .returning({ id: tickets.id });
  return gone.length;
}

// --- Tickets (dashboard side) ----------------------------------------------------

/** The queue: tickets in a view, newest activity first, optionally matching a search. */
export async function listTickets(
  db: Db,
  guildId: string,
  opts: { view: TicketView; q?: string | null; limit?: number } = { view: "all" },
): Promise<Ticket[]> {
  const where = [eq(tickets.guildId, guildId)];
  if (opts.view === "closed") where.push(eq(tickets.status, "closed"));
  else if (opts.view !== "all") where.push(eq(tickets.status, "open"));
  if (opts.view === "staff")
    where.push(or(sql`${tickets.lastFrom} IS NULL`, eq(tickets.lastFrom, "member")) ?? sql`true`);
  if (opts.view === "member") where.push(eq(tickets.lastFrom, "staff"));
  if (opts.view === "unclaimed") where.push(sql`${tickets.claimedBy} IS NULL`);
  const q = opts.q?.trim();
  if (q) {
    const number = /^#?(\d{1,9})$/.exec(q)?.[1];
    const pattern = `%${likeEscape(q)}%`;
    where.push(
      number
        ? eq(tickets.number, Number(number))
        : (or(
            ilike(tickets.openerName, pattern),
            ilike(tickets.topicLabel, pattern),
            ilike(tickets.claimedName, pattern),
            eq(tickets.openerId, q),
            sql`EXISTS (SELECT 1 FROM ${ticketMessages} WHERE ${ticketMessages.ticketId} = ${tickets.id} AND ${ticketMessages.content} ILIKE ${pattern})`,
          ) ?? sql`true`),
    );
  }
  return db
    .select()
    .from(tickets)
    .where(and(...where))
    .orderBy(
      desc(sql`coalesce(${tickets.closedAt}, ${tickets.lastMessageAt}, ${tickets.openedAt})`),
    )
    .limit(opts.limit ?? 50);
}

/** How many open tickets wait on staff, wait on the member, and have no one claiming them. */
export async function ticketQueueCounts(db: Db, guildId: string) {
  const [row] = await db
    .select({
      open: count(),
      staff: sql<number>`count(*) FILTER (WHERE ${tickets.lastFrom} IS DISTINCT FROM 'staff')::int`,
      member: sql<number>`count(*) FILTER (WHERE ${tickets.lastFrom} = 'staff')::int`,
      unclaimed: sql<number>`count(*) FILTER (WHERE ${tickets.claimedBy} IS NULL)::int`,
    })
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.status, "open")));
  return {
    open: row?.open ?? 0,
    staff: row?.staff ?? 0,
    member: row?.member ?? 0,
    unclaimed: row?.unclaimed ?? 0,
  };
}

export async function getTicketByNumber(
  db: Db,
  guildId: string,
  number: number,
): Promise<Ticket | null> {
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.number, number)));
  return row ?? null;
}

export async function listTicketMessages(
  db: Db,
  ticketId: string,
  limit = 2000,
): Promise<TicketMessage[]> {
  return db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.id))
    .limit(limit);
}

export async function listTicketNotes(db: Db, ticketId: string): Promise<TicketNote[]> {
  return db
    .select()
    .from(ticketNotes)
    .where(eq(ticketNotes.ticketId, ticketId))
    .orderBy(asc(ticketNotes.id));
}

export async function addTicketNote(
  db: Db,
  note: { ticketId: string; guildId: string; authorId: string; authorName: string; body: string },
) {
  await db.insert(ticketNotes).values(note);
}

/** Pro stats for the last `days` days: opened, closed and the median wait for a first reply. */
export async function ticketStats(db: Db, guildId: string, since: Date) {
  const [opened, closed, replies] = await Promise.all([
    db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.guildId, guildId), gte(tickets.openedAt, since))),
    db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.guildId, guildId), gte(tickets.closedAt, since))),
    db
      .select({
        minutes: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${tickets.firstResponseAt} - ${tickets.openedAt}) / 60)`,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.guildId, guildId),
          gte(tickets.openedAt, since),
          isNotNull(tickets.firstResponseAt),
        ),
      ),
  ]);
  const minutes = replies[0]?.minutes;
  return {
    opened: opened[0]?.n ?? 0,
    closed: closed[0]?.n ?? 0,
    medianFirstReplyMinutes: minutes === null || minutes === undefined ? null : Number(minutes),
  };
}
