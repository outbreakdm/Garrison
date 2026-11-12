import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { lfgMembers, lfgPosts, opsEvents, opsSettings, opsSignups } from "../schema";

/**
 * Attendance (Pro, opt-in per server): someone signed up for a raid, or in a
 * group, who is in a voice channel in the server from 10 minutes before the start
 * to 45 minutes after it showed up. Whoever wasn't seen by then is a no-show.
 * Rows from before tracking was on, or while the bot was down, stay unknown (null).
 */

export const ATTEND_BEFORE_MS = 10 * 60_000;
export const ATTEND_AFTER_MS = 45 * 60_000;
/** Windows that closed longer ago than this are left unknown, not marked missed. */
const CLOSE_WITHIN_MS = 6 * 3_600_000;

export interface AttendanceCandidate {
  kind: "raid" | "group";
  /** The raid's or group's ID. */
  id: string;
  guildId: string;
  userId: string;
}

/** Servers that turned tracking on (the bot then keeps only those on Pro). */
export async function listAttendanceGuilds(db: Db) {
  const rows = await db
    .select({ guildId: opsSettings.guildId })
    .from(opsSettings)
    .where(eq(opsSettings.trackAttendance, true));
  return rows.map((r) => r.guildId);
}

// postgres-js won't bind a Date inside raw sql``, so times go in as ISO strings.

/** Who to look for in voice right now in these servers: undecided, in an open window. */
export async function attendanceCandidates(db: Db, guildIds: string[], now = new Date()) {
  if (!guildIds.length) return [];
  const from = new Date(now.getTime() - ATTEND_AFTER_MS);
  const to = new Date(now.getTime() + ATTEND_BEFORE_MS);
  const raids = await db
    .select({ id: opsSignups.eventId, guildId: opsEvents.guildId, userId: opsSignups.userId })
    .from(opsSignups)
    .innerJoin(opsEvents, eq(opsEvents.id, opsSignups.eventId))
    .where(
      and(
        isNull(opsSignups.attended),
        isNull(opsSignups.leftAt),
        eq(opsSignups.bench, false),
        inArray(opsEvents.status, ["scheduled", "done"]),
        sql`${opsEvents.startsAt} between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz`,
        inArray(opsEvents.guildId, guildIds),
      ),
    )
    .limit(2000);
  const start = sql`greatest(${lfgPosts.startsAt}, ${lfgMembers.joinedAt})`;
  const groups = await db
    .select({ id: lfgMembers.postId, guildId: lfgPosts.guildId, userId: lfgMembers.userId })
    .from(lfgMembers)
    .innerJoin(lfgPosts, eq(lfgPosts.id, lfgMembers.postId))
    .where(
      and(
        isNull(lfgMembers.attended),
        isNull(lfgMembers.leftAt),
        sql`${start} between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz`,
        inArray(lfgPosts.guildId, guildIds),
      ),
    )
    .limit(2000);
  return [
    ...raids.map((r) => ({ kind: "raid" as const, ...r })),
    ...groups.map((g) => ({ kind: "group" as const, ...g })),
  ] satisfies AttendanceCandidate[];
}

export async function markShowedUp(db: Db, kind: "raid" | "group", id: string, userIds: string[]) {
  if (!userIds.length) return;
  if (kind === "raid")
    await db
      .update(opsSignups)
      .set({ attended: true })
      .where(and(eq(opsSignups.eventId, id), inArray(opsSignups.userId, userIds)));
  else
    await db
      .update(lfgMembers)
      .set({ attended: true })
      .where(and(eq(lfgMembers.postId, id), inArray(lfgMembers.userId, userIds)));
}

/** Windows that just closed: whoever wasn't seen missed it. */
export async function closeAttendance(db: Db, guildIds: string[], now = new Date()) {
  if (!guildIds.length) return { raids: 0, groups: 0 };
  const closedBy = new Date(now.getTime() - ATTEND_AFTER_MS);
  const notBefore = new Date(now.getTime() - ATTEND_AFTER_MS - CLOSE_WITHIN_MS);
  const raids = await db
    .update(opsSignups)
    .set({ attended: false })
    .where(
      and(
        isNull(opsSignups.attended),
        isNull(opsSignups.leftAt),
        eq(opsSignups.bench, false),
        sql`exists (select 1 from ${opsEvents} where ${opsEvents.id} = ${opsSignups.eventId}
          and ${opsEvents.status} in ('scheduled', 'done')
          and ${opsEvents.startsAt} <= ${closedBy.toISOString()}::timestamptz and ${opsEvents.startsAt} > ${notBefore.toISOString()}::timestamptz
          and ${inArray(opsEvents.guildId, guildIds)})`,
      ),
    )
    .returning({ userId: opsSignups.userId });
  const groups = await db
    .update(lfgMembers)
    .set({ attended: false })
    .where(
      and(
        isNull(lfgMembers.attended),
        isNull(lfgMembers.leftAt),
        sql`exists (select 1 from ${lfgPosts} where ${lfgPosts.id} = ${lfgMembers.postId}
          and greatest(${lfgPosts.startsAt}, ${lfgMembers.joinedAt}) <= ${closedBy.toISOString()}::timestamptz
          and greatest(${lfgPosts.startsAt}, ${lfgMembers.joinedAt}) > ${notBefore.toISOString()}::timestamptz
          and ${inArray(lfgPosts.guildId, guildIds)})`,
      ),
    )
    .returning({ userId: lfgMembers.userId });
  return { raids: raids.length, groups: groups.length };
}

