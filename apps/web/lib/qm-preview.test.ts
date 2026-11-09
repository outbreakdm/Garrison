import type { QmOperation } from "@garrison/db";
import { describe, expect, it } from "vitest";
import type { ServerLayout } from "./discord";
import { addedText, planLines, previewServer } from "./qm-preview";

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
