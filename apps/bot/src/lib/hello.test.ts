import { ChannelType, Collection, type Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import { cardMessage, cardTexts } from "./card.js";
import { helloCard, helloChannel } from "./hello.js";

const channel = (id: string, position: number, canPost: boolean, type = ChannelType.GuildText) => ({
  id,
  type,
  rawPosition: position,
  permissionsFor: () => ({ has: () => canPost }),
});

function guild(opts: {
  system?: ReturnType<typeof channel> | null;
  channels: ReturnType<typeof channel>[];
}) {
  return {
    members: { me: { id: "bot" } },
    systemChannel: opts.system ?? null,
    channels: { cache: new Collection(opts.channels.map((c) => [c.id, c])) },
  } as unknown as Guild;
}

describe("where Garrison says hello", () => {
  it("prefers the system channel when it can post there", () => {
    const system = channel("sys", 5, true);
    expect(helloChannel(guild({ system, channels: [channel("a", 0, true), system] }))?.id).toBe(
      "sys",
    );
  });

  it("else the highest text channel it can post in, skipping voice and locked ones", () => {
    const g = guild({
      system: channel("sys", 0, false),
      channels: [
        channel("voice", 0, true, ChannelType.GuildVoice),
        channel("locked", 1, false),
        channel("general", 3, true),
        channel("rules", 2, true),
      ],
    });
    expect(helloChannel(g)?.id).toBe("rules");
  });

  it("says nothing when it can post nowhere", () => {
    expect(helloChannel(guild({ channels: [channel("locked", 0, false)] }))).toBeNull();
  });
});

describe("the starting guide", () => {
  const links = (payload: ReturnType<typeof cardMessage>) =>
    JSON.stringify(payload.components.map((c) => c.toJSON())).match(/https:[^"]+/g) ?? [];

  it("puts the setup steps in order, each with a button to the page that does it", () => {
    const payload = cardMessage(helloCard("123", "https://dash.example.com/"));
    const all = cardTexts(payload).join("\n");
    const order = [
      "1. Turn on protection",
      "2. Pick a staff log channel",
      "3. Welcome new members",
      "4. Build the rest with AI",
    ];
    const at = order.map((step) => all.indexOf(step));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(links(payload)).toEqual(
      expect.arrayContaining([
        "https://dash.example.com/servers/123#setup",
        "https://dash.example.com/servers/123/watch",
        "https://dash.example.com/servers/123/herald",
        "https://dash.example.com/servers/123/quartermaster",
        "https://dash.example.com/servers/123",
      ]),
    );
    expect(all).toContain("Made for your community");
    expect(all).toContain("[Support server]");
  });

  it("keeps the steps without a dashboard, minus their buttons", () => {
    const payload = cardMessage(helloCard("123", undefined));
    const all = cardTexts(payload).join("\n");
    expect(all).toContain("1. Turn on protection");
    expect(all).not.toContain("[Protect]");
    expect(links(payload).every((url) => url.startsWith("https://discord.gg/"))).toBe(true);
  });
});
