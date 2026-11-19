import { type QmOperation, qmChargedChanges } from "@garrison/db";
import { describe, expect, it } from "vitest";
import {
  applyHandChange,
  type HandDraft,
  handChannelName,
  keepHandChanges,
  MAX_HAND_CHANGES,
} from "./hand.js";
import type { ServerSnapshot } from "./plan.js";

const CAT_INFO = "100000000000000001";
const CAT_GAMES = "100000000000000002";
const GENERAL = "200000000000000001";
const RULES = "200000000000000002";
const LOBBY = "200000000000000003";
const MEMBERS = "300000000000000001";
const MODS = "300000000000000002";

const server: ServerSnapshot = {
  everyoneId: "900000000000000000",
  categories: [
    { id: CAT_INFO, name: "Info" },
    { id: CAT_GAMES, name: "Games" },
  ],
  roles: [
    { id: MODS, name: "Mods", managed: false, movable: false },
    { id: MEMBERS, name: "Members", managed: false, movable: true },
    { id: "300000000000000003", name: "Gamers", managed: false, movable: true },
  ],
  channels: [
    { id: RULES, name: "📜-rules", parentId: CAT_INFO, kind: "text" },
    { id: GENERAL, name: "general", parentId: CAT_INFO, kind: "text" },
    { id: LOBBY, name: "Lobby", parentId: CAT_GAMES, kind: "voice" },
  ],
  channelCount: 5,
  roleCount: 4,
};

const none: HandDraft = { plan: [], edits: [], orders: [] };
const newChannel: QmOperation = {
  kind: "create_text_channel",
  ref: "clips",
  name: "clips",
  parent: CAT_GAMES,
  topic: null,
  slowmodeSeconds: null,
  userLimit: null,
  privateTo: [],
  readOnly: false,
  posters: [],
  color: null,
  hoist: false,
  mentionable: false,
  permissions: [],
} as unknown as QmOperation;

