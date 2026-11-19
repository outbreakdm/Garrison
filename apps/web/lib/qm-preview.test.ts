import type { QmOperation, QmOrder } from "@garrison/db";
import { describe, expect, it } from "vitest";
import type { ServerLayout } from "./discord";
import {
  addedText,
  afterRows,
  orderLines,
  planLines,
  previewServer,
  reorderRows,
  settingDiffs,
} from "./qm-preview";

const op = (o: Partial<QmOperation> & Pick<QmOperation, "kind" | "ref" | "name">): QmOperation => ({
  parent: null,
  topic: null,
  slowmodeSeconds: null,
  userLimit: null,
  privateTo: [],
  color: null,
  hoist: false,
  mentionable: false,
  ...o,
});

const layout: ServerLayout = {
  loose: [{ id: "c0", name: "rules", kind: "text", locked: false }],
  categories: [
    {
      id: "cat1",
      name: "Town Square",
      channels: [
        { id: "c1", name: "general", kind: "text", locked: false },
        { id: "c2", name: "Voice", kind: "voice", locked: false },
      ],
    },
    {
      id: "cat2",
      name: "Staff",
      channels: [{ id: "c3", name: "mods", kind: "text", locked: true }],
    },
  ],
  roles: [{ id: "r1", name: "Mods", color: 255, managed: false }],
};

const plan: QmOperation[] = [
  op({ kind: "create_role", ref: "gold", name: "Gold+", hoist: true }),
  op({ kind: "create_category", ref: "val", name: "Valorant" }),
  op({ kind: "create_voice_channel", ref: "v1", name: "Stack", parent: "val", userLimit: 5 }),
  op({
    kind: "create_text_channel",
    ref: "ranked",
    name: "ranked",
    parent: "val",
    privateTo: ["gold", "r1"],
  }),
  op({ kind: "create_text_channel", ref: "clips", name: "clips", parent: "cat1" }),
  op({ kind: "create_text_channel", ref: "lost", name: "lost", parent: "deleted-category" }),
];

describe("previewServer", () => {
  it("changes nothing when there is no plan", () => {
    const p = previewServer(layout, []);
    expect(p.added).toEqual({ categories: 0, channels: 0, roles: 0 });
    expect(p.categories.every((c) => !c.touched && !c.isNew)).toBe(true);
    expect(p.categories[0]?.channels.map((c) => c.name)).toEqual(["general", "Voice"]);
  });

  it("puts new channels where Discord will, text above voice", () => {
    const p = previewServer(layout, plan);
    const town = p.categories[0];
    expect(town?.touched).toBe(true);
    expect(town?.channels.map((c) => `${c.name}${c.isNew ? "+" : ""}`)).toEqual([
      "general",
      "clips+",
      "Voice",
    ]);
    expect(p.categories[1]?.touched).toBe(false);
    const val = p.categories.at(-1);
    expect(val).toMatchObject({ name: "Valorant", isNew: true });
    expect(val?.channels.map((c) => c.name)).toEqual(["ranked", "Stack"]);
  });

  it("names who can see a private channel, from the plan or the server", () => {
    const ranked = previewServer(layout, plan).categories.at(-1)?.channels[0];
    expect(ranked).toMatchObject({ locked: true, details: ["Only @Gold+, @Mods"] });
  });

  it("keeps a channel whose category has gone, at the top", () => {
    expect(previewServer(layout, plan).loose.map((c) => c.name)).toEqual(["rules", "lost"]);
  });

  it("adds new roles at the bottom with no permissions", () => {
    const p = previewServer(layout, plan);
    expect(p.roles.at(-1)).toMatchObject({
      name: "Gold+",
      isNew: true,
      details: ["No permissions", "Shown separately"],
    });
    expect(p.added).toEqual({ categories: 1, channels: 4, roles: 1 });
  });
});

describe("plan wording", () => {
  it("counts what a plan adds in plain words", () => {
    expect(addedText({ categories: 1, channels: 5, roles: 1 })).toBe(
      "1 category, 5 channels and 1 role",
    );
    expect(addedText({ categories: 0, channels: 1, roles: 0 })).toBe("1 channel");
    expect(addedText({ categories: 0, channels: 0, roles: 0 })).toBe("nothing");
  });

  it("writes one line per change", () => {
    expect(planLines(plan).slice(0, 4)).toEqual([
      "+ Role @Gold+ · no permissions",
      "+ Category Valorant",
      "+ Voice Stack in Valorant",
      "+ #ranked in Valorant · private",
    ]);
  });
});

