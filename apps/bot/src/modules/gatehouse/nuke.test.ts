import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  ActionRateTracker,
  canOverrideAntiNuke,
  dangerousBitsAdded,
  isTrusted,
  permissionNames,
  removableRoleIds,
} from "./nuke.js";

const { Administrator, ManageGuild, SendMessages, BanMembers } = PermissionFlagsBits;

describe("dangerousBitsAdded", () => {
  it("finds newly added dangerous permissions only", () => {
    expect(dangerousBitsAdded(0n, Administrator | SendMessages)).toBe(Administrator);
    expect(dangerousBitsAdded(BanMembers, BanMembers | SendMessages)).toBe(0n);
    expect(dangerousBitsAdded(Administrator, 0n)).toBe(0n);
  });
  it("names them the way Discord does", () => {
    expect(permissionNames(Administrator | ManageGuild)).toBe("Administrator, Manage Server");
    expect(permissionNames(BanMembers)).toBe("Ban Members");
  });
});

describe("trust", () => {
  const t = { ownerId: "owner", botId: "bot", trustedIds: ["friend"] };
  it("never acts on the owner, Garrison or trusted users", () => {
    expect(["owner", "bot", "friend"].map((id) => isTrusted(id, t))).toEqual([true, true, true]);
    expect(isTrusted("admin", t)).toBe(false);
  });
  it("lets only the owner and trusted users override, not Garrison", () => {
    expect(canOverrideAntiNuke("owner", t)).toBe(true);
    expect(canOverrideAntiNuke("friend", t)).toBe(true);
    expect(canOverrideAntiNuke("bot", t)).toBe(false);
    expect(canOverrideAntiNuke("admin", t)).toBe(false);
  });
});

describe("removableRoleIds", () => {
  it("skips @everyone, integration roles and roles at or above Garrison", () => {
    const roles = [
      { id: "g", position: 0, managed: false },
      { id: "member", position: 1, managed: false },
      { id: "admin", position: 5, managed: false },
      { id: "bot-role", position: 3, managed: true },
      { id: "top", position: 10, managed: false },
    ];
    expect(removableRoleIds(roles, "g", 10)).toEqual(["member", "admin"]);
  });
});

describe("ActionRateTracker", () => {
  it("counts per actor and per kind within the window", () => {
    const t = new ActionRateTracker();
    expect(t.record("g", "a", "delete", 60_000, 0)).toBe(1);
    expect(t.record("g", "a", "delete", 60_000, 1000)).toBe(2);
    expect(t.record("g", "a", "ban", 60_000, 1000)).toBe(1);
    expect(t.record("g", "b", "delete", 60_000, 1000)).toBe(1);
    expect(t.record("g", "a", "delete", 60_000, 61_500)).toBe(1);
    t.reset("g", "b");
    expect(t.record("g", "b", "delete", 60_000, 62_000)).toBe(1);
  });
});
