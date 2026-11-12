import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { awardXp, endSeason, getMemberRank, listSeasons } from "./repo/ranks";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960";
const OTHER = "961";

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Seasonal" });
  await upsertGuild(db, { id: OTHER, name: "Elsewhere" });
});
afterAll(() => close());

const earn = (guildId: string, id: string, xp: number, source: "message" | "voice" = "message") =>
  awardXp(db, guildId, { id, username: id }, xp, 0, new Date(), source);

describe("seasons", () => {
  it("keep the final standings, then reset XP in this server only", async () => {
    await earn(G, "a", 500);
    await earn(G, "b", 1200);
    await earn(G, "b", 10, "voice");
    await earn(OTHER, "a", 300);

    const first = await endSeason(db, G, { name: "  ", byId: "s", byName: "staff" });
    expect(first).toMatchObject({ number: 1, name: "Season 1", members: 2, startedAt: null });
    expect(first?.standings.map((s) => [s.userId, s.xp])).toEqual([
      ["b", 1210],
      ["a", 500],
    ]);
    expect(await getMemberRank(db, G, "b")).toMatchObject({ xp: 0, level: 0 });
    expect((await getMemberRank(db, OTHER, "a"))?.xp).toBe(300);

    await earn(G, "a", 50);
    const second = await endSeason(db, G, { name: "Winter", byId: "s", byName: "staff" });
    expect(second).toMatchObject({ number: 2, name: "Winter", members: 1 });
    expect(second?.startedAt?.getTime()).toBe(first?.endedAt.getTime());
    expect((await listSeasons(db, G)).map((s) => s.number)).toEqual([2, 1]);
  });

  it("counts voice minutes apart from messages", async () => {
    await earn(OTHER, "v", 10, "voice");
    expect(await getMemberRank(db, OTHER, "v")).toMatchObject({ messages: 0, voiceMinutes: 1 });
  });
});