describe("settingDiffs", () => {
  it("shows each setting from and to, with names for channels, roles and new items", () => {
    const plan = [op({ kind: "create_text_channel", ref: "ideas", name: "ideas" })];
    expect(
      settingDiffs(layout, plan, [
        { module: "suggestions", field: "enabled", from: false, to: true },
        { module: "suggestions", field: "channelId", from: "c1", to: "ideas" },
        { module: "automod", field: "words", from: [], to: ["a", "b"] },
        { module: "ranks", field: "announce", from: "same_channel", to: "off" },
        { module: "watch", field: "logChannelId", from: "gone", to: null },
      ]),
    ).toEqual([
      { key: "suggestions.enabled", label: "Suggestions · On", from: "Off", to: "On" },
      {
        key: "suggestions.channelId",
        label: "Suggestions · Channel",
        from: "#general",
        to: "#ideas (new)",
      },
      { key: "automod.words", label: "Automod · Blocked words", from: "none", to: "2 words" },
      { key: "ranks.announce", label: "Leveling · Level-ups", from: "same channel", to: "off" },
      {
        key: "watch.logChannelId",
        label: "Moderation · Mod log",
        from: "a deleted channel or role",
        to: "none",
      },
    ]);
  });
});

describe("a plan's new order", () => {
  const orders: QmOrder[] = [
    { scope: "categories", parent: null, items: ["val", "cat2", "cat1"], names: [] },
    { scope: "channels", parent: "cat1", items: ["clips", "c1"], names: [] },
    { scope: "roles", parent: null, items: ["gold", "r1"], names: [] },
  ];
  const p = previewServer(layout, plan, "", orders);
  const names = (l: { name: string }[]) => l.map((x) => x.name);
  const now = <T extends { isNew: boolean; moved?: string }>(l: T[]) =>
    l.filter((x) => !x.isNew && x.moved !== "to");

  it("shows the new order, and the old one for Now", () => {
    const after = afterRows(p.categories);
    expect(names(after)).toEqual(["Valorant", "Staff", "Town Square"]);
    expect(names(now(p.categories))).toEqual(["Town Square", "Staff"]);
    const square = after.find((c) => c.key === "cat1");
    // Text above voice whatever the order says; the new channel moves up.
    expect(names(afterRows(square?.channels ?? []))).toEqual(["clips", "general", "Voice"]);
    expect(names(now(square?.channels ?? []))).toEqual(["general", "Voice"]);
    expect(square?.touched).toBe(true);
  });

  it("numbers roles as they'll be, a moved new role included", () => {
    expect(afterRows(p.roles).map((r) => [r.name, r.position])).toEqual([
      ["Gold+", 1],
      ["Mods", 2],
    ]);
    expect(p.moved).toBeGreaterThan(0);
  });

  it("leaves rows alone for an order of one or of unknown items", () => {
    const list = [
      { key: "a", isNew: false },
      { key: "b", isNew: false },
    ];
    expect(reorderRows(list, ["a", "zz"]).rows).toBe(list);
    expect(reorderRows(list, ["a", "b"]).moved).toBe(0);
  });

  it("says each order in words", () => {
    expect(
      orderLines(
        [
          { scope: "channels", parent: "val", items: ["a", "b"], names: ["ranked", "Stack"] },
          { scope: "roles", parent: null, items: ["x", "y"], names: ["VIP", "Pings"] },
        ],
        plan,
        layout,
      ).map((o) => `${o.where}: ${o.names.join(", ")}`),
    ).toEqual(["Channels in Valorant: ranked, Stack", "Roles: @VIP, @Pings"]);
  });
});

describe("a plan's edits, shown in place", () => {
  const edits = [
    { kind: "edit_channel" as const, id: "c1", was: "general", name: "lounge" },
    { kind: "edit_channel" as const, id: "c3", was: "mods", parent: "cat1" },
    { kind: "edit_category" as const, id: "cat2", was: "Staff", name: "Team" },
    { kind: "delete_role" as const, id: "r1", was: "Mods" },
  ];
  const p = previewServer(layout, [], "g", [], edits);
  const town = p.categories.find((c) => c.key === "cat1");
  const staff = p.categories.find((c) => c.key === "cat2");

  it("shows a rename with the old name kept for Now", () => {
    expect(town?.channels.find((c) => c.key === "c1")).toMatchObject({
      name: "lounge",
      was: "general",
    });
    expect(staff).toMatchObject({ name: "Team", was: "Staff" });
  });

  it("moves a channel to its new category, leaving its old place for Now", () => {
    expect(town?.channels.find((c) => c.key === "c3")).toMatchObject({ moved: "to" });
    expect(staff?.channels.find((c) => c.key === "c3")).toMatchObject({ moved: "from" });
    expect(town?.touched).toBe(true);
    expect(p.moved).toBe(1);
  });

  it("marks what the plan deletes", () => {
    expect(p.roles.find((r) => r.key === "r1")).toMatchObject({ gone: true });
  });
});
