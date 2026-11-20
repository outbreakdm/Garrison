import { describe, expect, it, vi } from "vitest";
import { ACTION_DEADLINE_MS, actionDeadline, withinDeadline } from "./actions.js";

describe("a dashboard request's deadline", () => {
  it("gives AI requests longer than the rest, both inside the 10 minutes a request lives", () => {
    expect(actionDeadline("qm_chat")).toBe(ACTION_DEADLINE_MS.ai);
    expect(actionDeadline("purge")).toBe(ACTION_DEADLINE_MS.other);
    expect(ACTION_DEADLINE_MS.ai).toBeLessThan(10 * 60_000);
  });

  it("answers with the work when it finishes, and with a failure when it hangs", async () => {
    vi.useFakeTimers();
    try {
      const done = withinDeadline(Promise.resolve({ ok: true, message: "Done." }), 1000, () => ({
        ok: false,
        message: "Too slow.",
      }));
      await expect(done).resolves.toEqual({ ok: true, message: "Done." });
      const hung = withinDeadline(new Promise(() => {}), 1000, () => ({
        ok: false,
        message: "Too slow.",
      }));
      vi.advanceTimersByTime(1000);
      await expect(hung).resolves.toEqual({ ok: false, message: "Too slow." });
    } finally {
      vi.useRealTimers();
    }
  });
});
