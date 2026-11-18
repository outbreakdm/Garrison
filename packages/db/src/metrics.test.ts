import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  addMessageCounts,
  getActivity,
  getBotStatus,
  getHealthSnapshot,
  getLatency,
  heartbeat,
  markSeen,
  markSeenMany,
  saveHealthSnapshot,
  saveLatencyHour,
  saveLatencyHours,
  uptimeSummary,
} from "./repo/metrics";
import { botStatus, commandLatencyHourly, guildActivityDaily, memberLastSeen } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "995";

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

describe("metrics, written by garrison_bot and read by garrison_web", () => {
  it("records everything as the bot", async () => {
    await saveHealthSnapshot(db, G, [
      { status: "ok", text: "a" },
      { status: "fix", text: "b" },
    ]);
    await addMessageCounts(db, new Map([[G, 5]]));
    await addMessageCounts(db, new Map([[G, 3]]));
    await markSeen(db, G, "u1");
    await markSeen(db, G, "u2", new Date(Date.now() - 10 * 86_400_000));
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    await saveLatencyHour(db, hour, "", { count: 10, p50Ms: 80, p95Ms: 150 });
    await saveLatencyHour(db, hour, "", { count: 30, p50Ms: 90, p95Ms: 170 });
    await saveLatencyHour(db, new Date(hour.getTime() - 3_600_000), "", {
      count: 10,
      p50Ms: 70,
      p95Ms: 120,
    });
    const started = new Date();
    await heartbeat(db, started);
    await heartbeat(db, started);
  });

  it("reads it back as the dashboard", async () => {
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect(await getHealthSnapshot(db, G)).toMatchObject({ problems: 1 });
    expect(await getActivity(db, G)).toEqual({ messagesToday: 8, activeMembers7d: 1 });
    expect(await getLatency(db)).toEqual({ count: 40, p95Ms: 158 }); // (30*170 + 10*120) / 40
    const { status, uptime } = await getBotStatus(db);
    expect(status?.lastBeatAt).toBeInstanceOf(Date);
    expect(uptime[0]?.minutesUp).toBe(2);
  });

  it("the dashboard can't write metrics, and nobody can add a second status row", async () => {
    const err = await db
      .update(guildActivityDaily)
      .set({ messages: 9999 })
      .then(
        () => null,
        (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message}`,
      );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
    const dup = await db
      .insert(botStatus)
      .values({ id: 2, lastBeatAt: new Date(), startedAt: new Date() })
      .then(
        () => null,
        (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message}`,
      );
    expect(dup).toMatch(/bot_status_single_row/);
  });
});

describe("uptimeSummary", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  it("starts the first day at its first heartbeat, so a fresh install isn't shown as down", () => {
    const r = uptimeSummary(
      [{ day: "2026-11-07", minutesUp: 60, firstBeatAt: new Date("2026-11-07T11:00:00Z") }],
      now,
    );
    expect(r.uptimePct).toBe(100);
  });
  it("counts later days from midnight, and today only up to now", () => {
    const r = uptimeSummary(
      [
        { day: "2026-11-07", minutesUp: 360, firstBeatAt: new Date("2026-11-07T00:00:30Z") },
        { day: "2026-11-06", minutesUp: 720, firstBeatAt: new Date("2026-11-06T00:00:10Z") },
        { day: "2026-11-05", minutesUp: 60, firstBeatAt: new Date("2026-11-05T23:00:00Z") },
      ],
      now,
    );
    expect(r.days.map((d) => Math.round(d.pct))).toEqual([50, 50, 100]);
    expect(r.uptimePct).toBeCloseTo((1140 / (720 + 1440 + 60)) * 100, 5);
  });
  it("is null with no data", () => {
    expect(uptimeSummary([], now).uptimePct).toBeNull();
  });
});

describe("the bot's batched writes", () => {
  it("writes many servers and members in a few statements, as garrison_bot", async () => {
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    const H = "996";
    await upsertGuild(db, { id: H, name: "Batch" });
    await addMessageCounts(db, new Map([[H, 4]]));
    await addMessageCounts(
      db,
      new Map([
        [H, 6],
        [G, 1],
      ]),
    );
    const now = new Date();
    // 600 members: more than one 500-row chunk.
    const seen = Array.from({ length: 600 }, (_, i) => ({ guildId: H, userId: `m${i}`, at: now }));
    await markSeenMany(db, seen);
    // A late write for an earlier message never moves last-seen back.
    await markSeenMany(db, [{ guildId: H, userId: "m0", at: new Date(now.getTime() - 60_000) }]);
    const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    await saveLatencyHours(db, [
      { hour, guildId: H, count: 1, p50Ms: 10, p95Ms: 10 },
      { hour, guildId: "", count: 2, p50Ms: 20, p95Ms: 30 },
    ]);
    await saveLatencyHours(db, [{ hour, guildId: H, count: 5, p50Ms: 40, p95Ms: 90 }]);

    await exec("RESET ROLE");
    const [day] = await db
      .select()
      .from(guildActivityDaily)
      .where(eq(guildActivityDaily.guildId, H));
    expect(day?.messages).toBe(10);
    const rows = await db.select().from(memberLastSeen).where(eq(memberLastSeen.guildId, H));
    expect(rows).toHaveLength(600);
    expect(rows.find((r) => r.userId === "m0")?.lastSeenAt.getTime()).toBe(now.getTime());
    const [lat] = await db
      .select()
      .from(commandLatencyHourly)
      .where(eq(commandLatencyHourly.guildId, H));
    expect(lat).toMatchObject({ count: 5, p50Ms: 40, p95Ms: 90 });
  });
});
