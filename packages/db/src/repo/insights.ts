import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  activeMembersDaily,
  channelActivityDaily,
  guildActivityDaily,
  guildActivityHourly,
  memberActivityDaily,
  memberFlow,
} from "../schema";

/**
 * Server insights: message counts by channel, hour and member-day, joins and leaves with
 * their invite. Counts only, never message content. The bot batches counts in memory and
 * writes them once a minute; insights_prune() keeps per-member rows 35 days (folding
 * each day into a plain count first) and everything else 400 days.
 */

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const CHUNK = 500;

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

// --- Written by the bot ------------------------------------------------------

export interface ActivityBatch {
  /** "guildId|day|channelId" -> messages */
  channels: Map<string, number>;
  /** "guildId|hourMs" -> messages */
  hours: Map<string, number>;
  /** "guildId|day|userId" -> messages */
  members: Map<string, number>;
}

async function chunked<T>(rows: T[], write: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

/** Add a minute's counts. Each table takes one upsert per 500 rows. */
export async function addActivity(db: Db, batch: ActivityBatch) {
  const channels = [...batch.channels].map(([key, messages]) => {
    const [guildId = "", day = "", channelId = ""] = key.split("|");
    return { guildId, day, channelId, messages };
  });
  await chunked(channels, (values) =>
    db
      .insert(channelActivityDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [
          channelActivityDaily.guildId,
          channelActivityDaily.day,
          channelActivityDaily.channelId,
        ],
        set: { messages: sql`${channelActivityDaily.messages} + excluded.messages` },
      }),
  );
  const hours = [...batch.hours].map(([key, messages]) => {
    const [guildId = "", ms = "0"] = key.split("|");
    return { guildId, hour: new Date(Number(ms)), messages };
  });
  await chunked(hours, (values) =>
    db
      .insert(guildActivityHourly)
      .values(values)
      .onConflictDoUpdate({
        target: [guildActivityHourly.guildId, guildActivityHourly.hour],
        set: { messages: sql`${guildActivityHourly.messages} + excluded.messages` },
      }),
  );
  const members = [...batch.members].map(([key, messages]) => {
    const [guildId = "", day = "", userId = ""] = key.split("|");
    return { guildId, day, userId, messages };
  });
  await chunked(members, (values) =>
    db
      .insert(memberActivityDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [memberActivityDaily.guildId, memberActivityDaily.day, memberActivityDaily.userId],
        set: { messages: sql`${memberActivityDaily.messages} + excluded.messages` },
      }),
  );
}

export async function recordMemberFlow(
  db: Db,
  row: {
    guildId: string;
    userId: string;
    kind: "join" | "leave";
    inviteCode?: string | null;
    inviterId?: string | null;
    inviterName?: string | null;
  },
) {
  await db.insert(memberFlow).values(row);
}

/** Fold old per-member days into counts and drop what's past keeping. Runs as the owner. */
export async function pruneInsights(db: Db): Promise<number> {
  const rows = rowsOf<{ removed: number }>(
    await db.execute(sql`select insights_prune() as removed`),
  );
  return Number(rows[0]?.removed ?? 0);
}

// --- Read by the dashboard ---------------------------------------------------

export interface InsightDay {
  day: string;
  messages: number;
  joins: number;
  leaves: number;
  /** Members who posted that day. */
  active: number;
}

export interface Insights {
  days: number;
  daily: InsightDay[];
  totals: {
    messages: number;
    joins: number;
    leaves: number;
    /** Distinct members who posted in the window; null past 30 days (only daily counts are kept). */
    active: number | null;
    /** Average members posting per day. */
    activePerDay: number;
  };
  /** Joins old enough to judge (a week or more ago) and how many of them stayed a week. */
  retention: { joined: number; stayed: number };
  channels: { channelId: string; messages: number }[];
  /** 24 counts, by UTC hour of day. */
  hours: number[];
  invites: { inviterId: string; inviterName: string | null; joins: number; stayed: number }[];
}

