import { DEFAULT_LFG_PANEL, DEFAULT_WORDING, type RallyTemplate } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { lfgForm, lfgPanelMessage, templateRoles } from "./panel.js";

const t = (n: number, over: Partial<RallyTemplate> = {}): RallyTemplate => ({
  id: `tmpl${n}xxxx`,
  name: `Template ${n}`,
  game: null,
  roles: null,
  size: 5,
  wording: DEFAULT_WORDING,
  lifetimeHours: 3,
  voice: true,
  channelIds: [],
  notifyRoleId: null,
  isDefault: false,
  ...over,
});

type Field = {
  custom_id: string;
  required?: boolean;
  value?: string;
  options?: { value: string }[];
};
const fields = (modal: ReturnType<typeof lfgForm>) =>
  modal.toJSON().components.map((c) => (c as unknown as { component: Field }).component);

describe("the LFG panel", () => {
  it("has a button per template it shows, then Something else", () => {
    const texts = cardTexts(
      lfgPanelMessage(DEFAULT_LFG_PANEL, [t(1, { name: "Mythic+" }), t(2, { name: "Raid night" })]),
    ).join("\n");
    expect(texts).toContain("Find a group");
    expect(texts).toContain("[Mythic+]");
    expect(texts).toContain("[Raid night]");
    expect(texts).toContain("[Something else]");
    const own = cardTexts(
      lfgPanelMessage({ ...DEFAULT_LFG_PANEL, lfgPanelTitle: "Squad up", lfgPanelOther: false }, [
        t(1),
      ]),
    ).join("\n");
    expect(own).toContain("Squad up");
    expect(own).not.toContain("Something else");
  });

  it("asks a template's form what you're running, your role, when and a note", () => {
    const raid = t(1, { name: "Raid night", roles: "Tank 2, Healer 2, DPS 6", size: null });
    expect(templateRoles(raid)).toEqual(["Tank", "Healer", "DPS"]);
    const form = fields(lfgForm(raid));
    expect(form.map((f) => [f.custom_id, Boolean(f.required)])).toEqual([
      ["title", true],
      ["role", true],
      ["starts", false],
      ["note", false],
    ]);
    // What you're running starts as the template's name; the roles are a list to pick from.
    expect(form[0]?.value).toBe("Raid night");
    expect(form[1]?.options?.map((o) => o.value)).toEqual(["Tank", "Healer", "DPS"]);
  });

  it("skips the role for a template without roles, and asks the size for Something else", () => {
    expect(fields(lfgForm(t(1))).map((f) => f.custom_id)).toEqual(["title", "starts", "note"]);
    const other = fields(lfgForm(null));
    expect(other.map((f) => f.custom_id)).toEqual(["title", "slots", "starts", "note"]);
    expect(other[0]?.value).toBeUndefined();
  });
});
