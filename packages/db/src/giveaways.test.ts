import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { checkGiveaway, drawWinners, entryWeight } from "./giveaways";
import { entitlements } from "./plans";
import {
  createGiveaway,
  enterGiveaway,
  finishGiveaway,
  giveawayEntryCounts,
  leaveGiveaway,
  listDueGiveaways,
  listGiveawayEntries,
  setGiveawayWinners,
} from "./repo/giveaways";
import { upsertGuild } from "./repo/guilds";
import { giveaways } from "./schema";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const base = {
  channelId: "300000000000000001",
  prize: "Nitro",
  winners: "2",
  durationMinutes: "1440",
};

describe("giveaway rules", () => {
  it("lets Free run open giveaways and keeps rules for Pro", () => {
    expect(checkGiveaway(base, free)).toMatchObject({ ok: true, value: { winners: 2 } });
    const rules = { ...base, requiredRoleId: "200000000000000001" };
    expect(checkGiveaway(rules, free).ok).toBe(false);
    expect(checkGiveaway(rules, pro).ok).toBe(true);
    expect(checkGiveaway({ ...base, winners: "21" }, pro).ok).toBe(false);
    expect(checkGiveaway({ ...base, durationMinutes: "7" }, pro).ok).toBe(false);
    expect(
      checkGiveaway(
        {
          ...base,
          bonusRoles: [
            { roleId: "200000000000000001", extra: "2" },
            { roleId: "200000000000000001", extra: "1" },
          ],
        },
        pro,
      ).ok,
    ).toBe(false);
  });

  it("weighs entries by bonus roles and draws different winners", () => {
    const bonus = [{ roleId: "b", extra: 4 }];
    expect(entryWeight(bonus, ["a"])).toBe(1);
    expect(entryWeight(bonus, ["a", "b"])).toBe(5);
    const entries = [
      { userId: "x", weight: 1 },
      { userId: "y", weight: 5 },
      { userId: "z", weight: 1 },
    ];
    // random() = 0.5 lands in y's share (1..6 of 7).
    expect(drawWinners(entries, 1, () => 0.5)).toEqual(["y"]);
    const two = drawWinners(entries, 2, () => 0.99);
    expect(new Set(two).size).toBe(2);
    expect(drawWinners(entries, 5, Math.random)).toHaveLength(3);
    expect(drawWinners(entries, 3, Math.random, ["x", "y"])).toEqual(["z"]);
    expect(drawWinners([], 1, Math.random)).toEqual([]);
  });

  it("is fair over many draws", () => {
    const entries = [
      { userId: "a", weight: 1 },
      { userId: "b", weight: 3 },
    ];
    let b = 0;
    for (let i = 0; i < 4000; i++) if (drawWinners(entries, 1, Math.random)[0] === "b") b++;
    expect(b / 4000).toBeGreaterThan(0.7);
    expect(b / 4000).toBeLessThan(0.8);
  });
});

describe("giveaway storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "996";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("enters each member once and draws once", async () => {
    const g = await createGiveaway(db, {
      guildId: G,
      channelId: "300000000000000001",
      prize: "Nitro",
      description: null,
      winners: 1,
      endsAt: new Date(Date.now() - 1000),
      hostId: "1",
      hostName: "taner",
      requiredRoleId: null,
      minLevel: null,
      bonusRoles: [],
      accent: null,
    });
    expect(await enterGiveaway(db, g.id, "u1", 1)).toBe(true);
    expect(await enterGiveaway(db, g.id, "u1", 1)).toBe(false);
    await enterGiveaway(db, g.id, "u2", 3);
    await leaveGiveaway(db, g.id, "u2");
    expect(await listGiveawayEntries(db, g.id)).toEqual([{ userId: "u1", weight: 1 }]);
    expect((await giveawayEntryCounts(db, [g.id])).get(g.id)).toBe(1);
    expect((await listDueGiveaways(db)).map((x) => x.id)).toEqual([g.id]);
    expect(await finishGiveaway(db, g.id, { status: "ended", winnerIds: ["u1"] })).not.toBeNull();
    expect(await finishGiveaway(db, g.id, { status: "ended", winnerIds: ["u2"] })).toBeNull();
    // Rerolls add to everyone drawn, so nobody is drawn twice.
    await setGiveawayWinners(db, g.id, ["u3"], ["u1"]);
    const [after] = await db.select().from(giveaways);
    expect(after?.winnerIds).toEqual(["u3"]);
    expect(after?.drawnIds?.sort()).toEqual(["u1", "u3"]);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    const err = await Promise.resolve(db.update(giveaways).set({ status: "running" })).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
  });
});
