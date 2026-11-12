import { describe, expect, it } from "vitest";
import { entitlements, FEATURES } from "./plans";
import { PLAN_LIMITS, TEMPLATE_HARD_MAX } from "./rally";

describe("plans", () => {
  it("never gives Free more than Pro", () => {
    const list: [string, { about: string; free: number | boolean; pro: number | boolean }][] =
      Object.entries(FEATURES);
    for (const [key, f] of list) {
      if (typeof f.free === "number") expect(f.free, key).toBeLessThanOrEqual(Number(f.pro));
      else expect(!f.free || f.pro === true, key).toBe(true);
      expect(f.about.length, key).toBeGreaterThan(0);
    }
  });

  it("reads limits per plan", () => {
    expect(entitlements("free")["rally.templates"]).toBe(3);
    expect(entitlements("pro")["rally.notifyRole"]).toBe(true);
  });

  it("keeps Rally's limits in step with the list", () => {
    expect(PLAN_LIMITS.free.templates).toBe(FEATURES["rally.templates"].free);
    expect(TEMPLATE_HARD_MAX).toBe(FEATURES["rally.templates"].pro);
  });
});
