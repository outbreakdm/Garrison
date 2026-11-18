import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  botStatus,
  botUptimeDaily,
  commandLatencyHourly,
  guildActivityDaily,
  healthSnapshots,
  memberLastSeen,
} from "../schema";

const today = (d = new Date()) => d.toISOString().slice(0, 10);

// --- Written by the bot ------------------------------------------------------

export async function saveHealthSnapshot(
  db: Db,
  guildId: string,
  checks: { status: "ok" | "warn" | "fix"; text: string }[],
) {
  const problems = checks.filter((c) => c.status !== "ok").length;
  await db
    .insert(healthSnapshots)
    .values({ guildId, checks, problems })
    .onConflictDoUpdate({
      target: healthSnapshots.guildId,
      set: { checks, problems, computedAt: new Date() },
    });
}

/**
 * Rows per statement for the bot's once-a-minute writes. One multi-row upsert per chunk instead
 * of one round trip per row: the flush used to cost a round trip per server and per member.
 * Each caller's rows are unique on the conflict target (Postgres refuses a statement that
 * updates the same row twice).
 */
const CHUNK = 500;
async function chunked<T>(rows: T[], write: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

/** Add message counts for today: { guildId: count }. One upsert per 500 servers. */
export async function addMessageCounts(db: Db, counts: Map<string, number>, now = new Date()) {
  const day = today(now);
  const rows = [...counts].map(([guildId, messages]) => ({ guildId, day, messages }));
  await chunked(rows, (values) =>
    db
      .insert(guildActivityDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [guildActivityDaily.guildId, guildActivityDaily.day],
        set: { messages: sql`${guildActivityDaily.messages} + excluded.messages` },
      }),
  );
}

export async function markSeen(db: Db, guildId: string, userId: string, at = new Date()) {
  await markSeenMany(db, [{ guildId, userId, at }]);
}

/** When each member last posted. One upsert per 500 members; one row per member. */
export async function markSeenMany(db: Db, seen: { guildId: string; userId: string; at: Date }[]) {
  const rows = seen.map(({ guildId, userId, at }) => ({ guildId, userId, lastSeenAt: at }));
  await chunked(rows, (values) =>
    db
      .insert(memberLastSeen)
      .values(values)
      .onConflictDoUpdate({
        target: [memberLastSeen.guildId, memberLastSeen.userId],
        // Never move it back: a late write for an earlier message keeps the later time.
        set: { lastSeenAt: sql`greatest(${memberLastSeen.lastSeenAt}, excluded.last_seen_at)` },
      }),
  );
}

export interface LatencyHour {
  hour: Date;
  /** '' for all servers together. */
  guildId: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
}

export async function saveLatencyHour(
  db: Db,
  hour: Date,
  guildId: string,
  stats: { count: number; p50Ms: number; p95Ms: number },
) {
  await saveLatencyHours(db, [{ hour, guildId, ...stats }]);
}

/** Reply-time percentiles per hour and server. One upsert per 500; one row per hour and server. */
export async function saveLatencyHours(db: Db, rows: LatencyHour[]) {
  await chunked(rows, (values) =>
    db
      .insert(commandLatencyHourly)
      .values(values)
      .onConflictDoUpdate({
        target: [commandLatencyHourly.hour, commandLatencyHourly.guildId],
        set: {
          count: sql`excluded.count`,
          p50Ms: sql`excluded.p50_ms`,
          p95Ms: sql`excluded.p95_ms`,
        },
      }),
  );
}

/**
 * Remove old dashboard requests (30 days) and hourly reply times (90 days). The database
 * function decides what's old; the bot can't delete anything newer (migration 0073).
 */
export async function pruneOperations(db: Db): Promise<number> {
  const rows = (await db.execute(sql`select operations_prune() as removed`)) as unknown as
    | { removed: number }[]
    | { rows: { removed: number }[] };
  const row = Array.isArray(rows) ? rows[0] : rows.rows[0];
  return Number(row?.removed ?? 0);
}

