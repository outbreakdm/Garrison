import { describe, expect, it } from "vitest";
import { roleProblem } from "./commands.js";
import { messagesToClear } from "./service.js";

const H = 3_600_000;
const now = 100 * 86_400_000;
const msg = (id: string, ageMs: number, pinned = false) => ({
  id,
  createdTimestamp: now - ageMs,
  pinned,
});

describe("utilities", () => {
  it("clears what's old enough, keeps pins, and deletes the very old one at a time", () => {
    const out = messagesToClear(
      [
        msg("new", 1 * H),
        msg("old", 30 * H),
        msg("pin", 30 * H, true),
        msg("ancient", 20 * 24 * H),
      ],
      { hours: 24, keepPinned: true },
      now,
    );
    expect(out).toEqual({ bulk: ["old"], single: ["ancient"] });
    expect(
      messagesToClear([msg("pin", 30 * H, true)], { hours: 24, keepPinned: false }, now).bulk,
    ).toEqual(["pin"]);
  });

  it("lets staff give only roles below their own, unless they own the server", () => {
    const by = (position: number, id = "mod") => ({ id, roles: { highest: { position } } });
    const role = { id: "r", position: 5 };
    expect(roleProblem(role, by(6), "owner", true)).toBeNull();
    expect(roleProblem(role, by(5), "owner", true)).toMatch(/as high as yours/);
    expect(roleProblem(role, by(1, "owner"), "owner", true)).toBeNull();
    expect(roleProblem(role, by(9), "owner", false)).toMatch(/moderation powers/);
  });
});
