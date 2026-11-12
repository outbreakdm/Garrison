import { describe, expect, it } from "vitest";
import { checkStatRoles, meetsStatRole, readStatRoles, statRoleChanges } from "./stat-roles";

const MAXED = "100000000000000001";
const VETERAN = "100000000000000002";
const osrs = (totalLevel: number) => ({
  provider: "osrs",
  details: { totalLevel, combatLevel: 90 },
});

describe("roles from game stats", () => {
  it("checks the stat, the range and the role", () => {
    expect(checkStatRoles([{ source: "osrs:totalLevel", min: 2000, roleId: MAXED }]).ok).toBe(true);
    expect(checkStatRoles([{ source: "osrs:totalLevel", min: 3000, roleId: MAXED }]).ok).toBe(
      false,
    );
    expect(checkStatRoles([{ source: "steam:hours", min: 10, roleId: MAXED }]).ok).toBe(false);
    expect(checkStatRoles([{ source: "wow:level", min: 80, roleId: "@everyone" }]).ok).toBe(false);
    expect(readStatRoles({})).toEqual([]);
  });

  it("matches on any shared account of that game", () => {
    const rule = { source: "osrs:totalLevel" as const, min: 2000, roleId: MAXED };
    expect(meetsStatRole(rule, [osrs(1500), osrs(2100)])).toBe(true);
    expect(meetsStatRole(rule, [osrs(1500)])).toBe(false);
    expect(meetsStatRole(rule, [{ provider: "rs3", details: { totalLevel: 2500 } }])).toBe(false);
  });

  it("adds what's met, removes what isn't, and keeps a role any rule still gives", () => {
    const rules = [
      { source: "osrs:totalLevel" as const, min: 2000, roleId: MAXED },
      { source: "osrs:combatLevel" as const, min: 120, roleId: VETERAN },
      { source: "wow:level" as const, min: 80, roleId: VETERAN },
    ];
    const links = [osrs(2100), { provider: "wow", details: { level: 80 } }];
    expect(statRoleChanges(rules, links, new Set())).toEqual({ add: [MAXED, VETERAN], remove: [] });
    expect(statRoleChanges(rules, [osrs(100)], new Set([MAXED, VETERAN, "other"]))).toEqual({
      add: [],
      remove: [MAXED, VETERAN],
    });
  });
});
