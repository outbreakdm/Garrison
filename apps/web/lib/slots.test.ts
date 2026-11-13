import { describe, expect, it } from "vitest";
import { slotsFromText, slotsText } from "./slots";

const form = (pairs: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of pairs) f.append(k, v);
  return f;
};

describe("role slots", () => {
  it("read stored text back into rows, either way round", () => {
    expect(slotsFromText("Tank 2, Healer 4, 14 DPS")).toEqual([
      { name: "Tank", count: "2" },
      { name: "Healer", count: "4" },
      { name: "DPS", count: "14" },
    ]);
    expect(slotsFromText("Support")).toEqual([{ name: "Support", count: "1" }]);
    expect(slotsFromText(null)).toEqual([]);
  });

  it("join rows into the text the parser reads, skipping empty names", () => {
    const f = form([
      ["slotName", "Tank"],
      ["slotCount", "2"],
      ["slotName", " "],
      ["slotCount", "5"],
      ["slotName", "DPS"],
      ["slotCount", ""],
    ]);
    expect(slotsText(f)).toBe("Tank 2, DPS 1");
  });

  it("say nothing when the form has no rows, so the old text field still works", () => {
    expect(slotsText(form([["roles", "Tank 1"]]))).toBeNull();
  });
});
