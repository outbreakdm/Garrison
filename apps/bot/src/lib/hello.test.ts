import { ChannelType, Collection, type Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import { helloChannel } from "./hello.js";

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
