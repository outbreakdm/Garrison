import { describe, expect, it } from "vitest";
import { findScamLink, linkHosts, registrable, scamHost } from "./scam-links";

describe("scam and phishing links", () => {
  it("leaves official and ordinary links alone", () => {
    for (const host of [
      "discord.com",
      "discord.gg",
      "discord.gift",
      "cdn.discordapp.com",
      "steamcommunity.com",
      "store.steampowered.com",
      "www.twitch.tv",
      "discord.js.org",
      "discordbotlist.com",
      "top.gg",
      "youtube.com",
      "github.com",
      "roblox.com",
      "steamdb.info",
      "steamladder.com",
    ])
      expect(scamHost(host), host).toBeNull();
  });

  it("catches look-alikes", () => {
    for (const host of [
      "discorcl.gift",
      "dlscord.com",
      "dicsord.gift",
      "steamcomrnunity.com",
      "stearncommunity.com",
      "steamcommunlty.ru",
      "disc0rd.com",
      "rob1ox.com",
    ])
      expect(scamHost(host), host).not.toBeNull();
  });

  it("catches a brand plus bait in someone else's address", () => {
    for (const host of [
      "discord-nitro.com",
      "free-steam-gift.ru",
      "steam-trade.org",
      "discordgift.site",
    ])
      expect(scamHost(host), host).not.toBeNull();
  });

  it("catches an official address hidden at the front of another", () => {
    expect(scamHost("discord.com.gift-claim.xyz")).not.toBeNull();
    expect(scamHost("steamcommunity.com-login.ru")).not.toBeNull();
  });

  it("finds links however they're written", () => {
    expect(linkHosts("look [here](https://discorcl.gift/abc) and www.example.com/x")).toEqual([
      "discorcl.gift",
      "www.example.com",
    ]);
    expect(registrable("a.b.example.co.uk")).toBe("example.co.uk");
    expect(findScamLink("free nitro!! https://dlscord.com/airdrop @everyone")).toMatchObject({
      host: "dlscord.com",
    });
    expect(findScamLink("join us https://discord.gg/abc")).toBeNull();
    expect(findScamLink("no links here, just steam talk")).toBeNull();
  });
});