export async function getInsights(
  db: Db,
  guildId: string,
  days: number,
  now = new Date(),
): Promise<Insights> {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  const sinceDay = dayOf(since);
  const sinceStart = new Date(`${sinceDay}T00:00:00Z`);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [messages, flow, rolled, live, distinct, channels, hours, retention, invites] =
    await Promise.all([
      db
        .select({ day: guildActivityDaily.day, messages: guildActivityDaily.messages })
        .from(guildActivityDaily)
        .where(and(eq(guildActivityDaily.guildId, guildId), gte(guildActivityDaily.day, sinceDay))),
      db
        .select({
          day: sql<string>`to_char(${memberFlow.at} at time zone 'UTC', 'YYYY-MM-DD')`,
          kind: memberFlow.kind,
          n: sql<number>`count(*)::int`,
        })
        .from(memberFlow)
        .where(and(eq(memberFlow.guildId, guildId), gte(memberFlow.at, sinceStart)))
        .groupBy(sql`1`, memberFlow.kind),
      db
        .select({ day: activeMembersDaily.day, n: activeMembersDaily.members })
        .from(activeMembersDaily)
        .where(and(eq(activeMembersDaily.guildId, guildId), gte(activeMembersDaily.day, sinceDay))),
      db
        .select({ day: memberActivityDaily.day, n: sql<number>`count(*)::int` })
        .from(memberActivityDaily)
        .where(
          and(eq(memberActivityDaily.guildId, guildId), gte(memberActivityDaily.day, sinceDay)),
        )
        .groupBy(memberActivityDaily.day),
      days <= 30
        ? db
            .select({ n: sql<number>`count(distinct ${memberActivityDaily.userId})::int` })
            .from(memberActivityDaily)
            .where(
              and(eq(memberActivityDaily.guildId, guildId), gte(memberActivityDaily.day, sinceDay)),
            )
        : Promise.resolve(null),
      db
        .select({
          channelId: channelActivityDaily.channelId,
          messages: sql<number>`sum(${channelActivityDaily.messages})::int`,
        })
        .from(channelActivityDaily)
        .where(
          and(eq(channelActivityDaily.guildId, guildId), gte(channelActivityDaily.day, sinceDay)),
        )
        .groupBy(channelActivityDaily.channelId)
        .orderBy(sql`2 desc`)
        .limit(10),
      db
        .select({
          h: sql<number>`extract(hour from ${guildActivityHourly.hour} at time zone 'UTC')::int`,
          messages: sql<number>`sum(${guildActivityHourly.messages})::int`,
        })
        .from(guildActivityHourly)
        .where(
          and(eq(guildActivityHourly.guildId, guildId), gte(guildActivityHourly.hour, sinceStart)),
        )
        .groupBy(sql`1`),
      db.execute(sql`
        select count(*)::int as joined,
          count(*) filter (where not exists (
            select 1 from member_flow l
            where l.guild_id = j.guild_id and l.user_id = j.user_id and l.kind = 'leave'
              and l.at >= j.at and l.at < j.at + interval '7 days'))::int as stayed
        from member_flow j
        where j.guild_id = ${guildId} and j.kind = 'join'
          and j.at >= ${sinceStart.toISOString()}::timestamptz and j.at < ${weekAgo.toISOString()}::timestamptz`),
      db.execute(sql`
        select j.inviter_id as "inviterId", max(j.inviter_name) as "inviterName",
          count(*)::int as joins,
          count(*) filter (where j.at < ${weekAgo.toISOString()}::timestamptz and not exists (
            select 1 from member_flow l
            where l.guild_id = j.guild_id and l.user_id = j.user_id and l.kind = 'leave'
              and l.at >= j.at and l.at < j.at + interval '7 days'))::int as stayed
        from member_flow j
        where j.guild_id = ${guildId} and j.kind = 'join' and j.inviter_id is not null
          and j.at >= ${sinceStart.toISOString()}::timestamptz
        group by j.inviter_id
        order by joins desc
        limit 10`),
    ]);

  const byDay = new Map<string, InsightDay>();
  for (let i = 0; i < days; i++) {
    const day = dayOf(new Date(sinceStart.getTime() + i * 86_400_000));
    byDay.set(day, { day, messages: 0, joins: 0, leaves: 0, active: 0 });
  }
  for (const m of messages) {
    const d = byDay.get(m.day);
    if (d) d.messages = m.messages;
  }
  for (const f of flow) {
    const d = byDay.get(f.day);
    if (d) d[f.kind === "join" ? "joins" : "leaves"] = f.n;
  }
  // Live per-member rows win over the folded counts for the days both cover.
  for (const r of [...rolled, ...live]) {
    const d = byDay.get(r.day);
    if (d) d.active = r.n;
  }
  const daily = [...byDay.values()];
  const sum = (k: keyof Omit<InsightDay, "day">) => daily.reduce((n, d) => n + d[k], 0);
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const h of hours) if (h.h >= 0 && h.h < 24) hourly[h.h] = h.messages;
  const ret = rowsOf<{ joined: number; stayed: number }>(retention)[0];

  return {
    days,
    daily,
    totals: {
      messages: sum("messages"),
      joins: sum("joins"),
      leaves: sum("leaves"),
      active: distinct ? (distinct[0]?.n ?? 0) : null,
      activePerDay: Math.round(sum("active") / Math.max(1, days)),
    },
    retention: { joined: ret?.joined ?? 0, stayed: ret?.stayed ?? 0 },
    channels,
    hours: hourly,
    invites: rowsOf<Insights["invites"][number]>(invites),
  };
}
