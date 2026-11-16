import { describe, expect, it } from "vitest";
import { blankCard } from "./cards";
import { checkMessages, MESSAGE_LIMITS, parseDiscordLink, readMessages } from "./messages";
import { entitlements } from "./plans";

const G = "340000000000000001";
const C = "340000000000000002";
const M = "340000000000000003";
const TAG = "340000000000000004";
const free = entitlements("free");

const message = (over: Record<string, unknown> = {}) => ({
  id: "msg001",
  name: "Clip of the week",
  card: blankCard("Clip of the week"),
  buttons: [],
  channelId: C,
  schedule: null,
  ...over,
});

describe("message links", () => {
  it("reads Discord's channel, thread and message links, and bare IDs", () => {
    expect(parseDiscordLink(`https://discord.com/channels/${G}/${C}/${M}`)).toEqual({
      guildId: G,
      channelId: C,
      messageId: M,
    });
    expect(parseDiscordLink(`https://ptb.discord.com/channels/${G}/${C}`)).toEqual({
      guildId: G,
      channelId: C,
      messageId: null,
    });
    expect(parseDiscordLink(`  ${C}  `)).toEqual({ guildId: null, channelId: C, messageId: null });
  });

  it("refuses anything else", () => {
    for (const bad of [
      "",
      "hello",
      `https://evil.example/channels/${G}/${C}`,
      `https://discord.com/channels/@me/${C}`,
      `http://discord.com/channels/${G}/${C}`,
      `https://discord.com/channels/${G}/${C}/${M}/extra`,
    ])
      expect(parseDiscordLink(bad), bad).toBeNull();
  });
});

describe("forum posts", () => {
  it("keeps a forum post's title and tags", () => {
    const [m] = readMessages([message({ forumPost: { title: " Week 12 ", tagIds: [TAG, TAG] } })]);
    expect(m?.forumPost).toEqual({ title: "Week 12", tagIds: [TAG] });
  });

  it("needs a title within Discord's limit, and at most five tags", () => {
    expect(checkMessages([message({ forumPost: { title: "", tagIds: [] } })], free).ok).toBe(false);
    expect(
      checkMessages(
        [message({ forumPost: { title: "x".repeat(MESSAGE_LIMITS.postTitle + 1), tagIds: [] } })],
        free,
      ).ok,
    ).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => `34000000000000001${i}`);
    expect(checkMessages([message({ forumPost: { title: "Ok", tagIds: six } })], free).ok).toBe(
      false,
    );
  });

  it("reads messages saved before forum posts existed", () => {
    expect(readMessages([message()])[0]?.forumPost).toBeNull();
  });
});
