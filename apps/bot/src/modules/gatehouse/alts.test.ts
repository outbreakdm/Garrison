import { describe, expect, it } from "vitest";
import { altSignals, distance, nameKey } from "./alts.js";

const ban = (targetTag: string, caseNumber = 7) => ({
  caseNumber,
  targetId: "100000000000000001",
  targetTag,
  createdAt: new Date("2026-11-01T00:00:00Z"),
});
const joiner = (name: string, over: Partial<{ hasAvatar: boolean; ageDays: number }> = {}) => ({
  username: name,
  displayName: name,
  hasAvatar: true,
  ageDays: 400,
  ...over,
});

describe("alt warning signs", () => {
  it("reads names past case, symbols and trailing digits", () => {
    expect(nameKey("xX_Rook_99Xx")).toBe("rook");
    expect(nameKey("R.O.O.K")).toBe("rook");
    expect(distance("rookie", "rooky")).toBe(2);
    expect(distance("rook", "completely")).toBeGreaterThan(3);
  });

  it("warns on the same name even with an old account and an avatar", () => {
    expect(altSignals(joiner("Rook_2"), [ban("rook")])?.reasons).toEqual(["the same name"]);
  });

  it("needs another sign when the name is only close", () => {
    expect(altSignals(joiner("rookie"), [ban("rooky")])).toBeNull();
    expect(altSignals(joiner("rookie", { ageDays: 2 }), [ban("rooky")])?.reasons).toEqual([
      "a very similar name",
      "an account 2 days old",
    ]);
  });

  it("ignores short or unrelated names", () => {
    expect(altSignals(joiner("bob", { ageDays: 1, hasAvatar: false }), [ban("bob")])).toBeNull();
    expect(altSignals(joiner("ironclad", { ageDays: 1 }), [ban("rook")])).toBeNull();
  });
});
