import { describe, expect, it } from "vitest";
import { gatehouseForm, opsForm, pick, watchForm } from "./settings-schema";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("watchForm", () => {
  it("reads checkboxes, empty channels and blank text", () => {
    const f = form({ logChannelId: "", appealText: "  " });
    expect(watchForm.parse(pick(f, ["logChannelId", "dmMembers", "appealText"]))).toEqual({
      logChannelId: null,
      dmMembers: false,
      appealText: null,
    });
    const g = form({
      logChannelId: "123456789012345678",
      dmMembers: "on",
      appealText: "Open a ticket",
    });
    expect(watchForm.parse(pick(g, ["logChannelId", "dmMembers", "appealText"]))).toEqual({
      logChannelId: "123456789012345678",
      dmMembers: true,
      appealText: "Open a ticket",
    });
  });

  it("rejects anything that isn't a channel ID", () => {
    for (const bad of ["general", "1' or '1'='1", "<#123>", "12"]) {
      expect(watchForm.safeParse({ logChannelId: bad, appealText: "" }).success).toBe(false);
    }
  });
});

describe("gatehouseForm", () => {
  const ok = {
    alertChannelId: "",
    antiRaidEnabled: "on",
    raidJoinCount: "10",
    raidWindowSeconds: "30",
    raidResponse: "lockdown",
    autoUnlockMinutes: "15",
    flagAccountAgeDays: "7",
  };
  it("coerces numbers within the slash-command ranges", () => {
    expect(gatehouseForm.parse(ok)).toMatchObject({
      raidJoinCount: 10,
      antiRaidEnabled: true,
      raidResponse: "lockdown",
    });
  });
  it.each([
    ["raidJoinCount", "2"],
    ["raidJoinCount", "1e9"],
    ["raidWindowSeconds", "3.5"],
    ["autoUnlockMinutes", "-1"],
    ["raidResponse", "ban everyone"],
    ["flagAccountAgeDays", "abc"],
  ])("rejects %s = %j", (field, value) => {
    expect(gatehouseForm.safeParse({ ...ok, [field]: value }).success).toBe(false);
  });
});

describe("pick", () => {
  it("drops fields the form doesn't own, like anti-nuke", () => {
    const f = form({ antiNukeEnabled: "", antiNukeTrustedIds: "attacker", raidJoinCount: "5" });
    expect(Object.keys(pick(f, ["raidJoinCount"]))).toEqual(["raidJoinCount"]);
  });
});

describe("opsForm", () => {
  it("accepts real time zones only", () => {
    expect(opsForm.safeParse({ timezone: "America/Chicago" }).success).toBe(true);
    expect(opsForm.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
  });
});
