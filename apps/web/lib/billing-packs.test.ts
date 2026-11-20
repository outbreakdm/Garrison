import { describe, expect, it } from "vitest";
import { packSupplies } from "./billing-state";

describe("a pack's size on its Checkout session", () => {
  it("is granted as written, so a size change doesn't shrink a pack mid-purchase", () => {
    expect(packSupplies("1000")).toBe(1000);
    expect(packSupplies("800")).toBe(800);
  });

  it("falls back to today's size when it's missing or isn't a sane number", () => {
    for (const bad of [undefined, "", "abc", "-5", "0", "12.5", "1000000"])
      expect(packSupplies(bad)).toBeNull();
  });
});