const ok = (r: ReturnType<typeof applyHandChange>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("hand changes in the Your server panel", () => {
  it("renames an existing channel as a free hand edit, and keeps emoji", () => {
    const r = ok(
      applyHandChange(none, { change: "rename", target: RULES, name: "📜 Server Rules" }, server),
    );
    expect(r.edits).toEqual([
      { kind: "edit_channel", id: RULES, was: "📜-rules", by: "admin", name: "📜-server-rules" },
    ]);
    expect(qmChargedChanges({ ...r, settings: [], posts: [] })).toBe(0);
  });

  it("drops the edit when the name goes back to what it is", () => {
    const once = ok(
      applyHandChange(none, { change: "rename", target: GENERAL, name: "chat" }, server),
    );
    const back = ok(
      applyHandChange(once, { change: "rename", target: GENERAL, name: "general" }, server),
    );
    expect(back.edits).toEqual([]);
  });

  it("renames on top of the AI's edit without making it free", () => {
    const draft: HandDraft = {
      ...none,
      edits: [{ kind: "edit_channel", id: GENERAL, was: "general", topic: "Say hi" }],
    };
    const r = ok(
      applyHandChange(draft, { change: "rename", target: GENERAL, name: "lounge" }, server),
    );
    expect(r.edits).toEqual([
      { kind: "edit_channel", id: GENERAL, was: "general", topic: "Say hi", name: "lounge" },
    ]);
  });

  it("renames something the draft makes by changing it in the plan", () => {
    const r = ok(
      applyHandChange(
        { ...none, plan: [newChannel] },
        { change: "rename", target: "clips", name: "Highlights" },
        server,
      ),
    );
    expect(r.plan[0]?.name).toBe("highlights");
    expect(r.edits).toEqual([]);
  });

  it("won't rename a staff role, or something the draft deletes", () => {
    expect(
      applyHandChange(none, { change: "rename", target: MODS, name: "Staff" }, server),
    ).toMatchObject({ ok: false, error: expect.stringContaining("Server Settings") });
    const deleting: HandDraft = {
      ...none,
      edits: [{ kind: "delete_channel", id: GENERAL, was: "general" }],
    };
    expect(
      applyHandChange(deleting, { change: "rename", target: GENERAL, name: "x" }, server).ok,
    ).toBe(false);
  });

  it("moves a channel to another category, and back again drops the edit", () => {
    const moved = ok(
      applyHandChange(none, { change: "move", target: GENERAL, parent: CAT_GAMES }, server),
    );
    expect(moved.edits).toEqual([
      { kind: "edit_channel", id: GENERAL, was: "general", by: "admin", parent: CAT_GAMES },
    ]);
    const back = ok(
      applyHandChange(moved, { change: "move", target: GENERAL, parent: CAT_INFO }, server),
    );
    expect(back.edits).toEqual([]);
  });

  it("takes a moved channel out of its old category's order", () => {
    const ordered = ok(
      applyHandChange(
        none,
        { change: "order", scope: "channels", parent: CAT_INFO, items: [GENERAL, RULES] },
        server,
      ),
    );
    const moved = ok(
      applyHandChange(ordered, { change: "move", target: GENERAL, parent: CAT_GAMES }, server),
    );
    // One item left isn't an order anymore.
    expect(moved.orders).toEqual([]);
  });

  it("puts a list in a new order, replacing an earlier order of that list", () => {
    const one = ok(
      applyHandChange(
        none,
        { change: "order", scope: "categories", parent: null, items: [CAT_GAMES, CAT_INFO] },
        server,
      ),
    );
    expect(one.orders).toEqual([
      {
        scope: "categories",
        parent: null,
        items: [CAT_GAMES, CAT_INFO],
        names: ["Games", "Info"],
        by: "admin",
      },
    ]);
    const two = ok(
      applyHandChange(
        one,
        { change: "order", scope: "categories", parent: null, items: [CAT_INFO, CAT_GAMES] },
        server,
      ),
    );
    expect(two.orders).toHaveLength(1);
    expect(two.orders[0]?.items).toEqual([CAT_INFO, CAT_GAMES]);
  });

  it("orders only roles Garrison may move, and channels in that category", () => {
    expect(
      applyHandChange(
        none,
        { change: "order", scope: "roles", parent: null, items: [MEMBERS, MODS] },
        server,
      ).ok,
    ).toBe(false);
    expect(
      applyHandChange(
        none,
        { change: "order", scope: "channels", parent: CAT_INFO, items: [GENERAL, LOBBY] },
        server,
      ).ok,
    ).toBe(false);
    // A channel the draft makes there counts as one of that category's.
    expect(
      applyHandChange(
        { ...none, plan: [newChannel] },
        { change: "order", scope: "channels", parent: CAT_GAMES, items: ["clips", LOBBY] },
        server,
      ).ok,
    ).toBe(true);
  });

  it("caps the hand changes one draft carries", () => {
    let d: HandDraft = none;
    const roles = Array.from({ length: MAX_HAND_CHANGES + 1 }, (_, i) => ({
      id: `4000000000000${String(i).padStart(5, "0")}`,
      name: `Role ${i}`,
      managed: false,
      movable: true,
    }));
    const big = { ...server, roles };
    for (const r of roles.slice(0, MAX_HAND_CHANGES))
      d = ok(applyHandChange(d, { change: "rename", target: r.id, name: `${r.name} x` }, big));
    const last = roles.at(-1);
    expect(
      applyHandChange(d, { change: "rename", target: last?.id ?? "", name: "y" }, big),
    ).toMatchObject({ ok: false, error: expect.stringContaining(String(MAX_HAND_CHANGES)) });
  });

  it("catches up with a rename made in Discord when the change is kept", () => {
    const draft: HandDraft = {
      ...none,
      edits: [
        { kind: "edit_channel", id: GENERAL, was: "old-general", name: "lounge", by: "admin" },
      ],
    };
    // Keep: the same change again, now made against the name the channel has today.
    const kept = ok(
      applyHandChange(draft, { change: "rename", target: GENERAL, name: "lounge" }, server),
    );
    expect(kept.edits[0]).toMatchObject({ was: "general", name: "lounge" });
  });

  it("cleans text channel names the way Discord takes them", () => {
    expect(handChannelName("  Patch Notes!! ")).toBe("patch-notes");
    expect(handChannelName("🎮 LFG — Ranked")).toBe("🎮-lfg-ranked");
  });
});

describe("an AI redraft keeps hand changes", () => {
  const hand = {
    edits: [
      {
        kind: "edit_channel" as const,
        id: GENERAL,
        was: "general",
        name: "lounge",
        by: "admin" as const,
      },
    ],
    orders: [
      {
        scope: "categories" as const,
        parent: null,
        items: [CAT_GAMES, CAT_INFO],
        names: ["Games", "Info"],
        by: "admin" as const,
      },
    ],
  };

  it("adds them back, the hand's name winning over the AI's", () => {
    const next = {
      plan: [],
      edits: [
        { kind: "edit_channel" as const, id: GENERAL, was: "general", name: "chat", topic: "Hi" },
      ],
      orders: [
        { scope: "categories" as const, parent: null, items: [CAT_INFO, CAT_GAMES], names: [] },
      ],
    };
    const kept = keepHandChanges(hand, next);
    expect(kept.edits).toEqual([
      { kind: "edit_channel", id: GENERAL, was: "general", name: "lounge", topic: "Hi" },
    ]);
    expect(kept.orders).toEqual(hand.orders);
  });

  it("drops what the redraft deletes or no longer makes", () => {
    const next = {
      plan: [],
      edits: [{ kind: "delete_channel" as const, id: GENERAL, was: "general" }],
      orders: [],
    };
    const withRef = {
      ...hand,
      orders: [{ ...hand.orders[0], items: ["newcat", CAT_INFO] } as (typeof hand.orders)[0]],
    };
    const kept = keepHandChanges(withRef, next);
    expect(kept.edits).toEqual(next.edits);
    expect(kept.orders).toEqual([]);
  });
});
