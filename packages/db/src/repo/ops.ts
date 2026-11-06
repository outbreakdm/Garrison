import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  type LfgSlotGroup,
  type OpsEvent,
  type OpsSignup,
  opsEvents,
  opsSettings,
  opsSignups,
} from "../schema";
import { addWeeksInZone } from "../time";

export async function getOpsTimezone(db: Db, guildId: string) {
  const [row] = await db.select().from(opsSettings).where(eq(opsSettings.guildId, guildId));
  return row?.timezone ?? "UTC";
}

export async function setOpsTimezone(db: Db, guildId: string, timezone: string) {
  await db
    .insert(opsSettings)
    .values({ guildId, timezone })
    .onConflictDoUpdate({ target: opsSettings.guildId, set: { timezone, updatedAt: new Date() } });
}

export interface CreateOpsEventInput {
  guildId: string;
  channelId: string;
  hostId: string;
  title: string;
  note: string | null;
  slots: LfgSlotGroup[];
  startsAt: Date;
  timezone: string;
  repeatWeekly: boolean;
  seriesId?: string;
}

export async function createOpsEvent(db: Db, input: CreateOpsEventInput) {
  const [row] = await db.insert(opsEvents).values(input).onConflictDoNothing().returning();
  return row ?? null;
}

export async function setOpsMessage(db: Db, id: string, messageId: string) {
  await db.update(opsEvents).set({ messageId }).where(eq(opsEvents.id, id));
}

export async function getOpsEvent(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(opsEvents)
    .where(and(eq(opsEvents.guildId, guildId), eq(opsEvents.id, id)));
  return row ?? null;
}

export async function listSignups(db: Db, eventId: string) {
  return db
    .select()
    .from(opsSignups)
    .where(and(eq(opsSignups.eventId, eventId), isNull(opsSignups.leftAt)))
    .orderBy(asc(opsSignups.signedUpAt));
}

export async function listUpcomingOps(db: Db, guildId: string) {
  return db
    .select()
    .from(opsEvents)
    .where(and(eq(opsEvents.guildId, guildId), eq(opsEvents.status, "scheduled")))
    .orderBy(asc(opsEvents.startsAt));
}

export type SignUpResult =
  | { ok: true; event: OpsEvent; signups: OpsSignup[]; benched: "asked" | "role_full" | null }
  | { ok: false; reason: "not_found" | "closed" | "no_such_role" | "unchanged" };

/**
 * Sign up for `role`, or switch role/spec. A full role puts you on the bench.
 * The event row is locked for the whole transaction, so caps hold under load.
 */
export async function signUp(
  db: Db,
  eventId: string,
  userId: string,
  role: string,
  spec: string | null,
  wantBench = false,
): Promise<SignUpResult> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(opsEvents)
      .where(eq(opsEvents.id, eventId))
      .for("update");
    if (!event) return { ok: false, reason: "not_found" };
    if (event.status !== "scheduled") return { ok: false, reason: "closed" };
    const group = event.slots.find((g) => g.name === role);
    if (!group) return { ok: false, reason: "no_such_role" };

    const active = await tx
      .select()
      .from(opsSignups)
      .where(and(eq(opsSignups.eventId, eventId), isNull(opsSignups.leftAt)));
    const mine = active.find((s) => s.userId === userId);
    const inRole = active.filter((s) => s.userId !== userId && s.role === role && !s.bench).length;
    const full = inRole >= group.count;
    const bench = wantBench || full;
    if (mine && mine.role === role && mine.bench === bench && mine.spec === spec)
      return { ok: false, reason: "unchanged" };

    await tx
      .insert(opsSignups)
      .values({ eventId, userId, role, spec, bench })
      .onConflictDoUpdate({
        target: [opsSignups.eventId, opsSignups.userId],
        set: { role, spec, bench, leftAt: null, signedUpAt: mine ? mine.signedUpAt : new Date() },
      });
    const signups = await tx
      .select()
      .from(opsSignups)
      .where(and(eq(opsSignups.eventId, eventId), isNull(opsSignups.leftAt)))
      .orderBy(asc(opsSignups.signedUpAt));
    return { ok: true, event, signups, benched: wantBench ? "asked" : full ? "role_full" : null };
  });
}

export type WithdrawResult =
  | { ok: true; event: OpsEvent; signups: OpsSignup[]; promoted: OpsSignup | null }
  | { ok: false; reason: "not_found" | "closed" | "not_signed_up" };

