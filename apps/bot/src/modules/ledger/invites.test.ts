import { describe, expect, it } from "vitest";
import { usedInvite } from "./invites.js";

const uses = (entries: [string, number][]) =>
  new Map(
    entries.map(([code, n]) => [code, { uses: n, inviterId: `id-${code}`, inviterName: code }]),
  );

describe("which invite a member used", () => {
  it("finds the one invite whose count went up, including new ones", () => {
    expect(
      usedInvite(
        uses([
          ["a", 3],
          ["b", 1],
        ]),
        uses([
          ["a", 4],
          ["b", 1],
        ]),
      )?.code,
    ).toBe("a");
    expect(
      usedInvite(
        uses([["a", 3]]),
        uses([
          ["a", 3],
          ["new", 1],
        ]),
      )?.code,
    ).toBe("new");
  });

  it("gives up when it can't tell", () => {
    expect(
      usedInvite(
        uses([
          ["a", 3],
          ["b", 1],
        ]),
        uses([
          ["a", 4],
          ["b", 2],
        ]),
      ),
    ).toBeNull();
    expect(usedInvite(uses([["a", 3]]), uses([["a", 3]]))).toBeNull();
  });
});
