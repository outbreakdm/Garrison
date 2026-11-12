import { describe, expect, it } from "vitest";
import {
  type AlertFeed,
  alertLook,
  checkAlertFeeds,
  fillAlert,
  normalizeHandle,
  readAlertFeeds,
} from "./alerts";
import { entitlements } from "./plans";

const free = entitlements("free");
const pro = entitlements("pro");
const feed = (over: Partial<AlertFeed> = {}): AlertFeed => ({
  id: "feed000001",
  provider: "twitch",
  handle: "shroud",
  channelId: "300000000000000001",
  roleId: null,
  message: null,
  accent: null,
  ...over,
});

describe("alert rules", () => {
  it("reads channels from names and links", () => {
    expect(normalizeHandle("twitch", "https://www.twitch.tv/Shroud/videos")).toBe("shroud");
    expect(normalizeHandle("twitch", "Shroud")).toBe("shroud");
    expect(normalizeHandle("twitch", "https://youtube.com/@x")).toBeNull();
    expect(normalizeHandle("twitch", "no spaces")).toBeNull();
    expect(normalizeHandle("youtube", "https://www.youtube.com/@IronVanguard")).toBe(
      "@IronVanguard",
    );
    expect(normalizeHandle("youtube", "IronVanguard")).toBe("@IronVanguard");
    expect(normalizeHandle("youtube", "https://youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      "UCaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(normalizeHandle("youtube", "https://evil.example/@x")).toBeNull();
  });

  it("holds Free to 3 alerts with the standard look", () => {
    const three = ["a", "b", "c"].map((x) => feed({ id: `feed00000${x}`, handle: `streamer${x}` }));
    expect(checkAlertFeeds(three, free).ok).toBe(true);
    expect(checkAlertFeeds([...three, feed({ id: "feed00000d", handle: "d1234" })], free).ok).toBe(
      false,
    );
    expect(checkAlertFeeds([feed({ message: "{name} is live" })], free).ok).toBe(false);
    expect(checkAlertFeeds([feed({ message: "{name} is live" })], pro).ok).toBe(true);
    // Saved on Pro, kept on Free, drawn with the standard words meanwhile.
    const saved = [feed({ message: "{name} is live", accent: "#5ab0ff" })];
    expect(checkAlertFeeds(saved, free, saved).ok).toBe(true);
    expect(alertLook(saved[0] as AlertFeed, free)).toEqual({
      text: "**{title}**\nPlaying {game}",
      accent: "#d4ff3a",
    });
  });

  it("refuses the same channel twice in one place, and bad IDs", () => {
    expect(checkAlertFeeds([feed(), feed({ id: "feed000002", handle: "SHROUD" })], pro).ok).toBe(
      false,
    );
    expect(checkAlertFeeds([feed({ roleId: "everyone" })], pro).ok).toBe(false);
    expect(readAlertFeeds([feed(), { id: "x" }])).toHaveLength(1);
  });

  it("fills placeholders, cleaning what came from the provider", () => {
    const out = fillAlert(
      "{name}: {title} {url}",
      { name: "a_b", title: "*x*", game: "", url: "https://t.tv/a_b" },
      (s) => s.replace(/[*_]/g, (c) => `\\${c}`),
    );
    expect(out).toBe("a\\_b: \\*x\\* https://t.tv/a_b");
  });
});
