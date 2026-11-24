import { PermissionFlagsBits as P, type VoiceChannel } from "discord.js";
import { describe, expect, it } from "vitest";
import { cardMessage, cardTexts } from "../../lib/card.js";
import { roomPanel, roomState } from "./controls.js";

/** A stand-in voice room: only what the panel reads. */
function room(over: { deny?: bigint[]; limit?: number } = {}) {
  const deny = new Set(over.deny ?? []);
  return {
    id: "700000000000000001",
    guild: { id: "700000000000000000" },
    userLimit: over.limit ?? 0,
    permissionOverwrites: {
      cache: new Map([["700000000000000000", { deny: { has: (bit: bigint) => deny.has(bit) } }]]),
    },
  } as unknown as VoiceChannel;
}

describe("voice room controls", () => {
  it("shows the owner, the state and every control", () => {
    const texts = cardTexts(cardMessage(roomPanel(room({ limit: 5 }), "42"))).join("\n");
    expect(texts).toContain("Owned by <@42>");
    expect(texts).toContain("Open to everyone");
    expect(texts).toContain("Limit: 5 people");
    for (const label of ["Rename", "Limit", "Lock", "Hide", "Remove someone", "Hand over"])
      expect(texts).toContain(`[${label}]`);
  });

  it("reads locked and hidden from the room, and offers the way back", () => {
    expect(roomState(room({ deny: [P.Connect] }))).toEqual({ locked: true, hidden: false });
    const locked = cardTexts(cardMessage(roomPanel(room({ deny: [P.Connect] }), "42"))).join("\n");
    expect(locked).toContain("Locked");
    expect(locked).toContain("[Unlock]");
    const hidden = cardTexts(
      cardMessage(roomPanel(room({ deny: [P.ViewChannel, P.Connect] }), "42")),
    ).join("\n");
    expect(hidden).toContain("Hidden");
    expect(hidden).toContain("[Show]");
  });
});
