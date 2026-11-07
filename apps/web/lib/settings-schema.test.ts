import { describe, expect, it } from "vitest";
import { gatehouseForm, ledgerForm, opsForm, pick, ranksForm, watchForm } from "./settings-schema";

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

describe("ranksForm", () => {
  it("needs a channel only when level-ups go to one, and drops it otherwise", () => {
    const ch = "123456789012345678";
    expect(
      ranksForm.safeParse({ enabled: "on", announce: "channel", announceChannelId: "" }).success,
    ).toBe(false);
    expect(ranksForm.parse({ enabled: "on", announce: "channel", announceChannelId: ch })).toEqual({
      enabled: true,
      announce: "channel",
      announceChannelId: ch,
    });
    expect(ranksForm.parse({ enabled: undefined, announce: "off", announceChannelId: ch })).toEqual(
      {
        enabled: false,
        announce: "off",
        announceChannelId: null,
      },
    );
    expect(ranksForm.safeParse({ announce: "everyone", announceChannelId: "" }).success).toBe(
      false,
    );
  });
});

describe("ledgerForm", () => {
  it.each([["6"], ["366"], ["30.5"], ["x"]])("rejects retention %j", (v) => {
    expect(ledgerForm.safeParse({ channelId: "", retentionDays: v }).success).toBe(false);
  });
  it("accepts 7..365 and no channel", () => {
    expect(ledgerForm.parse({ channelId: "", retentionDays: "90" })).toEqual({
      channelId: null,
      retentionDays: 90,
    });
  });
});
