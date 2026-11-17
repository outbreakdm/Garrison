import type { QmOperation, QmOrder, QmSettingChange } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { withoutItem } from "./remove.js";

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

const draft = {
  plan: [
    op({ kind: "create_role", ref: "gold", name: "Gold+" }),
    op({ kind: "create_role", ref: "mods", name: "Mods" }),
    op({ kind: "create_category", ref: "val", name: "VALORANT" }),
    op({
      kind: "create_text_channel",
      ref: "ranked",
      name: "ranked",
      parent: "val",
      privateTo: ["gold"],
    }),
    op({ kind: "create_text_channel", ref: "staff", name: "staff", privateTo: ["gold", "mods"] }),
    op({
      kind: "create_text_channel",
      ref: "news",
      name: "news",
      readOnly: true,
      posters: ["mods"],
    }),
    op({ kind: "create_text_channel", ref: "clips", name: "clips" }),
  ],
  settings: [
    { module: "suggestions", field: "channelId", from: null, to: "clips" },
    { module: "automod", field: "exemptRoleIds", from: [], to: ["mods"] },
  ] as QmSettingChange[],
  posts: [{ kind: "message" as const, itemId: "r1", name: "Rules", channel: "news" }],
};

describe("taking an item out of a draft", () => {
  it("takes a category's channels with it", () => {
    const t = withoutItem(draft, { ref: "val" });
    expect(t.removed).toEqual(["VALORANT", "ranked"]);
    expect(t.plan.map((o) => o.ref)).toEqual(["gold", "mods", "staff", "news", "clips"]);
  });

  it("takes channels private to nothing but the removed role, and the role from the rest", () => {
    const t = withoutItem(draft, { ref: "gold" });
    expect(t.removed).toEqual(["Gold+", "ranked"]);
    expect(t.plan.find((o) => o.ref === "staff")?.privateTo).toEqual(["mods"]);
  });

  it("drops settings and posts that point at what's gone, and posters lists lose it", () => {
    const t = withoutItem(draft, { ref: "mods" });
    expect(t.settings.map((c) => c.field)).toEqual(["channelId"]);
    expect(t.plan.find((o) => o.ref === "news")?.posters).toEqual([]);
    expect(withoutItem(draft, { ref: "news" }).posts).toEqual([]);
    expect(withoutItem(draft, { ref: "clips" }).settings.map((c) => c.module)).toEqual(["automod"]);
  });

  it("removes one setting or one post on its own", () => {
    const s = withoutItem(draft, { setting: "automod.exemptRoleIds" });
    expect(s.settings).toHaveLength(1);
    expect(s.plan).toHaveLength(draft.plan.length);
    const p = withoutItem(draft, { post: 0 });
    expect(p.posts).toEqual([]);
    expect(p.removed).toEqual(["Rules"]);
  });

  it("removes nothing for something that isn't there", () => {
    expect(withoutItem(draft, { ref: "nope" }).removed).toEqual([]);
    expect(withoutItem(draft, { setting: "x.y" }).removed).toEqual([]);
  });

  it("keeps orders whole, minus what's gone, and can drop one", () => {
    const orders: QmOrder[] = [
      { scope: "categories", parent: null, items: ["val", "100"], names: ["VALORANT", "General"] },
      {
        scope: "roles",
        parent: null,
        items: ["gold", "mods", "205"],
        names: ["Gold+", "Mods", "VIP"],
      },
      { scope: "channels", parent: "val", items: ["ranked", "301"], names: ["ranked", "chat"] },
    ];
    const ordered = { ...draft, orders };
    // A setting removed: the orders stay as they were.
    expect(withoutItem(ordered, { setting: "automod.exemptRoleIds" }).orders).toEqual(orders);
    // The category goes: its own order goes, and the categories order is down to one.
    expect(withoutItem(ordered, { ref: "val" }).orders.map((o) => o.scope)).toEqual(["roles"]);
    // A role goes: the roles order closes up around it.
    expect(withoutItem(ordered, { ref: "gold" }).orders[1]).toEqual({
      scope: "roles",
      parent: null,
      items: ["mods", "205"],
      names: ["Mods", "VIP"],
    });
    const one = withoutItem(ordered, { order: 1 });
    expect(one.removed).toEqual(["the new order of the roles"]);
    expect(one.orders.map((o) => o.scope)).toEqual(["categories", "channels"]);
    expect(one.plan).toHaveLength(draft.plan.length);
  });
});
