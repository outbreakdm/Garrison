import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { combatLevel, fetchHiscores, isValidRsn, normalizeRsn } from "./osrs.js";

describe("OSRS names", () => {
  it("accepts real-looking names only", () => {
    expect(["Zezima", "Iron Man_1", "a-b"].every(isValidRsn)).toBe(true);
    expect(["", "   ", "thirteen_chars", "<@123>", "a/b"].some(isValidRsn)).toBe(false);
    expect(normalizeRsn(" Iron_Man ")).toBe("iron man");
  });
});

describe("combatLevel", () => {
  it("matches known values", () => {
    expect(combatLevel({})).toBe(3); // a fresh account
    const maxed = Object.fromEntries(
      ["Attack", "Strength", "Defense", "Hitpoints", "Prayer", "Ranged", "Magic"].map((s) => [
        s,
        99,
      ]),
    );
    expect(combatLevel(maxed)).toBe(126);
  });
});

describe("fetchHiscores", () => {
  const json = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });
  // Lookups wait their turn, 1.5 s apart (politely, for Jagex's sake). Fake timers skip the
  // waits, so four lookups don't outlast the test's 5 s limit.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const look = async (name: string, impl: typeof fetch) => {
    const result = fetchHiscores(name, impl);
    await vi.runAllTimersAsync();
    return result;
  };

  it("summarizes a player", async () => {
    const r = await look(
      "Zezima",
      json(200, {
        name: "Zezima",
        skills: [
          { name: "Overall", level: 2277, xp: 4_600_000_000 },
          { name: "Attack", level: 99, xp: 1 },
        ],
      }) as typeof fetch,
    );
    expect(r).toEqual({
      ok: true,
      name: "Zezima",
      stats: { totalLevel: 2277, totalXp: 4_600_000_000, combatLevel: 35 },
    });
  });

  it("separates unknown players from outages", async () => {
    expect(await look("nobody", json(404, {}) as typeof fetch)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await look("x", json(503, {}) as typeof fetch)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await look("x", json(200, { unexpected: true }) as typeof fetch)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(
      await look("x", (async () => {
        throw new Error("network");
      }) as typeof fetch),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});
