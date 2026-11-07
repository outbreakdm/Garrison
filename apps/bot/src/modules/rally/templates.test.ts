import { DEFAULT_WORDING } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { findTemplate, postWording, usableTemplates } from "./templates.js";

const t = (n: number, over: Record<string, unknown> = {}) => ({
  id: `tmpl${n}xxxx`,
  name: `Template ${n}`,
  game: null,
  roles: null,
  size: 5,
  wording: DEFAULT_WORDING,
  lifetimeHours: 3,
  voice: true,
  channelIds: [],
  notifyRoleId: "123456789012345678",
  isDefault: n === 2,
  ...over,
});

describe("usableTemplates", () => {
  it("applies the plan at use: a downgraded server keeps 3 templates and loses role pings", () => {
    const five = [1, 2, 3, 4, 5].map((n) => t(n));
    const free = usableTemplates(five, "free");
    expect(free.map((x) => x.name)).toEqual(["Template 1", "Template 2", "Template 3"]);
    expect(free.every((x) => x.notifyRoleId === null)).toBe(true);
    expect(usableTemplates(five, "pro")).toHaveLength(5);
  });

  it("drops a stored list that fails its check rather than trusting it", () => {
    expect(
      usableTemplates([t(1, { wording: { ...DEFAULT_WORDING, full: "@everyone" } })], "pro"),
    ).toEqual([]);
    expect(usableTemplates("not a list", "pro")).toEqual([]);
  });
});

describe("findTemplate", () => {
  const list = usableTemplates([t(1), t(2)], "pro");
  it("matches an autocomplete ID or a typed name, and falls back to the default", () => {
    expect(findTemplate(list, "tmpl1xxxx")?.name).toBe("Template 1");
    expect(findTemplate(list, "template 1")?.name).toBe("Template 1");
    expect(findTemplate(list, null)?.name).toBe("Template 2");
    expect(findTemplate(list, "nope")).toBeNull();
  });
  it("fills in default wording for older posts", () => {
    expect(postWording(null).join).toBe("Join as {role}");
    expect(postWording({ group: "raid" }).group).toBe("raid");
  });
});
