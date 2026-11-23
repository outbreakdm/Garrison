import { and, count, desc, eq, gte, max, ne, type SQL, sql } from "drizzle-orm";
import type { Db } from "../client";
import type { QmWrite } from "../qm-writes";
import {
  guildPlans,
  type QmBuild,
  type QmCreated,
  type QmEdit,
  type QmMessage,
  type QmOperation,
  type QmOrder,
  type QmPost,
  type QmSettingChange,
  qmBuilds,
  qmMessages,
} from "../schema";

export interface CreatePlanInput {
  guildId: string;
  requestedById: string;
  requestedByTag: string;
  prompt: string;
  summary: string;
  plan: QmOperation[];
  /** Settings it changes, one entry per field. */
  settings?: QmSettingChange[];
  /** Saved items it posts. */
  posts?: QmPost[];
  /** New orders it sets. */
  orders?: QmOrder[];
  /** Changes to existing items and deletions. */
  edits?: QmEdit[];
  /** Text it writes. */
  writes?: QmWrite[];
  model: string;
  notes?: string | null;
  continuesId?: string | null;
}

/**
 * Drafts have no time limit (since 2026-11-23; 15 minutes before): a plan waits until it's
 * built, discarded, or replaced by the same person's next draft on that server, so an admin
 * can leave and come back to finish setting up. The bot checks it against the server again
 * before building (`staleReferences` in apps/bot quartermaster/plan.ts).
 */
export const qmWaiting = (b: Pick<QmBuild, "status">) => b.status === "pending";

/** Leaves one person's waiting drafts on a server out of a count, when a new one replaces them. */
export interface DraftsOf {
  guildId: string;
  personId: string;
}

/** A list's entries that cost a supply: all but hand changes (`by` "admin"). */
const charged = (
  column: typeof qmBuilds.edits | typeof qmBuilds.orders | typeof qmBuilds.created,
) =>
  sql`(select count(*) from jsonb_array_elements(${column}) x where x->>'by' is distinct from 'admin')::int`;
const allCharged = sql`jsonb_array_length(${qmBuilds.plan}) + jsonb_array_length(${qmBuilds.settings}) + jsonb_array_length(${qmBuilds.posts}) + jsonb_array_length(${qmBuilds.writes}) + ${charged(qmBuilds.orders)} + ${charged(qmBuilds.edits)}`;

/**
 * Changes a build counts against the pool: what it built (all of a built plan, what got
 * made before a failure or an undo), or what a waiting plan holds until it's built,
 * discarded or replaced. Structure and settings count alike, one per item or field.
 * Discarded, replaced and (before 2026-11-23) expired plans count nothing. What supply packs
 * paid for (`pack_supplies`) isn't the pool's. `settled` leaves out waiting plans: only what
 * reached the server.
 */
const changesCounted = (settled: boolean) => sql<number>`coalesce(sum(case
  when ${qmBuilds.status} = 'applied' then ${allCharged}
  when ${qmBuilds.status} in ('failed', 'rolled_back') then ${charged(qmBuilds.created)}
  when ${qmBuilds.status} = 'pending' and ${settled ? sql`false` : sql`true`} then ${allCharged}
  else 0 end - ${qmBuilds.packSupplies}), 0)::int`;

/** What a built (or partly built) plan is charged: everything, or what it made before stopping. Hand changes are free. */
export const qmChangesMade = (
  b: Pick<QmBuild, "status" | "plan" | "settings" | "posts" | "created"> &
    Partial<Pick<QmBuild, "orders" | "edits" | "writes">>,
) =>
  b.status === "applied" ? qmChargedChanges(b) : b.created.filter((x) => x.by !== "admin").length;

/** A build's changes that cost a supply: all but the ones made by hand. */
export const qmChargedChanges = (
  b: Pick<QmBuild, "plan" | "settings" | "posts"> &
    Partial<Pick<QmBuild, "orders" | "edits" | "writes">>,
) =>
  qmChangeCount({
    ...b,
    orders: (b.orders ?? []).filter((x) => x.by !== "admin"),
    edits: (b.edits ?? []).filter((x) => x.by !== "admin"),
  });

/** A build's changes: its structure, each settings field, and each post. */
export const qmChangeCount = (
  b: Pick<QmBuild, "plan" | "settings" | "posts"> &
    Partial<Pick<QmBuild, "orders" | "edits" | "writes">>,
) =>
  b.plan.length +
  (b.settings?.length ?? 0) +
  (b.posts?.length ?? 0) +
  (b.orders?.length ?? 0) +
  (b.edits?.length ?? 0) +
  (b.writes?.length ?? 0);

/** Builds on a server that is on Free right now (no Pro row). */
const onFreeServer = sql`not exists (select 1 from ${guildPlans} where ${guildPlans.guildId} = ${qmBuilds.guildId} and ${guildPlans.plan} = 'pro')`;

/**
 * AI assistant changes used since `since`: on one server, on the servers in an Agency plan's
 * seats, or (Free) by one person across every Free server. `exceptId` leaves out a waiting
 * plan that's about to be replaced.
 */
