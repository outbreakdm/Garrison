import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  awardXp,
  getLeaderboard,
  getMemberRank,
  getRanksSettings,
  levelForXp,
  listRankRewards,
  setRankReward,
  updateRanksSettings,
  xpForNextLevel,
} from "./repo/ranks";
import { memberXp } from "./schema";
import { createTestDb } from "./testing";

describe("level curve", () => {
  it("rises gently", () => {
    expect([0, 1, 2, 10].map(xpForNextLevel)).toEqual([100, 155, 220, 1100]);
    expect(levelForXp(0)).toEqual({ level: 0, intoLevel: 0, needed: 100 });
    expect(levelForXp(99).level).toBe(0);
    expect(levelForXp(100)).toEqual({ level: 1, intoLevel: 0, needed: 155 });
    expect(levelForXp(255)).toEqual({ level: 2, intoLevel: 0, needed: 220 });
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960";
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

describe("ranks, as garrison_bot", () => {
  it("is off until a server turns it on", async () => {
    expect((await getRanksSettings(db, G)).enabled).toBe(false);
    expect(await updateRanksSettings(db, G, { enabled: true, announce: "off" })).toMatchObject({
      enabled: true,
      announce: "off",
    });
  });

  it("enforces the cooldown in the database, even for a burst", async () => {
    const t0 = new Date("2026-11-06T12:00:00Z");
    const burst = await Promise.all(
      Array.from({ length: 5 }, () =>
        awardXp(db, G, { id: "kel", username: "kel" }, 20, 60_000, t0),
      ),
    );
    expect(burst.filter((r) => r.awarded)).toHaveLength(1);
    expect(
      await awardXp(
        db,
        G,
        { id: "kel", username: "kel" },
        20,
        60_000,
        new Date(t0.getTime() + 30_000),
      ),
    ).toEqual({
      awarded: false,
    });
    expect(
      await awardXp(
        db,
        G,
        { id: "kel", username: "kel" },
        20,
        60_000,
        new Date(t0.getTime() + 61_000),
      ),
    ).toMatchObject({
      awarded: true,
      xp: 40,
    });
  });

  it("announces each level-up once", async () => {
    const start = Date.parse("2026-11-06T13:00:00Z");
    const ups: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const r = await awardXp(
        db,
        G,
        { id: "taz", username: "taz" },
        25,
        60_000,
        new Date(start + i * 61_000),
      );
      if (r.awarded && r.leveledUpTo) ups.push(r.leveledUpTo);
    }
    expect(ups).toEqual([1]);
    expect((await getMemberRank(db, G, "taz"))?.level).toBe(1);
  });

  it("ranks members and builds a leaderboard", async () => {
    const top = await getLeaderboard(db, G);
    expect(top.map((m) => m.userId)).toEqual(["taz", "kel"]);
    expect(await getMemberRank(db, G, "kel")).toMatchObject({ position: 2, messages: 2 });
    expect(await getMemberRank(db, G, "nobody")).toBeNull();
  });

  it("sets and clears rewards without deleting rows", async () => {
    await setRankReward(db, G, 5, "555555555555555555");
    await setRankReward(db, G, 10, "101010101010101010");
    await setRankReward(db, G, 5, null);
    expect((await listRankRewards(db, G)).map((r) => r.level)).toEqual([10]);
    const err = await db.delete(memberXp).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message}`,
    );
    expect(err).toMatch(/permission denied/);
  });
});
