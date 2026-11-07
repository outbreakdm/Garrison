import { describe, expect, it } from "vitest";
import { Metrics, percentile } from "./metrics.js";

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBe(0);
  });
});

describe("Metrics", () => {
  it("counts messages, throttles last-seen and records latency per guild and overall", async () => {
    const m = new Metrics();
    m.message("g", "u", 0);
    m.message("g", "u", 1000);
    m.message("g", "u", 16 * 60_000);
    m.response("g", 120, 0);
    m.response(null, 90, 0);
    m.response("g", -5, 0); // ignored: clock skew
    const calls: string[] = [];
    // Exercise flush through the real repo functions with a fake db that just records writes.
    await m.flush(
      {
        db: {
          insert: () => ({
            values: () => ({
              onConflictDoUpdate: async () => {
                calls.push("write");
              },
            }),
          }),
        } as never,
        logger: {} as never,
      },
      0,
    );
    // 1 message count, 1 last-seen (the same member's updates collapse to the latest),
    // 2 latency rows ('' and 'g'), 2 heartbeat writes.
    expect(calls.length).toBe(6);
  });
});
