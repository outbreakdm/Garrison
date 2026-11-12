import type { VoiceState } from "discord.js";
import { describe, expect, it } from "vitest";
import { earningVoice } from "./voice.js";

const state = (
  id: string,
  channelId: string | null,
  over: { bot?: boolean; selfDeaf?: boolean; serverDeaf?: boolean } = {},
) =>
  ({
    id,
    channelId,
    selfDeaf: over.selfDeaf ?? false,
    serverDeaf: over.serverDeaf ?? false,
    member: { id, user: { bot: over.bot ?? false } },
  }) as unknown as VoiceState;

const ids = (list: VoiceState[]) => list.map((s) => s.id).sort();

describe("voice XP", () => {
  it("needs someone else there who is listening", () => {
    expect(ids(earningVoice([state("a", "v1")], null))).toEqual([]);
    expect(ids(earningVoice([state("a", "v1"), state("b", "v1")], null))).toEqual(["a", "b"]);
    // A bot or a deafened member doesn't count as company, and earns nothing.
    expect(ids(earningVoice([state("a", "v1"), state("bot", "v1", { bot: true })], null))).toEqual(
      [],
    );
    expect(
      ids(
        earningVoice(
          [state("a", "v1"), state("b", "v1"), state("c", "v1", { selfDeaf: true })],
          null,
        ),
      ),
    ).toEqual(["a", "b"]);
  });

  it("gives nothing in the AFK channel or across different channels", () => {
    expect(ids(earningVoice([state("a", "afk"), state("b", "afk")], "afk"))).toEqual([]);
    expect(ids(earningVoice([state("a", "v1"), state("b", "v2")], null))).toEqual([]);
  });
});
