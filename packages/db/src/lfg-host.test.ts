import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  claimLfgPing,
  createLfgPost,
  handOverLfg,
  joinLfg,
  leaveLfg,
  setLfgLocked,
} from "./repo/rally";
import { createTestDb } from "./testing";

const G = "980000000000000051";
const HOST = "980000000000000061";
const ASH = "980000000000000062";
const VEX = "980000000000000063";

describe("a group's host controls", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  const group = (hostId: string, title: string) =>
    createLfgPost(db, {
      guildId: G,
      channelId: "980000000000000071",
      hostId,
      hostSlot: "",
      title,
      note: null,
      slots: [{ name: "", count: 5 }],
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

  it("locks a group to newcomers, lets the host hand it over, and spaces out pings", async () => {
    const post = await group(HOST, "Mythic+ push");
    if (!post) throw new Error("no group");
    expect((await joinLfg(db, post.id, ASH)).ok).toBe(true);

    const locked = await setLfgLocked(db, post.id, true);
    expect(locked?.locked).toBe(true);
    expect(await joinLfg(db, post.id, VEX)).toEqual({ ok: false, reason: "locked" });
    await setLfgLocked(db, post.id, false);
    expect((await joinLfg(db, post.id, VEX)).ok).toBe(true);

    // Only a member who hosts nothing else here can take it over.
    expect(await handOverLfg(db, post.id, "980000000000000099")).toEqual({
      ok: false,
      reason: "not_member",
    });
    expect(await group(VEX, "Their own")).not.toBeNull();
    expect(await handOverLfg(db, post.id, VEX)).toEqual({ ok: false, reason: "hosts_another" });
    expect(await handOverLfg(db, post.id, ASH)).toMatchObject({ ok: true, post: { hostId: ASH } });

    // Removing someone is the same as them leaving; the group stays open.
    const removed = await leaveLfg(db, post.id, VEX);
    expect(removed).toMatchObject({ ok: true, hostLeft: false, post: { status: "open" } });

    const now = new Date();
    expect(await claimLfgPing(db, post.id, now)).not.toBeNull();
    expect(await claimLfgPing(db, post.id, new Date(now.getTime() + 60_000))).toBeNull();
    expect(await claimLfgPing(db, post.id, new Date(now.getTime() + 11 * 60_000))).not.toBeNull();
  });
});
