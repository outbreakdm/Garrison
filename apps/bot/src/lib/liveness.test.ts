import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answersWithin,
  EXIT_AFTER_MS,
  PROBE_EVERY_MS,
  PROBE_LIMIT_MS,
  UNHEALTHY_AFTER_MS,
  verdict,
  watchDatabase,
} from "./liveness.js";

describe("verdict", () => {
  it("is ok, then unhealthy, then exit as the database stays silent", () => {
    expect(verdict(0, UNHEALTHY_AFTER_MS - 1)).toBe("ok");
    expect(verdict(0, UNHEALTHY_AFTER_MS)).toBe("unhealthy");
    expect(verdict(0, EXIT_AFTER_MS)).toBe("exit");
  });
});

describe("answersWithin", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is true for an answer, false for a failure or a query that never returns", async () => {
    await expect(answersWithin(async () => 1, 100)).resolves.toBe(true);
    await expect(answersWithin(() => Promise.reject(new Error("refused")), 100)).resolves.toBe(
      false,
    );
    const hung = answersWithin(() => new Promise(() => {}), 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(hung).resolves.toBe(false);
  });
});

describe("watchDatabase", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays healthy while the database answers", async () => {
    const onExit = vi.fn();
    const live = watchDatabase(async () => {}, onExit);
    await vi.advanceTimersByTimeAsync(EXIT_AFTER_MS * 2);
    expect(live.healthy()).toBe(true);
    expect(onExit).not.toHaveBeenCalled();
    live.stop();
  });

  it("turns unhealthy, then exits once, when every query hangs (the 2026-11-18 outage)", async () => {
    const onExit = vi.fn();
    const live = watchDatabase(() => new Promise(() => {}), onExit);
    await vi.advanceTimersByTimeAsync(UNHEALTHY_AFTER_MS + PROBE_EVERY_MS);
    expect(live.healthy()).toBe(false);
    expect(onExit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EXIT_AFTER_MS + PROBE_LIMIT_MS);
    expect(onExit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(EXIT_AFTER_MS);
    expect(onExit).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it("recovers when the database answers again before the limit", async () => {
    let up = false;
    const onExit = vi.fn();
    const live = watchDatabase(() => (up ? Promise.resolve() : new Promise(() => {})), onExit);
    await vi.advanceTimersByTimeAsync(UNHEALTHY_AFTER_MS + PROBE_EVERY_MS);
    expect(live.healthy()).toBe(false);
    up = true;
    await vi.advanceTimersByTimeAsync(PROBE_EVERY_MS + PROBE_LIMIT_MS);
    expect(live.healthy()).toBe(true);
    await vi.advanceTimersByTimeAsync(EXIT_AFTER_MS);
    expect(onExit).not.toHaveBeenCalled();
    live.stop();
  });
});
