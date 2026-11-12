import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { closeLfg, createLfgPost, listLfgRepeatsDue, markLfgRepeated } from "./repo/rally";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "950";
const now = new Date();
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Weekly" });
});
afterAll(() => close());

const post = (hostId: string, repeatWeekly: boolean, startsAt: Date, expiresAt: Date) =>
  createLfgPost(db, {
    guildId: G,
    channelId: "c",
    hostId,
    hostSlot: "",
    title: "Tuesday raid team",
    note: null,
    slots: [{ name: "", count: 5 }],
    startsAt,
    expiresAt,
    repeatWeekly,
  });

describe("weekly groups", () => {
  it("are due once their run is over, whether they expired or were closed", async () => {
    const ran = await post("a", true, hours(-4), hours(-1));
    const closedEarly = await post("b", true, hours(-2), hours(-0.5));
    const stillOn = await post("c", true, hours(-1), hours(2));
    const oneOff = await post("d", false, hours(-4), hours(-1));
    if (!ran || !closedEarly || !stillOn || !oneOff) throw new Error("no post");
    await closeLfg(db, ran.id, "expired");
    await closeLfg(db, closedEarly.id);
    await closeLfg(db, stillOn.id); // closed, but its time isn't over yet
    await closeLfg(db, oneOff.id, "expired");
    const due = await listLfgRepeatsDue(db, now);
    expect(due.map((p) => p.hostId).sort()).toEqual(["a", "b"]);

    // Reposting (or stopping) marks it once; it's no longer due.
    expect(await markLfgRepeated(db, ran.id, now)).toBe(true);
    expect(await markLfgRepeated(db, ran.id, now)).toBe(false);
    expect((await listLfgRepeatsDue(db, now)).map((p) => p.hostId)).toEqual(["b"]);
  });
});
