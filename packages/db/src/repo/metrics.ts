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

/** Add message counts for today: { guildId: count }. */
export async function addMessageCounts(db: Db, counts: Map<string, number>, now = new Date()) {
  for (const [guildId, n] of counts) {
    await db
      .insert(guildActivityDaily)
      .values({ guildId, day: today(now), messages: n })
      .onConflictDoUpdate({
        target: [guildActivityDaily.guildId, guildActivityDaily.day],
        set: { messages: sql`${guildActivityDaily.messages} + ${n}` },
      });
  }
}

export async function markSeen(db: Db, guildId: string, userId: string, at = new Date()) {
  await db
    .insert(memberLastSeen)
    .values({ guildId, userId, lastSeenAt: at })
    .onConflictDoUpdate({
      target: [memberLastSeen.guildId, memberLastSeen.userId],
      set: { lastSeenAt: at },
    });
}

export async function saveLatencyHour(
  db: Db,
  hour: Date,
  guildId: string,
  stats: { count: number; p50Ms: number; p95Ms: number },
) {
  await db
    .insert(commandLatencyHourly)
    .values({ hour, guildId, ...stats })
    .onConflictDoUpdate({
      target: [commandLatencyHourly.hour, commandLatencyHourly.guildId],
      set: stats,
    });
}

/** One heartbeat a minute: refreshes bot_status and counts the minute towards today's uptime. */
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