export async function qmChangesUsed(
  db: Db,
  scope: { guildId: string } | { personId: string } | { bundleId: string },
  since: Date,
  opts: { exceptId?: string; exceptDraftsOf?: DraftsOf; settled?: boolean } = {},
) {
  const where: SQL[] = [gte(qmBuilds.createdAt, since)];
  if ("guildId" in scope) where.push(eq(qmBuilds.guildId, scope.guildId));
  else if ("bundleId" in scope)
    where.push(
      sql`${qmBuilds.guildId} in (select ${guildPlans.guildId} from ${guildPlans} where ${guildPlans.bundleId} = ${scope.bundleId})`,
    );
  else where.push(eq(qmBuilds.requestedById, scope.personId), onFreeServer);
  if (opts.exceptId) where.push(ne(qmBuilds.id, opts.exceptId));
  if (opts.exceptDraftsOf)
    where.push(
      sql`not (${qmBuilds.status} = 'pending' and ${qmBuilds.guildId} = ${opts.exceptDraftsOf.guildId} and ${qmBuilds.requestedById} = ${opts.exceptDraftsOf.personId})`,
    );
  const [row] = await db
    .select({ n: changesCounted(opts.settled ?? false) })
    .from(qmBuilds)
    .where(and(...where));
  return Number(row?.n ?? 0);
}

/** Store a pending plan with the server's next version number. Retries once if two plans race for a number. */
export async function createQmPlan(db: Db, input: CreatePlanInput): Promise<QmBuild> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ v } = { v: 0 }] = await db
      .select({ v: max(qmBuilds.version) })
      .from(qmBuilds)
      .where(eq(qmBuilds.guildId, input.guildId));
    const [row] = await db
      .insert(qmBuilds)
      .values({ ...input, version: (v ?? 0) + 1 })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
  }
  throw new Error("Could not allocate a build version");
}

export async function getQmBuild(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), eq(qmBuilds.id, id)));
  return row ?? null;
}

export async function getQmBuildByVersion(db: Db, guildId: string, version: number) {
  const [row] = await db
    .select()
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), eq(qmBuilds.version, version)));
  return row ?? null;
}

export async function listQmBuilds(db: Db, guildId: string, limit = 20) {
  return db
    .select()
    .from(qmBuilds)
    .where(eq(qmBuilds.guildId, guildId))
    .orderBy(desc(qmBuilds.version))
    .limit(limit);
}

/** Whether an AI assistant build was ever applied on a server (setup's Build step). */
export async function hasAppliedQmBuild(db: Db, guildId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), sql`${qmBuilds.appliedAt} is not null`));
  return (row?.n ?? 0) > 0;
}

/** A person's newest draft still waiting to be built on a server, or null. */
export async function latestWaitingQmBuild(db: Db, guildId: string, personId: string) {
  const [row] = await db
    .select()
    .from(qmBuilds)
    .where(
      and(
        eq(qmBuilds.guildId, guildId),
        eq(qmBuilds.requestedById, personId),
        eq(qmBuilds.status, "pending"),
      ),
    )
    .orderBy(desc(qmBuilds.version))
    .limit(1);
  return row ?? null;
}

/**
 * Retire a person's other waiting drafts on a server once a new one is saved: one draft per
 * person per server, so a draft left behind by a new conversation doesn't hold supplies
 * forever. Returns the drafts it retired.
 */
export async function retireOtherDrafts(
  db: Db,
  guildId: string,
  personId: string,
  keepId: string,
  version: number,
) {
  return db
    .update(qmBuilds)
    .set({ status: "cancelled", error: `Replaced by v${version}.` })
    .where(
      and(
        eq(qmBuilds.guildId, guildId),
        eq(qmBuilds.requestedById, personId),
        eq(qmBuilds.status, "pending"),
        ne(qmBuilds.id, keepId),
      ),
    )
    .returning({ id: qmBuilds.id });
}

/** Builds started in a server since `since`, for the hourly limit. */
export async function countRecentQmBuilds(db: Db, guildId: string, since: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), gte(qmBuilds.createdAt, since)));
  return row?.n ?? 0;
}

/** Move a build between states, only from the expected one. Returns null if it wasn't in `from`. */
export async function transitionQmBuild(
  db: Db,
  id: string,
  from: QmBuild["status"],
  to: QmBuild["status"],
  extra: Partial<Pick<QmBuild, "error" | "appliedAt" | "rolledBackAt" | "rolledBackById">> = {},
) {
  const [row] = await db
    .update(qmBuilds)
    .set({ status: to, ...extra })
    .where(and(eq(qmBuilds.id, id), eq(qmBuilds.status, from)))
    .returning();
  return row ?? null;
}

/** Append one created object, as soon as it exists. */
export async function recordQmCreated(db: Db, id: string, item: QmCreated) {
  await db
    .update(qmBuilds)
    .set({ created: sql`${qmBuilds.created} || ${JSON.stringify([item])}::jsonb` })
    .where(eq(qmBuilds.id, id));
}

