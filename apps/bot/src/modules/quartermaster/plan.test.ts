import { describe, expect, it } from "vitest";
import {
  type AiPlan,
  channelName,
  describeOrders,
  describePlan,
  displayName,
  MAX_OPERATIONS,
  MAX_ORDERS,
  orderPositions,
  roleCrossing,
  rollbackOrder,
  type ServerSnapshot,
  staleReferences,
  validatePlan,
} from "./plan.js";

const server: ServerSnapshot = {
  everyoneId: "g",
  categories: [{ id: "100000000000000001", name: "General" }],
  roles: [
    { id: "200000000000000001", name: "Members", managed: false },
    { id: "200000000000000002", name: "SomeBot", managed: true },
    { id: "g", name: "@everyone", managed: false },
  ],
  channelCount: 10,
  roleCount: 5,
};

type Op = AiPlan["operations"][number];
const op = (o: Partial<Op> & Pick<Op, "kind" | "ref" | "name">): Op => ({
  text_kind: null,
  parent: null,
  topic: null,
  slowmode_seconds: null,
  user_limit: null,
  private_to: [],
  read_only: null,
  posters: [],
  color_hex: null,
  hoist: null,
  mentionable: null,
  permissions: [],
  ...o,
});
const plan = (operations: Op[]): AiPlan => ({
  summary: "WARDOGS LFG section",
  operations,
  notes: "",
});

describe("validatePlan", () => {
  it("accepts a sensible build and resolves refs", () => {
    const r = validatePlan(
      plan([
        op({ kind: "create_role", ref: "gold", name: "Gold+", color_hex: "#d4ff3a", hoist: true }),
        op({ kind: "create_category", ref: "wardogs", name: "WARDOGS" }),
        op({
          kind: "create_text_channel",
          ref: "ranked",
          name: "Ranked LFG!!",
          parent: "wardogs",
          private_to: ["gold"],
          slowmode_seconds: 10,
        }),
        op({
          kind: "create_voice_channel",
          ref: "vc",
          name: "Ranked voice",
          parent: "100000000000000001",
          user_limit: 5,
        }),
      ]),
      server,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operations[2]).toMatchObject({
      name: "ranked-lfg",
      parent: "wardogs",
      privateTo: ["gold"],
      slowmodeSeconds: 10,
    });
    expect(r.operations[0]).toMatchObject({ color: 0xd4ff3a, hoist: true });
    expect(describePlan(r.operations, server)).toEqual([
      "+ Role @Gold+ · no permissions · #d4ff3a · shown separately",
      "+ Category WARDOGS",
      "+ #ranked-lfg · in WARDOGS · only @Gold+ can see it · slowmode 10 s",
      "+ Voice Ranked voice · in General · limit 5",
    ]);
  });

  it("rejects refs to things that don't exist or come later", () => {
    const r = validatePlan(
      plan([
        op({ kind: "create_text_channel", ref: "a", name: "a", parent: "later" }),
        op({ kind: "create_category", ref: "later", name: "Later" }),
      ]),
      server,
    );
    expect(r.ok).toBe(false);
  });

  it("won't make a channel private to @everyone or an integration's role", () => {
    for (const role of ["g", "200000000000000002"]) {
      expect(
        validatePlan(
          plan([op({ kind: "create_text_channel", ref: "a", name: "a", private_to: [role] })]),
          server,
        ).ok,
      ).toBe(false);
    }
  });

  it("rejects oversized, duplicate and malformed plans whole", () => {
    expect(
      validatePlan(
        plan(
          Array.from({ length: MAX_OPERATIONS + 1 }, (_, i) =>
            op({ kind: "create_role", ref: `r${i}`, name: `R${i}` }),
          ),
        ),
        server,
      ).ok,
    ).toBe(false);
    expect(
      validatePlan(
        plan([
          op({ kind: "create_role", ref: "x", name: "A" }),
          op({ kind: "create_role", ref: "x", name: "B" }),
        ]),
        server,
      ).ok,
    ).toBe(false);
    expect(
      validatePlan(
        plan([op({ kind: "create_role", ref: "x", name: "A", color_hex: "red" })]),
        server,
      ).ok,
    ).toBe(false);
    expect(
      validatePlan(plan([op({ kind: "create_role", ref: "Robert'); DROP", name: "A" })]), server)
        .ok,
    ).toBe(false);
    expect(validatePlan(plan([]), server).ok).toBe(false);
    expect(
      validatePlan(plan([op({ kind: "create_role", ref: "x", name: "A" })]), {
        ...server,
        roleCount: 250,
      }).ok,
    ).toBe(false);
  });

  it("strips mentions, markdown and control characters from names", () => {
    expect(displayName("@everyone **Admins** ‮txt.exe")).toBe("everyone Admins txt.exe");
    expect(channelName("  <#123> General Chat 💬 ")).toBe("123-general-chat");
    expect(
      validatePlan(plan([op({ kind: "create_role", ref: "x", name: "@@@" })]), server).ok,
    ).toBe(false);
  });
});

