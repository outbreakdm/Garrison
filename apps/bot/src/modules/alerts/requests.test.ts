import type { StreamRequest } from "@garrison/db";
import { readStreamRequests } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { streamForm, streamPanelMessage, streamRequestCard } from "./requests.js";

const row: StreamRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  guildId: "1",
  userId: "42",
  username: "kel",
  provider: "twitch",
  handle: "shroud",
  note: "Mostly Valorant @everyone",
  status: "waiting",
  decidedBy: null,
  decidedAt: null,
  channelId: null,
  messageId: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
};

describe("stream requests", () => {
  it("posts the panel with its button", () => {
    const texts = cardTexts(streamPanelMessage(readStreamRequests(null))).join("\n");
    expect(texts).toContain("Get your stream announced");
    expect(texts).toContain("[Add my stream]");
  });

  it("asks where, which channel and a note, the platform from a list", () => {
    const json = JSON.stringify(streamForm().toJSON());
    for (const part of ["provider", "handle", "note", "twitch", "kick", "youtube"])
      expect(json).toContain(part);
    expect(json).not.toContain("reddit");
  });

  it("shows staff the channel to look at first, then the decision", () => {
    const waiting = cardTexts(streamRequestCard(row)).join("\n");
    expect(waiting).toContain("<@42>");
    expect(waiting).toContain("https://twitch.tv/shroud");
    expect(waiting).not.toContain("@everyone");
    expect(waiting).toContain("[Add their alerts]");
    const added = cardTexts(
      streamRequestCard({ ...row, status: "approved", decidedBy: "rook" }),
    ).join("\n");
    expect(added).toContain("Added by rook");
    expect(added).not.toContain("[Decline]");
  });
});
