import type { QmOperation, QmSettingChange } from "@garrison/db";
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
});