/** Withdraw. If that frees a role spot, the earliest benched player who wanted that role takes it. */
export async function withdraw(db: Db, eventId: string, userId: string): Promise<WithdrawResult> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(opsEvents)
      .where(eq(opsEvents.id, eventId))
      .for("update");
    if (!event) return { ok: false, reason: "not_found" };
    if (event.status !== "scheduled") return { ok: false, reason: "closed" };

    const [left] = await tx
      .update(opsSignups)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(opsSignups.eventId, eventId),
          eq(opsSignups.userId, userId),
          isNull(opsSignups.leftAt),
        ),
      )
      .returning();
    if (!left) return { ok: false, reason: "not_signed_up" };

    let promoted: OpsSignup | null = null;
    if (!left.bench) {
      const [next] = await tx
        .select()
        .from(opsSignups)
        .where(
          and(
            eq(opsSignups.eventId, eventId),
            eq(opsSignups.role, left.role),
            eq(opsSignups.bench, true),
            isNull(opsSignups.leftAt),
          ),
        )
        .orderBy(asc(opsSignups.signedUpAt))
        .limit(1);
      if (next) {
        const [row] = await tx
          .update(opsSignups)
          .set({ bench: false })
          .where(and(eq(opsSignups.eventId, eventId), eq(opsSignups.userId, next.userId)))
          .returning();
        promoted = row ?? null;
      }
    }
    const signups = await tx
      .select()
      .from(opsSignups)
      .where(and(eq(opsSignups.eventId, eventId), isNull(opsSignups.leftAt)))
      .orderBy(asc(opsSignups.signedUpAt));
    return { ok: true, event, signups, promoted };
  });
}

/** Cancel a scheduled event. Returns null if it wasn't scheduled. */
export async function cancelOpsEvent(db: Db, id: string) {
  const [row] = await db
    .update(opsEvents)
    .set({ status: "cancelled" })
    .where(and(eq(opsEvents.id, id), eq(opsEvents.status, "scheduled")))
    .returning();
  return row ?? null;
}

export type ReminderKind = "24h" | "30m";
const LEAD_MS: Record<ReminderKind, number> = { "24h": 24 * 3_600_000, "30m": 30 * 60_000 };

/**
 * Claim reminders that are due: scheduled, not yet started, inside the lead
 * time and not yet sent. Claiming marks them sent, so each goes out once.
 */
export async function claimDueReminders(db: Db, kind: ReminderKind, now = new Date()) {
  const column = kind === "24h" ? opsEvents.reminded24hAt : opsEvents.reminded30mAt;
  const set = kind === "24h" ? { reminded24hAt: now } : { reminded30mAt: now };
  return db
    .update(opsEvents)
    .set(set)
    .where(
      and(
        eq(opsEvents.status, "scheduled"),
        isNull(column),
        gt(opsEvents.startsAt, now),
        lte(opsEvents.startsAt, new Date(now.getTime() + LEAD_MS[kind])),
      ),
    )
    .returning();
}

/** How long after the start an event counts as over. */
export const EVENT_DURATION_MS = 3 * 3_600_000;

/**
 * Mark finished events done and schedule the next week of repeating ones.
 * Returns what changed so the bot can update cards.
 */
export async function finishPastEvents(db: Db, now = new Date()) {
  const done = await db
    .update(opsEvents)
    .set({ status: "done" })
    .where(
      and(
        eq(opsEvents.status, "scheduled"),
        lte(opsEvents.startsAt, new Date(now.getTime() - EVENT_DURATION_MS)),
      ),
    )
    .returning();
  const next: OpsEvent[] = [];
  for (const event of done.filter((e) => e.repeatWeekly)) {
    // Same local time next week, across daylight-saving changes. If the bot
    // was down for weeks, skip ahead to the next future week.
    let startsAt = addWeeksInZone(event.startsAt, 1, event.timezone);
    while (startsAt.getTime() <= now.getTime())
      startsAt = addWeeksInZone(startsAt, 1, event.timezone);
    const created = await createOpsEvent(db, {
      guildId: event.guildId,
      channelId: event.channelId,
      hostId: event.hostId,
      title: event.title,
      note: event.note,
      slots: event.slots,
      startsAt,
      timezone: event.timezone,
      repeatWeekly: true,
      seriesId: event.seriesId,
    });
    if (created) next.push(created);
  }
  return { done, next };
}

/** Count of scheduled events per guild, for a simple spam limit. */
export async function countScheduledOps(db: Db, guildId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opsEvents)
    .where(and(eq(opsEvents.guildId, guildId), eq(opsEvents.status, "scheduled")));
  return row?.n ?? 0;
}
