import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  accountAgeDays,
  JoinRateTracker,
  LOCK_BITS,
  planChannelLock,
  planRestore,
} from "./plan.js";

const EVERYONE = "g1";
const { SendMessages, ViewChannel, AttachFiles } = PermissionFlagsBits;

describe("planChannelLock", () => {
  it("denies posting to @everyone with no prior overwrite, and remembers there was none", () => {
    const { changes, snapshot } = planChannelLock("c1", [], EVERYONE, []);
    expect(changes).toEqual([
      { channelId: "c1", targetId: EVERYONE, type: 0, after: { allow: 0n, deny: LOCK_BITS } },
    ]);
    expect(snapshot).toEqual([{ channelId: "c1", targetId: EVERYONE, type: 0, before: null }]);
  });

  it("keeps unrelated bits and strips an explicit allow", () => {
    const before = { id: EVERYONE, type: 0 as const, allow: SendMessages | AttachFiles, deny: 0n };
    const { changes, snapshot } = planChannelLock("c1", [before], EVERYONE, []);
    expect(changes[0]?.after).toEqual({ allow: AttachFiles, deny: LOCK_BITS });
    expect(snapshot[0]?.before).toEqual({
      allow: (SendMessages | AttachFiles).toString(),
      deny: "0",
    });
  });

  it("lets staff roles keep talking", () => {
    const staff = { id: "mods", type: 0 as const, allow: 0n, deny: SendMessages };
    const { changes } = planChannelLock("c1", [staff], EVERYONE, ["mods", "admins"]);
    expect(changes.map((c) => [c.targetId, c.after])).toEqual([
      [EVERYONE, { allow: 0n, deny: LOCK_BITS }],
      ["mods", { allow: LOCK_BITS, deny: 0n }],
      ["admins", { allow: LOCK_BITS, deny: 0n }],
    ]);
  });

  it("skips private channels and channels already locked", () => {
    const hidden = { id: EVERYONE, type: 0 as const, allow: 0n, deny: ViewChannel };
    expect(planChannelLock("c1", [hidden], EVERYONE, ["mods"]).changes).toEqual([]);
    const locked = { id: EVERYONE, type: 0 as const, allow: 0n, deny: LOCK_BITS };
    expect(planChannelLock("c1", [locked], EVERYONE, []).changes).toEqual([]);
  });

  it("restores exactly what was there, deleting overwrites that didn't exist", () => {
    const before = { id: EVERYONE, type: 0 as const, allow: AttachFiles, deny: 0n };
    const { snapshot } = planChannelLock("c1", [before], EVERYONE, ["mods"]);
    expect(planRestore(snapshot)).toEqual([
      { channelId: "c1", targetId: EVERYONE, type: 0, after: { allow: AttachFiles, deny: 0n } },
      { channelId: "c1", targetId: "mods", type: 0, after: null },
    ]);
  });

  it("survives a JSON round trip, as stored in the database", () => {
    const before = { id: EVERYONE, type: 0 as const, allow: 1n << 50n, deny: 0n };
    const { snapshot } = planChannelLock("c1", [before], EVERYONE, []);
    const restored = planRestore(JSON.parse(JSON.stringify(snapshot)));
    expect(restored[0]?.after).toEqual({ allow: 1n << 50n, deny: 0n });
  });
});

describe("JoinRateTracker", () => {
  it("counts joins inside the window only", () => {
    const t = new JoinRateTracker();
    expect(t.record("g", 30_000, 0)).toBe(1);
    expect(t.record("g", 30_000, 10_000)).toBe(2);
    expect(t.record("g", 30_000, 29_999)).toBe(3);
    expect(t.record("g", 30_000, 40_001)).toBe(2);
    expect(t.record("other", 30_000, 40_001)).toBe(1);
    t.reset("g");
    expect(t.record("g", 30_000, 40_002)).toBe(1);
  });
});

describe("accountAgeDays", () => {
  it("floors to whole days", () => {
    expect(accountAgeDays(0, 2.9 * 86_400_000)).toBe(2);
  });
});

describe("Gatehouse copy", () => {
  const lockdown = {
    id: "3f2a9c1e-0000-0000-0000-000000000000",
    guildId: "g",
    source: "anti_raid" as const,
    reason: null,
    startedById: "bot",
    startedAt: new Date("2026-11-06T14:00:00Z"),
    endsAt: null,
    invitesPaused: true,
    snapshot: [],
    endedAt: new Date("2026-11-06T14:04:00Z"),
    endedById: "mod",
  };

  it("reports how long a lockdown lasted", async () => {
    const { lockdownEndedEmbed } = await import("./embeds.js");
    const json = lockdownEndedEmbed(lockdown, { restored: 12, failed: 0 }).toJSON();
    expect(json.title).toBe("Lockdown lifted after 4 min");
    expect(json.description).toContain("Invites are open again.");
    expect(json.footer?.text).toBe("Gatehouse · lockdown 3f2a9c");
  });

  it("flags new accounts the way the dashboard shows them", async () => {
    const { newAccountFlagEmbed } = await import("./embeds.js");
    const json = newAccountFlagEmbed(
      { id: "1", username: "kel", createdAt: new Date() },
      2,
    ).toJSON();
    expect(json.title).toBe("Flagged a 2-day-old account on join");
  });
});
