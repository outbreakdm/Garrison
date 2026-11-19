import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HELP, HELP_TOPICS, type HelpEntry, helpPlanLines, helpText } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { searchIndex } from "./search-index";

const pages = fileURLToPath(new URL("../app/servers/[guildId]", import.meta.url));

describe("Garrison's help", () => {
  it("points every entry at a dashboard page that exists", () => {
    const missing = HELP_TOPICS.filter((t) => {
      const path = (HELP[t] as HelpEntry).path.split(/[?#]/)[0] ?? "";
      return path !== "" && !existsSync(join(pages, path, "page.tsx"));
    });
    expect(missing).toEqual([]);
  });

  it("gives every entry steps, and plan limits from the real feature list", () => {
    for (const t of HELP_TOPICS) {
      const e: HelpEntry = HELP[t];
      expect(e.steps.length, t).toBeGreaterThan(0);
      if (e.modules?.length) expect(helpPlanLines(e).length, t).toBeGreaterThan(0);
    }
    expect(helpText("tickets")).toContain("Ticket panels: Free 1, Pro 10");
    expect(helpText("tickets")).toContain("/ticket close");
  });

  it("is found by the dashboard search", () => {
    expect(searchIndex("how verify").map((e) => e.path)).toContain("/help#verification");
    expect(searchIndex("twitch").some((e) => e.where === "Help")).toBe(true);
  });
});
