import { describe, expect, it } from "vitest";
import { rememberCommandIds, slash } from "./slash.js";

describe("slash", () => {
  it("shows the name as code until Discord has given the ids", () => {
    rememberCommandIds([]);
    expect(slash("lfg create")).toBe("`/lfg create`");
  });

  it("makes a clickable mention, subcommand included, once the id is known", () => {
    rememberCommandIds([{ name: "lfg", id: "123" }]);
    expect(slash("lfg create")).toBe("</lfg create:123>");
    expect(slash("lfg")).toBe("</lfg:123>");
    expect(slash("raid list")).toBe("`/raid list`");
  });
});
