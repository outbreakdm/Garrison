import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  attendanceCandidates,
  attendanceSummary,
  closeAttendance,
  listAttendanceGuilds,
  markShowedUp,
  recentRaidAttendance,
  setRaidAttendance,
} from "./repo/attendance";
import { upsertGuild } from "./repo/guilds";
import { createOpsEvent, signUp } from "./repo/ops";
import { createLfgPost, joinLfg } from "./repo/rally";
import { applySettingsChange } from "./repo/settings";
import { createTestDb } from "./testing";

// Runs as garrison_bot, switching to garrison_web for the dashboard's parts.
let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "900";
const OTHER = "901";
const now = new Date();
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Vanguard" });
  await upsertGuild(db, { id: OTHER, name: "Elsewhere" });
});
afterAll(() => close());

const raid = async (guildId: string, startsAt: Date) => {
  const event = await createOpsEvent(db, {
    guildId,
    channelId: "c",
    hostId: "h",
    title: "Molten Core",
    note: null,
    slots: [{ name: "Tank", count: 1 }],
    startsAt,
    timezone: "UTC",
    repeatWeekly: false,
  });
  if (!event) throw new Error("no raid");
  return event;
};

describe("attendance", () => {
  it("is off until the dashboard turns it on", async () => {
    expect(await listAttendanceGuilds(db)).toEqual([]);
    await exec("RESET ROLE; SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "ops",
      patch: { trackAttendance: true },
      userId: "1",
      username: "staff",
    });
    await exec("RESET ROLE; SET ROLE garrison_bot");
    expect(r.ok).toBe(true);
    expect(await listAttendanceGuilds(db)).toEqual([G]);
  });

  it("looks for seated players in the window, then marks the rest missed", async () => {
    const event = await raid(G, minutes(5));
    const elsewhere = await raid(OTHER, minutes(5));
    await signUp(db, event.id, "a", "Tank", null);
    await signUp(db, event.id, "b", "Tank", null); // full: benched, never counted
    await signUp(db, elsewhere.id, "z", "Tank", null);
    const post = await createLfgPost(db, {
      guildId: G,
      channelId: "c",
      hostId: "host",
      hostSlot: "",
      title: "Duos",
      note: null,
      slots: [{ name: "", count: 3 }],
      startsAt: minutes(-20),
      expiresAt: minutes(120),
    });
    if (!post) throw new Error("no post");
    await joinLfg(db, post.id, "c");

    const found = await attendanceCandidates(db, [G], now);
    expect(found.map((f) => `${f.kind}:${f.userId}`).sort()).toEqual([
      "group:c",
      "group:host",
      "raid:a",
    ]);
    await markShowedUp(db, "group", post.id, ["host"]);

    // An hour on, the windows have closed: the group member nobody saw missed it.
    expect(await closeAttendance(db, [G], minutes(60))).toEqual({ raids: 1, groups: 1 });
    expect(await attendanceCandidates(db, [G], minutes(60))).toEqual([]);

    const summary = await attendanceSummary(db, G, minutes(-600));
    expect(summary.find((s) => s.userId === "a")).toMatchObject({
      raidsMissed: 1,
      reliability: 0,
    });
    expect(summary.find((s) => s.userId === "host")).toMatchObject({
      groupsShown: 1,
      reliability: 100,
    });
    expect(summary.some((s) => s.userId === "b" || s.userId === "z")).toBe(false);
  });

  it("lets staff correct a mark on a started raid in their own server only", async () => {
    const past = await raid(G, minutes(-30));
    const future = await raid(G, minutes(600));
    await signUp(db, past.id, "d", "Tank", null);
    await signUp(db, future.id, "d", "Tank", null);
    await exec("RESET ROLE; SET ROLE garrison_web");
    expect(await setRaidAttendance(db, G, past.id, "d", true)).toBe(true);
    expect(await setRaidAttendance(db, OTHER, past.id, "d", false)).toBe(false);
    expect(await setRaidAttendance(db, G, future.id, "d", true)).toBe(false);
    const recent = await recentRaidAttendance(db, G);
    await exec("RESET ROLE; SET ROLE garrison_bot");
    const row = recent.find((r) => r.event.id === past.id);
    expect(row?.signups.map((s) => [s.userId, s.attended])).toEqual([["d", true]]);
  });
});
