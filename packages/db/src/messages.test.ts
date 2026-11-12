import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankCard } from "./cards";
import type { Db } from "./client";
import {
  checkMessages,
  dueOccurrence,
  nextOccurrence,
  pausedSchedules,
  type SavedMessage,
  wallToUtc,
} from "./messages";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import {
  claimSend,
  getMessages,
  lastSends,
  listScheduledMessages,
  recordSentMessage,
  releaseSend,
} from "./repo/messages";
import { applySettingsChange } from "./repo/settings";
import { messageSettings } from "./schema";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const C = "300000000000000001";
const TZ = "America/Chicago";

const msg = (over: Partial<SavedMessage> = {}): SavedMessage => ({
  id: "msg0000001",
  name: "Raid night",
  card: blankCard("Raid night tonight"),
  buttons: [],
  channelId: C,
  schedule: null,
  ...over,
});

describe("schedules", () => {
  it("reads wall times in the server's time zone", () => {
    expect(wallToUtc("2026-11-12T20:00", TZ)?.toISOString()).toBe("2026-11-13T02:00:00.000Z");
    expect(wallToUtc("2026-13-01T20:00", TZ)).toBeNull();
    expect(wallToUtc("tomorrow", TZ)).toBeNull();
  });

  it("sends a one-off once, and skips it if missed by over an hour", () => {
    const s = { at: "2026-11-12T20:00", repeat: "none" as const };
    const at = new Date("2026-11-13T02:00:00Z");
    expect(dueOccurrence(s, TZ, null, new Date("2026-11-13T01:59:00Z"))).toBeNull();
    expect(dueOccurrence(s, TZ, null, new Date("2026-11-13T02:00:30Z"))).toEqual(at);
    expect(dueOccurrence(s, TZ, at, new Date("2026-11-13T02:01:00Z"))).toBeNull();
    expect(dueOccurrence(s, TZ, null, new Date("2026-11-13T03:30:00Z"))).toBeNull();
  });

  it("keeps a weekly time across daylight saving", () => {
    // 8 PM Chicago on Thursday 29 Oct (CDT, UTC-5), then Thursday 5 Nov (CST, UTC-6).
    const s = { at: "2026-10-29T20:00", repeat: "weekly" as const };
    const first = new Date("2026-10-30T01:00:00Z");
    const second = new Date("2026-11-06T02:00:00Z");
    expect(dueOccurrence(s, TZ, first, new Date("2026-11-06T02:00:10Z"))).toEqual(second);
    expect(dueOccurrence(s, TZ, second, new Date("2026-11-06T02:05:00Z"))).toBeNull();
    expect(nextOccurrence(s, TZ, new Date("2026-11-06T03:00:00Z"))).toEqual(
      new Date("2026-11-13T02:00:00Z"),
    );
    // Long after the start, a daily one finds today's send.
    const daily = { at: "2026-01-01T09:00", repeat: "daily" as const };
    expect(dueOccurrence(daily, TZ, null, new Date("2026-11-12T15:00:30Z"))).toEqual(
      new Date("2026-11-12T15:00:00Z"),
    );
  });
});

describe("message rules", () => {
  const sched = (id: string) => msg({ id, schedule: { at: "2026-11-12T20:00", repeat: "none" } });

  it("holds Free to 3 scheduled, once each, without link buttons", () => {
    const four = ["aaaaaa", "bbbbbb", "cccccc", "dddddd"].map(sched);
    expect(checkMessages(four, free)).toMatchObject({ ok: false });
    expect(checkMessages(four, pro)).toMatchObject({ ok: true });
    expect(checkMessages(four, free, four)).toMatchObject({ ok: true });
    expect(pausedSchedules(four, free)).toEqual(new Set(["dddddd"]));
    const weekly = msg({ schedule: { at: "2026-11-12T20:00", repeat: "weekly" } });
    expect(checkMessages([weekly], free)).toMatchObject({ ok: false });
    const linked = msg({ buttons: [{ label: "Site", url: "https://example.com" }] });
    expect(checkMessages([linked], free)).toMatchObject({ ok: false });
    expect(checkMessages([linked], pro)).toMatchObject({ ok: true });
  });

  it("refuses bad links and schedules without a channel", () => {
    const bad = msg({ buttons: [{ label: "x", url: "javascript:alert(1)" }] });
    expect(checkMessages([bad], pro)).toMatchObject({ ok: false });
    const nowhere = msg({ channelId: null, schedule: { at: "2026-11-12T20:00", repeat: "none" } });
    expect(checkMessages([nowhere], pro)).toMatchObject({ ok: false });
  });
});

describe("message storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "980";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("lets the dashboard save, and the bot claim each send exactly once", async () => {
    await exec("SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "messages",
      patch: { messages: [msg()] },
      userId: "1",
      username: "taner",
    });
    expect(r.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await getMessages(db, G)).toHaveLength(1);
    const send = {
      guildId: G,
      messageId: "msg0000001",
      occurrence: new Date("2026-11-13T02:00:00Z"),
    };
    expect(await claimSend(db, { ...send, channelId: C })).toBe(true);
    expect(await claimSend(db, { ...send, channelId: C })).toBe(false);
    // A failed post gives its claim back, and it can be claimed again.
    await releaseSend(db, send);
    expect(await claimSend(db, { ...send, channelId: C })).toBe(true);
    await recordSentMessage(db, send, "900000000000000001");
    // A send that reached Discord can't be released.
    await releaseSend(db, send);
    expect(await claimSend(db, { ...send, channelId: C })).toBe(false);
    // Only servers with something scheduled reach the sweep.
    expect(await listScheduledMessages(db)).toEqual([]);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    const scheduled = msg({ schedule: { at: "2026-11-12T20:00", repeat: "none" } });
    await applySettingsChange(db, {
      guildId: G,
      module: "messages",
      patch: { messages: [scheduled] },
      userId: "1",
      username: "taner",
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect((await listScheduledMessages(db)).map((r) => r.guildId)).toEqual([G]);
    expect((await lastSends(db, G)).get("msg0000001")).toEqual(send.occurrence);
    const err = await Promise.resolve(db.update(messageSettings).set({ messages: [] })).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});