/** One heartbeat a minute: refreshes bot_status and counts the minute toward today's uptime. */
export async function heartbeat(db: Db, startedAt: Date, now = new Date()) {
  await db
    .insert(botStatus)
    .values({ id: 1, lastBeatAt: now, startedAt })
    .onConflictDoUpdate({ target: botStatus.id, set: { lastBeatAt: now, startedAt } });
  await db
    .insert(botUptimeDaily)
    .values({ day: today(now), minutesUp: 1 })
    .onConflictDoUpdate({
      target: botUptimeDaily.day,
      set: { minutesUp: sql`least(1440, ${botUptimeDaily.minutesUp} + 1)` },
    });
}

// --- Read by the dashboard and status page -----------------------------------

export async function getHealthSnapshot(db: Db, guildId: string) {
  const [row] = await db.select().from(healthSnapshots).where(eq(healthSnapshots.guildId, guildId));
  return row ?? null;
}

export async function getActivity(db: Db, guildId: string, now = new Date()) {
  const [[todayRow], [active]] = await Promise.all([
    db
      .select({ messages: guildActivityDaily.messages })
      .from(guildActivityDaily)
      .where(and(eq(guildActivityDaily.guildId, guildId), eq(guildActivityDaily.day, today(now)))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberLastSeen)
      .where(
        and(
          eq(memberLastSeen.guildId, guildId),
          gte(memberLastSeen.lastSeenAt, new Date(now.getTime() - 7 * 86_400_000)),
        ),
      ),
  ]);
  return { messagesToday: todayRow?.messages ?? 0, activeMembers7d: active?.n ?? 0 };
}

/** Request-weighted p95 over the last `hours` (an approximation across hourly buckets). */
export async function getLatency(db: Db, guildId = "", hours = 24, now = new Date()) {
  const rows = await db
    .select()
    .from(commandLatencyHourly)
    .where(
      and(
        eq(commandLatencyHourly.guildId, guildId),
        gte(commandLatencyHourly.hour, new Date(now.getTime() - hours * 3_600_000)),
      ),
    );
  const count = rows.reduce((n, r) => n + r.count, 0);
  if (!count) return null;
  const p95Ms = Math.round(rows.reduce((s, r) => s + r.p95Ms * r.count, 0) / count);
  return { count, p95Ms };
}

/** When the bot last checked in (once a minute while it's running), or null if it never has. */
export async function getBotLastBeat(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ at: botStatus.lastBeatAt })
    .from(botStatus)
    .where(eq(botStatus.id, 1));
  return row?.at ?? null;
}

export async function getBotStatus(db: Db, days = 30, now = new Date()) {
  const [status] = await db.select().from(botStatus).where(eq(botStatus.id, 1));
  const since = today(new Date(now.getTime() - (days - 1) * 86_400_000));
  const uptime = await db
    .select()
    .from(botUptimeDaily)
    .where(gte(botUptimeDaily.day, since))
    .orderBy(desc(botUptimeDaily.day));
  return { status: status ?? null, uptime };
}

/**
 * Uptime as a share of the minutes the bot could have checked in. Days run from
 * midnight UTC, except the earliest day on record, which starts at its first
 * heartbeat; today runs up to now. A partial first day isn't counted as downtime.
 */
export function uptimeSummary(
  rows: { day: string; minutesUp: number; firstBeatAt: Date }[],
  now = new Date(),
) {
  const earliest = rows.reduce<string | undefined>(
    (a, r) => (!a || r.day < a ? r.day : a),
    undefined,
  );
  let up = 0;
  let possibleTotal = 0;
  const days = rows.map((r) => {
    const dayStart = Date.parse(`${r.day}T00:00:00Z`);
    const from = r.day === earliest ? Math.max(dayStart, r.firstBeatAt.getTime()) : dayStart;
    const to = Math.min(dayStart + 86_400_000, now.getTime());
    const possible = Math.max(1, Math.ceil((to - from) / 60_000));
    up += r.minutesUp;
    possibleTotal += possible;
    return { day: r.day, pct: Math.min(100, (r.minutesUp / possible) * 100) };
  });
  return { uptimePct: possibleTotal ? Math.min(100, (up / possibleTotal) * 100) : null, days };
}
