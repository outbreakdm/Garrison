import { checkTemplates, DEFAULT_WORDING } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { templateFromForm, upsertTemplate } from "./rally-templates";

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

describe("templateFromForm", () => {
  it("reads a template, keeping default wording for blank fields", () => {
    const t = templateFromForm(
      form({
        templateId: "abc1234567",
        name: "Ranked",
        game: "Valorant",
        roles: "",
        size: "5",
        w_group: "stack",
        w_join: "",
        w_joinAny: "Queue up",
        w_requirement: "Rank",
        lifetimeHours: "2",
        voice: "on",
        channelIds: ["300000000000000001", ""],
      }),
    );
    const checked = checkTemplates([t], "free");
    expect(checked.ok && checked.value[0]).toMatchObject({
      name: "Ranked",
      size: 5,
      roles: null,
      voice: true,
      channelIds: ["300000000000000001"],
      wording: {
        group: "stack",
        join: DEFAULT_WORDING.join,
        joinAny: "Queue up",
        requirement: "Rank",
      },
    });
  });

  it("ignores fields it doesn't know", () => {
    const t = templateFromForm(
      form({ templateId: "abc1234567", name: "X1", plan: "pro", size: "4" }),
    );
    expect(t).not.toHaveProperty("plan");
  });
});

describe("upsertTemplate", () => {
  it("replaces by ID and keeps one default", () => {
    const base = checkTemplates(
      [
        { id: "aaaaaa1111", name: "A1", size: 4, isDefault: true },
        { id: "bbbbbb2222", name: "B2", size: 4 },
      ],
      "free",
    );
    if (!base.ok) throw new Error(base.error);
    const next = upsertTemplate(base.value, { ...base.value[1], isDefault: true });
    expect(next.map((t) => [t.id, t.isDefault])).toEqual([
      ["aaaaaa1111", false],
      ["bbbbbb2222", true],
    ]);
    expect(upsertTemplate(base.value, { id: "cccccc3333", name: "C3" })).toHaveLength(3);
  });
});
