import { and, count, eq, gt, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { giveaways, lfgPosts, modCases, opsEvents, opsSignups } from "../schema";
import { giveawayEntryCounts } from "./giveaways";
import { getInsights } from "./insights";
import { getActivity, getHealthSnapshot } from "./metrics";
import { getLeaderboard, getRanksSettings } from "./ranks";
import { ticketQueueCounts, ticketStats } from "./tickets";

/**
 * What the AI assistant may read about how a server is doing: the same totals and lists the
 * dashboard shows (Overview, Insights, Moderation, Tickets, Leveling, Groups and raids,
 * Giveaways), and nothing about any one member that those pages don't already show. Counts
 * of cases, never who they were against. Channel and member ids come back raw; the bot
 * turns them into names.
 */

export const SERVER_INSIGHT_TOPICS = [
  "activity",
  "moderation",
  "tickets",
  "health",
  "leveling",
  "upcoming",
] as const;
export type ServerInsightTopic = (typeof SERVER_INSIGHT_TOPICS)[number];

const DAY = 86_400_000;

/** Moderation cases in a window, by action and by who made them, and how many were undone. */
async function caseCounts(db: Db, guildId: string, since: Date) {
  const rows = await db
    .select({ action: modCases.action, source: modCases.source, n: count() })
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), gte(modCases.createdAt, since)))
    .groupBy(modCases.action, modCases.source);
  const [undone] = await db
    .select({ n: count() })
    .from(modCases)
    .where(
      and(
        eq(modCases.guildId, guildId),
        gte(modCases.createdAt, since),
        isNotNull(modCases.revokedAt),
      ),
    );
  const by = <K extends "action" | "source">(key: K) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r[key]] = (acc[r[key]] ?? 0) + r.n;
      return acc;
    }, {});
  return {
    total: rows.reduce((n, r) => n + r.n, 0),
    byAction: by("action"),
    bySource: by("source"),
    undone: undone?.n ?? 0,
  };
}

/**
 * One topic's numbers. `pro`: whether the server's plan has Pro's longer history and ticket
 * stats, so the answer stays within what its dashboard shows.
 */
export async function serverInsight(
  db: Db,
  guildId: string,
  topic: ServerInsightTopic,
  opts: { pro: boolean; days?: number; now?: Date },
) {
  const now = opts.now ?? new Date();
  if (topic === "activity") {
    const days = Math.max(1, Math.min(opts.pro ? 365 : 30, opts.days ?? 30));
    const [i, today] = await Promise.all([
      getInsights(db, guildId, days, now),
      getActivity(db, guildId, now),
    ]);
    const busiest = i.hours
      .map((n, hour) => ({ hour, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .filter((h) => h.n > 0)
      .map((h) => `${String(h.hour).padStart(2, "0")}:00 UTC`);
    return {
      days,
      messages: i.totals.messages,
      joins: i.totals.joins,
      leaves: i.totals.leaves,
      members_posting: i.totals.active,
      members_posting_per_day: i.totals.activePerDay,
      messages_today: today.messagesToday,
      members_active_last_7_days: today.activeMembers7d,
      stayed_a_week: i.retention.joined
        ? `${i.retention.stayed} of ${i.retention.joined} who joined`
        : "too few joins to tell",
      top_channels: i.channels.slice(0, 5),
      busiest_hours: busiest,
      top_inviters: i.invites.slice(0, 3).map((v) => ({
        inviter: v.inviterName ?? "a member who has left",
        joins: v.joins,
        stayed: v.stayed,
      })),
      ...(opts.pro || days < 30
        ? {}
        : { note: "Free keeps 30 days of insights; Pro keeps a year." }),
    };
  }
  if (topic === "moderation") {
    const [week, month] = await Promise.all([
      caseCounts(db, guildId, new Date(now.getTime() - 7 * DAY)),
      caseCounts(db, guildId, new Date(now.getTime() - 30 * DAY)),
    ]);
    return { last_7_days: week, last_30_days: month };
  }
  if (topic === "tickets") {
    const [queue, stats] = await Promise.all([
      ticketQueueCounts(db, guildId),
      opts.pro
        ? ticketStats(db, guildId, new Date(now.getTime() - 30 * DAY))
        : Promise.resolve(null),
    ]);
    return {
      open: queue.open,
      waiting_on_staff: queue.staff,
      waiting_on_member: queue.member,
      unclaimed: queue.unclaimed,
      ...(stats
        ? { last_30_days: stats }
        : { note: "Ticket stats (opened, closed, time to first reply) are on Pro." }),
    };
  }
  if (topic === "health") {
    const snap = await getHealthSnapshot(db, guildId);
    if (!snap) return { status: "not checked yet: run /health in Discord" };
    return {
      checked_at: snap.computedAt.toISOString(),
      problems: snap.problems,
      needs_attention: snap.checks.filter((c) => c.status !== "ok"),
    };
  }
  if (topic === "leveling") {
    const [settings, top] = await Promise.all([
      getRanksSettings(db, guildId),
      getLeaderboard(db, guildId, 10),
    ]);
    return {
      on: settings.enabled,
      top_members: top.map((m, i) => ({
        place: i + 1,
        name: m.username,
        level: m.level,
        xp: m.xp,
      })),
    };
  }
  // What's coming up: raids with their sign-ups, running giveaways, open groups.
  const [raids, running, [groups]] = await Promise.all([
    db
      .select({
        id: opsEvents.id,
        title: opsEvents.title,
        startsAt: opsEvents.startsAt,
        slots: opsEvents.slots,
      })
      .from(opsEvents)
      .where(
        and(
          eq(opsEvents.guildId, guildId),
          eq(opsEvents.status, "scheduled"),
          gt(opsEvents.startsAt, now),
        ),
      )
      .orderBy(opsEvents.startsAt)
      .limit(5),
    db
      .select({
        id: giveaways.id,
        prize: giveaways.prize,
        endsAt: giveaways.endsAt,
        winners: giveaways.winners,
      })
      .from(giveaways)
      .where(and(eq(giveaways.guildId, guildId), eq(giveaways.status, "running")))
      .orderBy(giveaways.endsAt)
      .limit(5),
    db
      .select({ n: count() })
      .from(lfgPosts)
      .where(and(eq(lfgPosts.guildId, guildId), inArray(lfgPosts.status, ["open", "full"]))),
  ]);
  const signed = raids.length
    ? await db
        .select({
          eventId: opsSignups.eventId,
          n: sql<number>`count(*) filter (where not ${opsSignups.bench})::int`,
          bench: sql<number>`count(*) filter (where ${opsSignups.bench})::int`,
        })
        .from(opsSignups)
        .where(
          inArray(
            opsSignups.eventId,
            raids.map((r) => r.id),
          ),
        )
        .groupBy(opsSignups.eventId)
    : [];
  const entries = await giveawayEntryCounts(
    db,
    running.map((g) => g.id),
  );
  return {
    raids: raids.map((r) => ({
      title: r.title,
      starts: r.startsAt.toISOString(),
      signed_up: signed.find((s) => s.eventId === r.id)?.n ?? 0,
      on_the_bench: signed.find((s) => s.eventId === r.id)?.bench ?? 0,
    })),
    giveaways: running.map((g) => ({
      prize: g.prize,
      ends: g.endsAt.toISOString(),
      winners: g.winners,
      entries: entries.get(g.id) ?? 0,
    })),
    open_groups: groups?.n ?? 0,
  };
}
