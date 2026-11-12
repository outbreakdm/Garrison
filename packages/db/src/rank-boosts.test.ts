import { describe, expect, it } from "vitest";
import { BOOSTS_MAX, boostFor, checkBoosts, readBoosts } from "./rank-boosts";

const ROLE = "100000000000000001";
const CHANNEL = "200000000000000002";
const CATEGORY = "300000000000000003";

describe("XP boosts", () => {
  it("accepts roles, channels and the listed multipliers only", () => {
    expect(checkBoosts([{ kind: "role", id: ROLE, multiplier: 2 }]).ok).toBe(true);
    expect(checkBoosts([{ kind: "role", id: ROLE, multiplier: 10 }]).ok).toBe(false);
    expect(checkBoosts([{ kind: "user", id: ROLE, multiplier: 2 }]).ok).toBe(false);
    expect(checkBoosts([{ kind: "role", id: "everyone", multiplier: 2 }]).ok).toBe(false);
    expect(
      checkBoosts([
        { kind: "role", id: ROLE, multiplier: 2 },
        { kind: "role", id: ROLE, multiplier: 3 },
      ]).ok,
    ).toBe(false);
    const many = Array.from({ length: BOOSTS_MAX + 1 }, (_, i) => ({
      kind: "role",
      id: `1000000000000000${String(i).padStart(2, "0")}`,
      multiplier: 2,
    }));
    expect(checkBoosts(many).ok).toBe(false);
    expect(readBoosts("nonsense")).toEqual([]);
    expect(readBoosts(null)).toEqual([]);
  });

  it("uses the biggest that applies, a category covers its channels, and ×0 always wins", () => {
    const boosts = [
      { kind: "role" as const, id: ROLE, multiplier: 1.5 },
      { kind: "channel" as const, id: CATEGORY, multiplier: 2 },
      { kind: "channel" as const, id: CHANNEL, multiplier: 0 },
    ];
    expect(boostFor(boosts, { roleIds: [], channelId: "9", parentId: null })).toBe(1);
    expect(boostFor(boosts, { roleIds: [ROLE], channelId: "9", parentId: null })).toBe(1.5);
    expect(boostFor(boosts, { roleIds: [ROLE], channelId: "9", parentId: CATEGORY })).toBe(2);
    expect(boostFor(boosts, { roleIds: [ROLE], channelId: CHANNEL, parentId: CATEGORY })).toBe(0);
  });
});
