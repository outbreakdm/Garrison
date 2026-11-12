import { describe, expect, it } from "vitest";
import { takeSlot, WELCOMES_PER_MINUTE } from "./service.js";

describe("welcome rate limit", () => {
  it("allows a burst, then waits a minute", () => {
    const g = "990000000000000001";
    for (let i = 0; i < WELCOMES_PER_MINUTE; i++) expect(takeSlot(g, 1000 + i)).toBe(true);
    expect(takeSlot(g, 2000)).toBe(false);
    expect(takeSlot(g, 62_000)).toBe(true);
  });
});