describe("channel rules and role permissions", () => {
  it("accepts read-only channels with posters, and allowlisted role permissions", () => {
    const r = validatePlan(
      plan([
        op({
          kind: "create_role",
          ref: "clips",
          name: "Clipper",
          permissions: ["attach_files", "stream"],
        }),
        op({
          kind: "create_text_channel",
          ref: "news",
          name: "announcements",
          read_only: true,
          posters: ["200000000000000001", "clips"],
        }),
        op({ kind: "create_voice_channel", ref: "stage", name: "Briefing", read_only: true }),
      ]),
      server,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operations[0]?.permissions).toEqual(["attach_files", "stream"]);
    expect(r.operations[1]).toMatchObject({
      readOnly: true,
      posters: ["200000000000000001", "clips"],
    });
    expect(describePlan(r.operations, server)).toEqual([
      "+ Role @Clipper · Attach files, Video and screen share",
      "+ #announcements · read-only, @Members, @Clipper can post",
      "+ Voice Briefing · listen-only",
    ]);
  });

  it("refuses posters without read-only, permissions on channels, and ones Garrison lacks", () => {
    const r = validatePlan(
      plan([
        op({ kind: "create_text_channel", ref: "a", name: "a", posters: ["200000000000000001"] }),
        op({
          kind: "create_text_channel",
          ref: "b",
          name: "b",
          permissions: ["attach_files"],
        }),
        op({ kind: "create_role", ref: "c", name: "C", permissions: ["stream"] }),
      ]),
      { ...server, grantable: ["attach_files"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/lists who can post, but isn't read-only/);
    expect(r.errors.join(" ")).toMatch(/only roles get permissions/);
    expect(r.errors.join(" ")).toMatch(/can't give "Video and screen share" yet/);
  });
});

describe("rollbackOrder", () => {
  it("removes channels, then categories, then roles", () => {
    const order = rollbackOrder([
      { kind: "role", id: "r", name: "r" },
      { kind: "category", id: "c", name: "c" },
      { kind: "channel", id: "ch", name: "ch" },
    ]);
    expect(order.map((o) => o.kind)).toEqual(["channel", "category", "role"]);
  });
});

describe("orders", () => {
  // Top to bottom: a staff role splits the plain roles into two sides.
  const laddered: ServerSnapshot = {
    everyoneId: "g",
    categories: [
      { id: "100000000000000001", name: "General" },
      { id: "100000000000000002", name: "Games" },
      { id: "100000000000000003", name: "Start here" },
    ],
    roles: [
      { id: "200000000000000010", name: "Owner", managed: false, movable: false },
      { id: "200000000000000011", name: "Pings", managed: false, movable: true },
      { id: "200000000000000012", name: "VIP", managed: false, movable: true },
      { id: "200000000000000013", name: "Mods", managed: false, movable: false },
      { id: "200000000000000014", name: "Members", managed: false, movable: true },
      { id: "200000000000000015", name: "Pronouns", managed: false, movable: true },
      { id: "g", name: "@everyone", managed: false, movable: false },
    ],
    channels: [
      { id: "300000000000000001", name: "chat", parentId: "100000000000000001" },
      { id: "300000000000000002", name: "rules", parentId: "100000000000000001" },
      { id: "300000000000000003", name: "lfg", parentId: "100000000000000002" },
      { id: "300000000000000004", name: "lobby", parentId: null },
      { id: "300000000000000005", name: "memes", parentId: null },
    ],
    channelCount: 8,
    roleCount: 7,
  };
  const withOrder = (order: AiPlan["order"], operations: Op[] = []) => ({
    ...plan(operations),
    order,
  });

  it("puts categories, a category's channels and roles in a new order", () => {
    const r = validatePlan(
      withOrder([
        {
          scope: "categories",
          parent: null,
          items: ["100000000000000003", "100000000000000001", "100000000000000002"],
        },
        {
          scope: "channels",
          parent: "100000000000000001",
          items: ["300000000000000002", "300000000000000001"],
        },
        { scope: "roles", parent: null, items: ["200000000000000012", "200000000000000011"] },
      ]),
      laddered,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orders.map((o) => o.names)).toEqual([
      ["Start here", "General", "Games"],
      ["rules", "chat"],
      ["VIP", "Pings"],
    ]);
  });

  it("orders the channels outside any category, and up to MAX_ORDERS lists in one plan", () => {
    const loose = validatePlan(
      withOrder([
        { scope: "channels", parent: null, items: ["300000000000000005", "300000000000000004"] },
      ]),
      laddered,
    );
    expect(loose.ok).toBe(true);
    if (!loose.ok) return;
    expect(loose.orders[0]).toMatchObject({ parent: null, names: ["memes", "lobby"] });
    // A whole-server tidy: more lists than the old limit of 6.
    const swap = {
      scope: "roles" as const,
      parent: null,
      items: ["200000000000000012", "200000000000000011"],
    };
    const many = validatePlan(withOrder(Array.from({ length: 8 }, () => swap)), laddered);
    expect(many.ok).toBe(true);
    const tooMany = validatePlan(
      withOrder(Array.from({ length: MAX_ORDERS + 1 }, () => swap)),
      laddered,
    );
    expect(!tooMany.ok && tooMany.errors).toContainEqual(
      `A plan can set ${MAX_ORDERS} orders at most.`,
    );
  });

  it("orders what the plan makes by ref, in its own category", () => {
    const r = validatePlan(
      withOrder(
        [
          { scope: "categories", parent: null, items: ["Info", "100000000000000001"] },
          { scope: "channels", parent: "info", items: ["verify", "welcome"] },
        ],
        [
          op({ kind: "create_category", ref: "info", name: "Info" }),
          op({ kind: "create_text_channel", ref: "welcome", name: "welcome", parent: "info" }),
          op({ kind: "create_text_channel", ref: "verify", name: "verify", parent: "info" }),
        ],
      ),
      laddered,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orders[0]?.items).toEqual(["info", "100000000000000001"]);
    expect(r.orders[1]).toMatchObject({ parent: "info", names: ["verify", "welcome"] });
    // Each order is one change.
    expect(describeOrders(r.orders, r.operations, laddered)).toEqual([
      "↕ Categories: Info, General",
      "↕ Channels in Info: verify, welcome",
    ]);
  });

  it("never moves a staff or bot role, or lets a role pass one", () => {
    const fixed = validatePlan(
      withOrder([
        { scope: "roles", parent: null, items: ["200000000000000013", "200000000000000014"] },
      ]),
      laddered,
    );
    expect(fixed.ok).toBe(false);
    if (!fixed.ok) expect(fixed.errors.join(" ")).toMatch(/admin or moderation powers/);
    // Pings sits above Mods and Members below: swapping them would lift Members over staff.
    const past = validatePlan(
      withOrder([
        { scope: "roles", parent: null, items: ["200000000000000014", "200000000000000011"] },
      ]),
      laddered,
    );
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.errors.join(" ")).toMatch(/@Members would pass a staff or bot role/);
    // A new role starts at the bottom, below Mods, so it can't jump above them either.
    const fresh = validatePlan(
      withOrder(
        [{ scope: "roles", parent: null, items: ["gold", "200000000000000012"] }],
        [op({ kind: "create_role", ref: "gold", name: "Gold" })],
      ),
      laddered,
    );
    expect(fresh.ok).toBe(false);
  });

  it("rejects orders across lists, with one item, or with repeats", () => {
    const r = validatePlan(
      withOrder([
        // lfg is in Games, not General.
        {
          scope: "channels",
          parent: "100000000000000001",
          items: ["300000000000000003", "300000000000000001"],
        },
        { scope: "categories", parent: null, items: ["100000000000000001"] },
        {
          scope: "categories",
          parent: null,
          items: ["100000000000000001", "100000000000000001", "100000000000000002"],
        },
        { scope: "channels", parent: "nowhere", items: ["a", "b"] },
      ]),
      laddered,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join(" ");
    expect(all).toMatch(/isn't one of the channels it can order/);
    expect(all).toMatch(/needs two or more categories/);
    expect(all).toMatch(/"General" is listed twice/);
    expect(all).toMatch(/"nowhere" isn't a category/);
  });

  it("swaps items among the places they hold now", () => {
    const roles = [
      { id: "a", position: 9 },
      { id: "b", position: 5 },
      { id: "c", position: 2 },
    ];
    // Roles: a higher number is higher up.
    expect(orderPositions(roles, ["c", "a", "b"], true)).toEqual([
      { id: "c", position: 9 },
      { id: "a", position: 5 },
      { id: "b", position: 2 },
    ]);
    // Channels: a lower number is higher up; unknown ids are skipped.
    expect(
      orderPositions(
        [
          { id: "x", position: 0 },
          { id: "y", position: 4 },
        ],
        ["y", "zz", "x"],
        false,
      ),
    ).toEqual([
      { id: "y", position: 0 },
      { id: "x", position: 4 },
    ]);
  });

  it("finds the first role that would cross a fixed one", () => {
    const ladder = [
      { id: "top", fixed: true },
      { id: "a", fixed: false },
      { id: "mod", fixed: true },
      { id: "b", fixed: false },
      { id: "c", fixed: false },
    ];
    expect(roleCrossing(ladder, ["c", "b"])).toBeNull();
    expect(roleCrossing(ladder, ["b", "a"])).toBe("b");
    expect(roleCrossing(ladder, ["a", "c", "b"])).toBeNull();
  });
});

describe("forum and announcement channels", () => {
  const channel = (text_kind: "forum" | "announcement") => ({
    summary: "x",
    notes: "",
    operations: [
      {
        kind: "create_text_channel" as const,
        ref: "news",
        name: "News",
        text_kind,
        parent: null,
        topic: "What's new",
        slowmode_seconds: null,
        user_limit: null,
        private_to: [],
        read_only: null,
        posters: [],
        color_hex: null,
        hoist: null,
        mentionable: null,
        permissions: [],
      },
    ],
  });

  it("makes a forum or, on a Community server, an announcement channel", () => {
    const forum = validatePlan(channel("forum"), server);
    expect(forum.ok && forum.operations[0]).toMatchObject({ textKind: "forum", name: "news" });
    const news = validatePlan(channel("announcement"), { ...server, community: true });
    expect(news.ok && news.operations[0]?.textKind).toBe("announcement");
  });

  it("refuses an announcement channel outside a Community server", () => {
    const out = validatePlan(channel("announcement"), { ...server, community: false });
    expect(!out.ok && out.errors[0]).toMatch(/need a Community server/);
  });
});

describe("staleReferences (drafts have no time limit, so they're checked again before building)", () => {
  const channel = {
    kind: "create_text_channel" as const,
    ref: "c1",
    name: "patch-notes",
    parent: "100000000000000001",
    topic: null,
    slowmodeSeconds: null,
    userLimit: null,
    privateTo: ["200000000000000001"],
    color: null,
    hoist: false,
    mentionable: false,
  };
  const withChannels: ServerSnapshot = {
    ...server,
    channels: [{ id: "300000000000000001", name: "general", parentId: null }],
  };

  it("finds nothing when everything the draft points at is still there", () => {
    expect(staleReferences({ plan: [channel] }, withChannels)).toEqual([]);
  });

  it("names a category or role deleted since the draft was made", () => {
    expect(staleReferences({ plan: [channel] }, { ...server, categories: [], roles: [] })).toEqual([
      "a category",
      "a role",
    ]);
  });

  it("names an existing channel an edit changes, as it was called", () => {
    const edits = [
      { kind: "edit_channel" as const, id: "300000000000000009", was: "lfg", name: "lfg-2" },
    ];
    expect(staleReferences({ plan: [], edits }, withChannels)).toEqual(["#lfg"]);
  });

  it("never counts what the same draft creates", () => {
    const category = {
      ...channel,
      kind: "create_category" as const,
      ref: "k1",
      parent: null,
      privateTo: [],
    };
    expect(
      staleReferences(
        { plan: [category, { ...channel, parent: "k1", privateTo: [] }] },
        withChannels,
      ),
    ).toEqual([]);
  });
});