export interface MemberAttendance {
  userId: string;
  raidsShown: number;
  raidsMissed: number;
  groupsShown: number;
  groupsMissed: number;
  /** Shown out of decided, 0..100, or null with nothing decided. */
  reliability: number | null;
}

/** Per member since `since`, most no-shows first. Only decided rows count. */
export async function attendanceSummary(db: Db, guildId: string, since: Date, limit = 50) {
  type Row = {
    user_id: string;
    raids_shown: number;
    raids_missed: number;
    groups_shown: number;
    groups_missed: number;
  };
  const result = await db.execute<Row>(sql`
    with marks as (
      select s.user_id, 'raid' as kind, s.attended
      from ${opsSignups} s join ${opsEvents} e on e.id = s.event_id
      where e.guild_id = ${guildId} and e.starts_at >= ${since.toISOString()}::timestamptz and s.attended is not null
      union all
      select m.user_id, 'group' as kind, m.attended
      from ${lfgMembers} m join ${lfgPosts} p on p.id = m.post_id
      where p.guild_id = ${guildId} and p.starts_at >= ${since.toISOString()}::timestamptz and m.attended is not null
    )
    select user_id,
      count(*) filter (where kind = 'raid' and attended)::int as raids_shown,
      count(*) filter (where kind = 'raid' and not attended)::int as raids_missed,
      count(*) filter (where kind = 'group' and attended)::int as groups_shown,
      count(*) filter (where kind = 'group' and not attended)::int as groups_missed
    from marks
    group by user_id
    order by count(*) filter (where not attended) desc, count(*) desc, user_id
    limit ${limit}
  `);
  // postgres-js returns the rows; PGlite (tests) wraps them in { rows }.
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  return rows.map((r): MemberAttendance => {
    const shown = r.raids_shown + r.groups_shown;
    const total = shown + r.raids_missed + r.groups_missed;
    return {
      userId: r.user_id,
      raidsShown: r.raids_shown,
      raidsMissed: r.raids_missed,
      groupsShown: r.groups_shown,
      groupsMissed: r.groups_missed,
      reliability: total ? Math.round((shown / total) * 100) : null,
    };
  });
}

/** The latest raids that have started, with each seated player's mark. */
export async function recentRaidAttendance(db: Db, guildId: string, now = new Date(), limit = 5) {
  const events = await db
    .select()
    .from(opsEvents)
    .where(
      and(
        eq(opsEvents.guildId, guildId),
        inArray(opsEvents.status, ["scheduled", "done"]),
        sql`${opsEvents.startsAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(opsEvents.startsAt))
    .limit(limit);
  if (!events.length) return [];
  const signups = await db
    .select()
    .from(opsSignups)
    .where(
      and(
        inArray(
          opsSignups.eventId,
          events.map((e) => e.id),
        ),
        isNull(opsSignups.leftAt),
        eq(opsSignups.bench, false),
      ),
    );
  return events.map((event) => ({
    event,
    signups: signups.filter((s) => s.eventId === event.id),
  }));
}

/** Staff correct a raid mark. Only for a seated signup on a raid in this server that has started. */
export async function setRaidAttendance(
  db: Db,
  guildId: string,
  eventId: string,
  userId: string,
  attended: boolean | null,
  now = new Date(),
) {
  const updated = await db
    .update(opsSignups)
    .set({ attended })
    .where(
      and(
        eq(opsSignups.eventId, eventId),
        eq(opsSignups.userId, userId),
        isNull(opsSignups.leftAt),
        eq(opsSignups.bench, false),
        sql`exists (select 1 from ${opsEvents} where ${opsEvents.id} = ${eventId}
          and ${opsEvents.guildId} = ${guildId} and ${opsEvents.startsAt} <= ${now.toISOString()}::timestamptz)`,
      ),
    )
    .returning({ userId: opsSignups.userId });
  return updated.length > 0;
}

export async function attendanceTracked(db: Db, guildId: string) {
  const [row] = await db
    .select({ on: opsSettings.trackAttendance })
    .from(opsSettings)
    .where(eq(opsSettings.guildId, guildId));
  return row?.on ?? false;
}