/** Add one message to an AI assistant conversation. */
export async function addQmMessage(
  db: Db,
  input: {
    guildId: string;
    threadId: string;
    authorId: string;
    role: "user" | "assistant";
    text: string;
    choices?: string[];
    buildId?: string | null;
    /** What the message behind this reply was charged. */
    supplies?: number | null;
    /** The model that wrote the reply. */
    model?: string | null;
  },
): Promise<QmMessage> {
  const [row] = await db
    .insert(qmMessages)
    .values({
      ...input,
      choices: input.choices ?? [],
      buildId: input.buildId ?? null,
      supplies: input.supplies ?? null,
      model: input.model ?? null,
    })
    .returning();
  if (!row) throw new Error("Couldn't save the message");
  return row;
}

/** The newest conversation this person has on this server, or null. */
export async function latestQmThread(db: Db, guildId: string, authorId: string) {
  const [row] = await db
    .select({ threadId: qmMessages.threadId })
    .from(qmMessages)
    .where(and(eq(qmMessages.guildId, guildId), eq(qmMessages.authorId, authorId)))
    .orderBy(desc(qmMessages.createdAt))
    .limit(1);
  return row?.threadId ?? null;
}

/**
 * A person's conversations on a server, newest first: when each started and was last used,
 * its first message, and how many drafts it made. Only the author's own.
 */
export async function listQmThreads(db: Db, guildId: string, authorId: string, limit = 10) {
  const rows = await db
    .select({
      threadId: qmMessages.threadId,
      startedAt: sql<Date>`min(${qmMessages.createdAt})`.mapWith((v) => new Date(v)),
      lastAt: sql<Date>`max(${qmMessages.createdAt})`.mapWith((v) => new Date(v)),
      first: sql<string>`(array_agg(${qmMessages.text} order by ${qmMessages.createdAt}) filter (where ${qmMessages.role} = 'user'))[1]`,
      drafts: sql<number>`count(${qmMessages.buildId})::int`,
    })
    .from(qmMessages)
    .where(and(eq(qmMessages.guildId, guildId), eq(qmMessages.authorId, authorId)))
    .groupBy(qmMessages.threadId)
    .orderBy(desc(sql`max(${qmMessages.createdAt})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, first: r.first ?? "" }));
}

/**
 * Rate one of the assistant's replies in a person's own conversation: 1, -1, or null to take
 * the rating back, with an optional note. False when there's no such reply of theirs.
 */
export async function rateQmReply(
  db: Db,
  input: {
    guildId: string;
    authorId: string;
    messageId: string;
    feedback: 1 | -1 | null;
    note?: string | null;
  },
) {
  const rows = await db
    .update(qmMessages)
    .set({
      feedback: input.feedback,
      feedbackNote: input.feedback === -1 ? input.note?.trim().slice(0, 500) || null : null,
      feedbackAt: input.feedback === null ? null : new Date(),
    })
    .where(
      and(
        eq(qmMessages.id, input.messageId),
        eq(qmMessages.guildId, input.guildId),
        eq(qmMessages.authorId, input.authorId),
        eq(qmMessages.role, "assistant"),
      ),
    )
    .returning({ id: qmMessages.id });
  return rows.length > 0;
}

/**
 * Replies rated thumbs down since `since`, each with the admin's message it answered, for
 * reviewing as new eval cases (apps/bot/src/eval/collect.ts). Newest first.
 */
export async function listDownRatedReplies(db: Db, since: Date, limit = 200) {
  const replies = await db
    .select()
    .from(qmMessages)
    .where(and(eq(qmMessages.feedback, -1), gte(qmMessages.feedbackAt, since)))
    .orderBy(desc(qmMessages.feedbackAt))
    .limit(limit);
  return Promise.all(
    replies.map(async (r) => {
      const [asked] = await db
        .select({ text: qmMessages.text })
        .from(qmMessages)
        .where(
          and(
            eq(qmMessages.threadId, r.threadId),
            eq(qmMessages.role, "user"),
            sql`${qmMessages.createdAt} <= ${r.createdAt.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(desc(qmMessages.createdAt))
        .limit(1);
      return {
        id: r.id,
        at: r.feedbackAt,
        model: r.model,
        ask: asked?.text ?? "",
        reply: r.text,
        drafted: r.buildId !== null,
        note: r.feedbackNote,
      };
    }),
  );
}

/** A conversation's messages, oldest first, the most recent `limit`. Only the author's own. */
export async function listQmThread(
  db: Db,
  guildId: string,
  authorId: string,
  threadId: string,
  limit = 40,
): Promise<QmMessage[]> {
  const rows = await db
    .select()
    .from(qmMessages)
    .where(
      and(
        eq(qmMessages.guildId, guildId),
        eq(qmMessages.authorId, authorId),
        eq(qmMessages.threadId, threadId),
      ),
    )
    .orderBy(desc(qmMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}
