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
    m.message("g", "u", 16 * 60_000, "c");
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
    // 2 heartbeat writes, 1 message count, 3 insight upserts (channel, hour, member: one batch
    // each), 1 last-seen (the same member's updates collapse to the latest), 1 latency batch
    // (rows '' and 'g' together).
    expect(calls.length).toBe(8);
  });

  it("writes the same handful of statements however many servers and members posted", async () => {
    const m = new Metrics();
    for (let g = 0; g < 300; g++)
      for (let u = 0; u < 5; u++) {
        m.message(`g${g}`, `u${u}`, 0, "c");
        m.response(`g${g}`, 100, 0);
      }
    const calls: number[] = [];
    await m.flush(
      {
        db: {
          insert: () => ({
            values: (rows: unknown) => ({
              onConflictDoUpdate: async () => {
                calls.push(Array.isArray(rows) ? rows.length : 1);
              },
            }),
          }),
        } as never,
        logger: {} as never,
      },
      0,
    );
    // 1,500 members in 300 servers: last-seen is 3 statements of up to 500 rows, not 1,500.
    expect(calls.length).toBeLessThan(15);
    expect(calls.reduce((a, b) => a + b, 0)).toBeGreaterThan(1500);
  });

  it("skips a flush while the previous one is still writing", async () => {
    const m = new Metrics();
    let release = () => {};
    let writes = 0;
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => {
            writes++;
            // Only the first write hangs until released; the rest answer at once.
            if (writes > 1) return Promise.resolve();
            return new Promise<void>((resolve) => {
              release = resolve;
            });
          },
        }),
      }),
    } as never;
    const first = m.flush({ db, logger: {} as never }, 0);
    await m.flush({ db, logger: {} as never }, 0);
    expect(writes).toBe(1);
    release();
    await first;
    // Once it finished, the next flush runs again.
    const before = writes;
    await m.flush({ db, logger: {} as never }, 0);
    expect(writes).toBeGreaterThan(before);
  });
});
