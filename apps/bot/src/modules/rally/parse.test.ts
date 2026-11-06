import { describe, expect, it } from "vitest";
import { matchSlot, parseSlots, parseStart, voiceChannelName } from "./parse.js";

describe("parseSlots", () => {
  it("reads role lists in the forms people type", () => {
    expect(parseSlots("Tank 1, Healer 1, DPS 3", null)).toEqual({
      ok: true,
      value: [
        { name: "Tank", count: 1 },
        { name: "Healer", count: 1 },
        { name: "DPS", count: 3 },
      ],
    });
    expect(parseSlots("Tank, Healer, 3 DPS", null)).toMatchObject({
      ok: true,
      value: [{ count: 1 }, { count: 1 }, { name: "DPS", count: 3 }],
    });
    expect(parseSlots("Support x2, Carry", null)).toMatchObject({
      ok: true,
      value: [
        { name: "Support", count: 2 },
        { name: "Carry", count: 1 },
      ],
    });
  });

  it("uses numbered slots without roles", () => {
    expect(parseSlots(null, 5)).toEqual({ ok: true, value: [{ name: "", count: 5 }] });
    expect(parseSlots(null, 1)).toMatchObject({ ok: false });
    expect(parseSlots(null, 41)).toMatchObject({ ok: false });
  });

  it("rejects names that could carry mentions, links or markdown", () => {
    for (const bad of [
      "@everyone 1",
      "<@123> 1",
      "[free](https://x.y) 1",
      "**Tank** 1",
      "a".repeat(21),
    ]) {
      expect(parseSlots(bad, null)).toMatchObject({ ok: false });
    }
  });

  it("rejects duplicates, too many groups and bad totals", () => {
    expect(parseSlots("Tank 1, tank 2", null)).toMatchObject({ ok: false });
    expect(parseSlots("A 1, B 1, C 1, D 1, E 1", null)).toMatchObject({ ok: false });
    expect(parseSlots("Solo 1", null)).toMatchObject({ ok: false });
    expect(parseSlots("Zerg 41", null)).toMatchObject({ ok: false });
  });
});

describe("parseStart", () => {
  it("accepts now and relative times up to 7 days", () => {
    expect(parseStart(null, 0)).toEqual({ ok: true, value: new Date(0) });
    expect(parseStart("now", 0)).toEqual({ ok: true, value: new Date(0) });
    expect(parseStart("10m", 0)).toEqual({ ok: true, value: new Date(600_000) });
    expect(parseStart("8d", 0)).toMatchObject({ ok: false });
    expect(parseStart("tomorrow", 0)).toMatchObject({ ok: false });
  });
});

describe("matchSlot", () => {
  const groups = [
    { name: "Tank", count: 1 },
    { name: "DPS", count: 3 },
  ];
  it("matches case-insensitively and defaults to the first group", () => {
    expect(matchSlot(groups, "dps")).toBe("DPS");
    expect(matchSlot(groups, null)).toBe("Tank");
    expect(matchSlot(groups, "Bard")).toBeNull();
    expect(matchSlot([{ name: "", count: 5 }], "anything")).toBe("");
  });
});

describe("voiceChannelName", () => {
  it("strips anything that isn't plain text", () => {
    expect(voiceChannelName("Mythic+ 12 · Ara-Kara")).toBe("Mythic+ 12 Ara-Kara");
    expect(voiceChannelName("@everyone <@1> **raid**")).toBe("everyone 1 raid");
    expect(voiceChannelName("***")).toBe("Squad");
  });
});
