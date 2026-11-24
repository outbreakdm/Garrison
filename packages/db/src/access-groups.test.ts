import { describe, expect, it } from "vitest";
import {
  type AccessGrant,
  type AccessGroup,
  allows,
  checkAccessGroups,
  mayRequest,
  readAccessGroups,
  resolveAccess,
  switchFor,
} from "./access";

const KEL = "980000000000000031";
const ROOK = "980000000000000032";
const MODS = "980000000000000041";

const hosts: AccessGroup = {
  id: "abc123def0",
  name: "Giveaway hosts",
  areas: { spoils: "edit", ledger: "view" },
  switches: [],
  members: [{ kind: "role", id: MODS, name: "Mods" }],
};

describe("access groups", () => {
  it("gives a group's people only its areas, and nothing else", () => {
    const a = resolveAccess([], [hosts], KEL, [MODS]);
    expect(a).toMatchObject({ level: null, groups: ["Giveaway hosts"] });
    if (!a) return;
    expect(allows(a, "spoils", "edit")).toBe(true);
    expect(allows(a, "ledger", "view")).toBe(true);
    expect(allows(a, "ledger", "edit")).toBe(false);
    expect(allows(a, "watch", "view")).toBe(false);
    expect(resolveAccess([], [hosts], ROOK, [])).toBeNull();
  });

  it("adds groups on top of Viewer and Editor, the highest level winning", () => {
    const viewer: AccessGrant[] = [{ kind: "user", id: KEL, level: "viewer", name: "kel" }];
    const a = resolveAccess(viewer, [{ ...hosts, switches: ["coins"] }], KEL, [MODS]);
    if (!a) throw new Error("no access");
    expect(a.level).toBe("viewer");
    expect(allows(a, "watch", "view")).toBe(true);
    expect(allows(a, "watch", "edit")).toBe(false);
    expect(allows(a, "spoils", "edit")).toBe(true);
    expect(a.switches).toEqual(["coins"]);
    expect(switchFor("economy_adjust")).toBe("coins");
    expect(switchFor("mod_action")).toBe("moderate");
    expect(switchFor("start_giveaway")).toBeNull();
  });

  it("drops anything malformed, and keeps to the plan's number of groups", () => {
    expect(
      readAccessGroups([
        {
          ...hosts,
          areas: { spoils: "edit", plan: "edit", watch: "admin" },
          switches: ["coins", "root"],
        },
        { id: "x", name: "Bad id" },
      ]),
    ).toEqual([{ ...hosts, areas: { spoils: "edit" }, switches: ["coins"] }]);
    expect(checkAccessGroups([hosts, { ...hosts, id: "zzz999yyy8" }], 2)).toMatchObject({
      ok: false,
      error: "There's already a group called Giveaway hosts.",
    });
    expect(
      checkAccessGroups([hosts, { ...hosts, id: "zzz999yyy8", name: "Raid officers" }], 1),
    ).toMatchObject({
      ok: false,
      error: "This server's plan allows 1 access group.",
    });
    expect(checkAccessGroups([hosts], 2)).toEqual({ ok: true, value: [hosts] });
  });

  it("lets a group make requests in its areas, and manager-only ones only with their switch", () => {
    const mods: AccessGroup = {
      ...hosts,
      areas: { spoils: "edit", watch: "edit", rally: "view" },
      switches: [],
    };
    const a = resolveAccess([], [mods], KEL, [MODS]);
    if (!a) throw new Error("no access");
    expect(mayRequest(a, "start_giveaway")).toBe(true);
    expect(mayRequest(a, "post_message")).toBe(false);
    expect(mayRequest(a, "mod_action")).toBe(false);
    expect(mayRequest(a, "raid_signup")).toBe(true);
    expect(mayRequest(a, "create_raid")).toBe(false);
    expect(mayRequest(a, "economy_buy")).toBe(false);
    const trusted = resolveAccess([], [{ ...mods, switches: ["moderate"] }], KEL, [MODS]);
    if (!trusted) throw new Error("no access");
    expect(mayRequest(trusted, "mod_action")).toBe(true);
    expect(mayRequest(trusted, "lockdown_start")).toBe(false);
  });
});
