import { addMessageCounts, heartbeat, markSeen, saveLatencyHour } from "@garrison/db";
import type { BotContext } from "../commands/types.js";

/** Nearest-rank percentile of a sample, 0 for none. */
export function percentile(samples: number[], p: number) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

const SEEN_EVERY_MS = 15 * 60_000;
const MAX_SAMPLES = 2000;

/**
 * In-memory counters, flushed to the database once a minute. Counts and
 * timings only: no message content passes through here.
 */
export class Metrics {
  private messages = new Map<string, number>();
  private seenAt = new Map<string, number>();
  private pendingSeen = new Map<string, { guildId: string; userId: string; at: Date }>();
  /** hour start (ms) -> guild ('' = all) -> response times in ms */
  private latency = new Map<number, Map<string, number[]>>();
  readonly startedAt = new Date();

  message(guildId: string, userId: string, now = Date.now()) {
    this.messages.set(guildId, (this.messages.get(guildId) ?? 0) + 1);
    const key = `${guildId}:${userId}`;
    if (now - (this.seenAt.get(key) ?? 0) >= SEEN_EVERY_MS) {
      this.seenAt.set(key, now);
      this.pendingSeen.set(key, { guildId, userId, at: new Date(now) });
    }
    if (this.seenAt.size > 200_000) this.seenAt.clear();
  }

  response(guildId: string | null, ms: number, now = Date.now()) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 60_000) return;
    const hour = Math.floor(now / 3_600_000) * 3_600_000;
    const byGuild = this.latency.get(hour) ?? new Map<string, number[]>();
    this.latency.set(hour, byGuild);
    for (const key of guildId ? ["", guildId] : [""]) {
      const list = byGuild.get(key) ?? [];
      if (list.length < MAX_SAMPLES) list.push(ms);
      byGuild.set(key, list);
    }
  }

  async flush(ctx: BotContext, now = Date.now()) {
    const counts = this.messages;
    this.messages = new Map();
    const seen = [...this.pendingSeen.values()];
    this.pendingSeen.clear();
    await addMessageCounts(ctx.db, counts);
    for (const s of seen) await markSeen(ctx.db, s.guildId, s.userId, s.at);

    for (const [hour, byGuild] of this.latency) {
      for (const [guildId, samples] of byGuild) {
        await saveLatencyHour(ctx.db, new Date(hour), guildId, {
          count: samples.length,
          p50Ms: percentile(samples, 50),
          p95Ms: percentile(samples, 95),
        });
      }
      // Keep the current hour's samples so its percentiles stay exact; drop finished hours.
      if (hour < Math.floor(now / 3_600_000) * 3_600_000) this.latency.delete(hour);
    }
    await heartbeat(ctx.db, this.startedAt);
  }
}
