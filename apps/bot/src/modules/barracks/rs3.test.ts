import { describe, expect, it } from "vitest";
import { fetchRs3Hiscores, parseRs3 } from "./rs3.js";

describe("RuneScape 3 hiscores", () => {
  it("reads the overall line from the CSV", () => {
    expect(parseRs3("1234,2898,5600000000\n10,99,200000000\n")).toEqual({
      totalLevel: 2898,
      totalXp: 5600000000,
    });
    expect(parseRs3("<html>busy</html>")).toBeNull();
  });

  it("tells a missing player from an outage", async () => {
    const notFound = (async () => new Response("", { status: 404 })) as typeof fetch;
    const down = (async () => new Response("", { status: 503 })) as typeof fetch;
    expect(await fetchRs3Hiscores("Nobody", notFound)).toEqual({ ok: false, reason: "not_found" });
    expect(await fetchRs3Hiscores("Nobody", down)).toEqual({ ok: false, reason: "unavailable" });
  });
});
