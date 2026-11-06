import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client.js";
import { upsertGuild } from "./repo/guilds.js";
import {
  closeLfg,
  createLfgPost,
  findOpenLfgByHost,
  joinLfg,
  leaveLfg,
  listActiveMembers,
  listExpiredLfg,
  listLfgWithVoice,
  listOpenLfg,
  pickSlot,
  setLfgMessage,
  setLfgVoice,
} from "./repo/rally.js";
import { lfgMembers } from "./schema.js";
import { createTestDb } from "./testing.js";

// Runs as garrison_bot, so missing grants fail here first.
let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "700";

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

const roles = [
  { name: "Tank", count: 1 },
  { name: "Healer", count: 1 },
  { name: "DPS", count: 3 },
];
let n = 0;
function post(slots = roles, hostSlot = "Tank", expiresAt = new Date(Date.now() + 3_600_000)) {
  return createLfgPost(db, {
    guildId: G,
    channelId: "c",
    hostId: `host${++n}`,
    hostSlot,
    title: "Mythic+ 12",
    note: null,
    slots,
    startsAt: new Date(),
    expiresAt,
  });
}

describe("pickSlot", () => {
  it("fills the requested group, or the first with room", () => {
    expect(pickSlot(roles, [{ slotName: "Tank" }])).toEqual({ ok: true, slot: "Healer" });
    expect(pickSlot(roles, [{ slotName: "Tank" }], "Tank")).toEqual({
      ok: false,
      reason: "slot_full",
    });
    expect(pickSlot(roles, [], "Bard")).toEqual({ ok: false, reason: "no_such_slot" });
    expect(pickSlot([{ name: "", count: 1 }], [{ slotName: "" }])).toEqual({
      ok: false,
      reason: "full",
    });
  });
});

describe("LFG posts", () => {
  it("allows one open group per host", async () => {
    const p = await post();
    expect(p).not.toBeNull();
    const again = await createLfgPost(db, {
      guildId: G,
      channelId: "c",
      hostId: p?.hostId ?? "",
      hostSlot: "Tank",
      title: "Second",
      note: null,
      slots: roles,
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });
    expect(again).toBeNull();
    expect((await findOpenLfgByHost(db, G, p?.hostId ?? ""))?.id).toBe(p?.id);
    await setLfgMessage(db, p?.id ?? "", "m1");
  });

  it("fills up, refuses extra joins, and reopens when someone leaves", async () => {
    const p = await post([{ name: "", count: 3 }], "");
    const id = p?.id ?? "";
    expect(await joinLfg(db, id, "a")).toMatchObject({ ok: true, becameFull: false });
    expect(await joinLfg(db, id, "a")).toEqual({ ok: false, reason: "already" });
    const full = await joinLfg(db, id, "b");
    expect(full).toMatchObject({ ok: true, becameFull: true });
    expect(full.ok && full.post.status).toBe("full");
    expect(await joinLfg(db, id, "c")).toEqual({ ok: false, reason: "full" });

    const left = await leaveLfg(db, id, "a");
    expect(left.ok && left.post.status).toBe("open");
    expect(await joinLfg(db, id, "c")).toMatchObject({ ok: true, becameFull: true });
    expect(await joinLfg(db, id, "a")).toEqual({ ok: false, reason: "full" });
  });

  it("gives the last slot to exactly one of several people joining at once", async () => {
    const p = await post([{ name: "", count: 2 }], "");
    const results = await Promise.all(["x", "y", "z", "w"].map((u) => joinLfg(db, p?.id ?? "", u)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listActiveMembers(db, p?.id ?? "")).toHaveLength(2);
  });

  it("switches role when there's room", async () => {
    const p = await post();
    const id = p?.id ?? "";
    await joinLfg(db, id, "d", "DPS");
    expect(await joinLfg(db, id, "d", "Healer")).toMatchObject({ ok: true, switched: true });
    expect(await joinLfg(db, id, "e", "Healer")).toEqual({ ok: false, reason: "slot_full" });
  });

  it("closes when the host leaves, and keeps who was there", async () => {
    const p = await post();
    const id = p?.id ?? "";
    await joinLfg(db, id, "f");
    const result = await leaveLfg(db, id, p?.hostId ?? "");
    expect(result).toMatchObject({ ok: true, hostLeft: true });
    expect(result.ok && result.post.status).toBe("closed");
    expect(await joinLfg(db, id, "g")).toEqual({ ok: false, reason: "closed" });
    expect(await leaveLfg(db, id, "f")).toEqual({ ok: false, reason: "closed" });
    // History stays: rows are marked left, never deleted.
    const all = await db.select().from(lfgMembers);
    expect(all.some((m) => m.postId === id && m.leftAt !== null)).toBe(true);
  });

  it("expires, tracks voice channels, and lists open groups", async () => {
    const p = await post(roles, "Tank", new Date(Date.now() - 1000));
    const id = p?.id ?? "";
    expect((await listExpiredLfg(db)).map((x) => x.id)).toContain(id);
    await setLfgVoice(db, id, "vc1");
    expect((await listLfgWithVoice(db)).map((x) => x.voiceChannelId)).toContain("vc1");
    expect(await closeLfg(db, id, "expired")).toMatchObject({ status: "expired" });
    expect(await closeLfg(db, id)).toBeNull();
    await setLfgVoice(db, id, null);
    expect((await listOpenLfg(db, G)).map((x) => x.id)).not.toContain(id);
  });

  it("can't delete memberships", async () => {
    const error = await db.delete(lfgMembers).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message}`,
    );
    expect(error).toMatch(/permission denied/);
  });
});
