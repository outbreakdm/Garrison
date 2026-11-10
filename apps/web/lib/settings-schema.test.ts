import { describe, expect, it } from "vitest";
import {
  gatehouseForm,
  ladderText,
  ledgerForm,
  opsForm,
  parseLadder,
  pick,
  ranksForm,
  templatesChangeText,
  watchForm,
} from "./settings-schema";

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
    verifyRoleId: "",
    verifyMinAccountAgeDays: "0",
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
    ["verifyMinAccountAgeDays", "400"],
    ["verifyRoleId", "everyone"],
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

describe("parseLadder", () => {
  const ladder = (rows: Record<string, string>[]) => {
    const f = new FormData();
    rows.forEach((r, i) => {
      for (const [k, v] of Object.entries(r)) f.set(`step${i}_${k}`, v);
    });
    return parseLadder(f);
  };
  it("keeps filled rows, drops empty ones, and clears duration off timeouts", () => {
    const r = ladder([
      { warns: "3", window: "1440", action: "timeout", duration: "3600" },
      { warns: "", window: "1440", action: "ban", duration: "" },
      { warns: "5", window: "10080", action: "ban", duration: "3600" },
    ]);
    expect(r.success && r.data).toEqual([
      { warnCount: 3, windowMinutes: 1440, action: "timeout", durationSeconds: 3600 },
      { warnCount: 5, windowMinutes: 10080, action: "ban", durationSeconds: null },
    ]);
  });
  it.each([
    [{ warns: "3", window: "999", action: "kick", duration: "" }],
    [{ warns: "3", window: "1440", action: "timeout", duration: "5" }],
    [{ warns: "0", window: "1440", action: "kick", duration: "" }],
    [{ warns: "3", window: "1440", action: "nuke", duration: "" }],
  ])("refuses %j", (row) => {
    expect(ladder([row]).success).toBe(false);
  });
  it("refuses two steps at the same count", () => {
    const row = { warns: "3", window: "1440", action: "kick", duration: "" };
    expect(ladder([row, row]).success).toBe(false);
  });
  it("describes a ladder for history", () => {
    expect(
      ladderText([
        { warnCount: 3, windowMinutes: 1440, action: "timeout", durationSeconds: 3600 },
        { warnCount: 5, windowMinutes: 10080, action: "ban", durationSeconds: null },
      ]),
    ).toBe("3 in 24 h: timeout 1 h; 5 in 7 d: ban");
    expect(ladderText([])).toBe("no steps");
  });
});

describe("templatesChangeText", () => {
  it("says which templates were added, edited, renamed and removed", () => {
    const a = [
      { id: "1", name: "Raid" },
      { id: "2", name: "Ranked", size: 5 },
      { id: "3", name: "Old" },
    ];
    const b = [
      { id: "1", name: "Raid" },
      { id: "2", name: "Comp", size: 5 },
      { id: "4", name: "Fireteam" },
    ];
    expect(templatesChangeText(a, b)).toBe("Added Fireteam; edited Ranked (now Comp); removed Old");
  });
});

import { parseRewards } from "./settings-schema";

describe("parseRewards", () => {
  const form = (rows: [string, string][]) => {
    const f = new FormData();
    rows.forEach(([level, role], i) => {
      f.set(`reward${i}_level`, level);
      f.set(`reward${i}_role`, role);
    });
    return f;
  };
  const ROLE = "500000000000000001";

  it("keeps rows with a level and a role", () => {
    expect(parseRewards(form([["5", ROLE]]))).toEqual({
      ok: true,
      value: [{ level: 5, roleId: ROLE }],
    });
  });

  it("drops a row whose role was cleared, which is how a reward is removed", () => {
    expect(
      parseRewards(
        form([
          ["5", ""],
          ["10", ROLE],
          ["", ""],
        ]),
      ),
    ).toEqual({ ok: true, value: [{ level: 10, roleId: ROLE }] });
  });

  it("refuses a role without a level, a bad level, and two rewards at one level", () => {
    expect(parseRewards(form([["", ROLE]]))).toEqual({ ok: false, error: "level" });
    expect(parseRewards(form([["501", ROLE]]))).toEqual({ ok: false, error: "level" });
    expect(
      parseRewards(
        form([
          ["5", ROLE],
          ["5", ROLE],
        ]),
      ),
    ).toEqual({ ok: false, error: "duplicate" });
  });
});
