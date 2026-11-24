import { describe, expect, it } from "vitest";
import { aloneMessage, takeSlot, WELCOMES_PER_MINUTE } from "./service.js";

describe("the welcome image on its own", () => {
  const member = { id: "990000000000000009", displayName: "Rook" };
  const png = Buffer.from([1, 2, 3]);

  it("is the image alone, with only the new member mentioned above it", () => {
    const m = aloneMessage(png, true, member);
    expect(m.content).toBe(`<@${member.id}>`);
    expect(m.allowedMentions).toEqual({ users: [member.id] });
    expect(m.files).toHaveLength(1);
    expect(m).not.toHaveProperty("components");
  });

  it("pings no one when the server turned the mention off", () => {
    const m = aloneMessage(png, false, member);
    expect(m).not.toHaveProperty("content");
    expect(m.allowedMentions).toEqual({ users: [] });
  });
});

describe("welcome rate limit", () => {
  it("allows a burst, then waits a minute", () => {
    const g = "990000000000000001";
    for (let i = 0; i < WELCOMES_PER_MINUTE; i++) expect(takeSlot(g, 1000 + i)).toBe(true);
    expect(takeSlot(g, 2000)).toBe(false);
    expect(takeSlot(g, 62_000)).toBe(true);
  });
});
