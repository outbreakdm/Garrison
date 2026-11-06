import type { LfgMember, LfgPost } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { lfgCard, safeText } from "./card.js";

describe("safeText", () => {
  it("defuses masked links, markdown, headings and mentions", () => {
    expect(safeText("[Free Nitro](https://evil.example)")).not.toMatch(/^\[Free Nitro\]\(/);
    expect(safeText("[Free Nitro](https://evil.example)")).toContain("\\[");
    expect(safeText("**bold** # Heading")).toBe("\\*\\*bold\\*\\* # Heading");
    expect(safeText("# Big")).toBe("\\# Big");
    expect(safeText("@everyone @here")).not.toMatch(/@everyone|@here/);
    expect(safeText("<@123> <@&456> <#789>")).not.toMatch(/<@\d|<@&\d|<#\d/);
  });
});

const post: LfgPost = {
  id: "11111111-1111-1111-1111-111111111111",
  guildId: "g",
  channelId: "c",
  messageId: "m",
  hostId: "taz",
  title: "Mythic+ 12 · Ara-Kara",
  note: "io 2500+",
  slots: [
    { name: "Tank", count: 1 },
    { name: "Healer", count: 1 },
    { name: "DPS", count: 3 },
  ],
  startsAt: new Date(Date.now() + 600_000),
  expiresAt: new Date(Date.now() + 3_600_000),
  status: "open",
  voiceChannelId: null,
  createdAt: new Date(),
  closedAt: null,
};
const member = (userId: string, slotName: string): LfgMember => ({
  postId: post.id,
  userId,
  slotName,
  joinedAt: new Date(),
  leftAt: null,
});

describe("lfgCard", () => {
  it("shows slots by role and disables full roles", () => {
    const card = lfgCard(post, [member("taz", "Tank"), member("ryn", "DPS")]);
    const json = card.embeds[0]?.toJSON();
    expect(json?.title).toBe("Mythic+ 12 · Ara-Kara · Open");
    expect(json?.fields?.map((f) => f.name)).toEqual(["Tank · 1/1", "Healer · 0/1", "DPS · 1/3"]);
    expect(json?.footer?.text).toBe("Rally · 2/5");
    const joins = card.components[0]?.toJSON().components as {
      label: string;
      disabled?: boolean;
    }[];
    expect(joins.map((b) => [b.label, b.disabled ?? false])).toEqual([
      ["Join as Tank", true],
      ["Join as Healer", false],
      ["Join as DPS", false],
    ]);
  });

  it("says 1 left, Full, and drops buttons once closed", () => {
    const four = ["taz", "a", "b", "c"].map((u, i) =>
      member(u, ["Tank", "Healer", "DPS", "DPS"][i] ?? "DPS"),
    );
    expect(lfgCard(post, four).embeds[0]?.toJSON().title).toContain("1 left");
    const full = lfgCard({ ...post, status: "full" }, [...four, member("d", "DPS")]);
    expect(full.embeds[0]?.toJSON().title).toContain("Full");
    expect(lfgCard({ ...post, status: "closed" }, four).components).toEqual([]);
  });
});
