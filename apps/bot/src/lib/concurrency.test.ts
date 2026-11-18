import { describe, expect, it } from "vitest";
import { forEachLimit } from "./concurrency.js";

describe("forEachLimit", () => {
  it("runs every item, never more than the limit at once, past failures", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await forEachLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 2) throw new Error("one server failed");
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it("does nothing for no items", async () => {
    await forEachLimit([], 3, async () => {
      throw new Error("never");
    });
  });
});
