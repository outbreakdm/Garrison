import type { LfgMember, LfgPost } from "@garrison/db";
import { describe, expect, it } from "vitest";
import type { Card, CardBlock } from "../../lib/card.js";
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
  templateId: null,
  wording: null,
  notifiedAt: null,
};
const member = (userId: string, slotName: string): LfgMember => ({
  postId: post.id,
  userId,
  slotName,
  joinedAt: new Date(),
  leftAt: null,
});

describe("lfgCard", () => {
  const groups = (card: Card) => (card.blocks ?? []).filter((b): b is CardBlock => b !== "divider");
  const buttonOf = (b: CardBlock) =>
    b.button ? (b.button.toJSON() as { label: string; disabled?: boolean }) : null;

  it("shows each role with who's in and open seats, its Join button beside it", () => {
    const card = lfgCard(post, [member("taz", "Tank"), member("ryn", "DPS")]);
    expect(card.title).toBe("Mythic+ 12 · Ara-Kara");
    expect(card.status).toBe("3 open");
    expect(card.ref).toBe("2/5");
    expect(card.module).toBe("rally");
    const blocks = groups(card);
    expect(blocks.map((b) => b.text)).toEqual([
      "**Tank** 1/1\n<@taz>",
      "**Healer** 0/1\n1 open",
      "**DPS** 1/3\n<@ryn> · 2 open",
    ]);
    expect(blocks.map((b) => [buttonOf(b)?.label, buttonOf(b)?.disabled ?? false])).toEqual([
      ["Join as Tank", true],
      ["Join as Healer", false],
      ["Join as DPS", false],
    ]);
  });

  it("says 1 left, Full, and drops buttons once closed", () => {
    const four = ["taz", "a", "b", "c"].map((u, i) =>
      member(u, ["Tank", "Healer", "DPS", "DPS"][i] ?? "DPS"),
    );
    expect(lfgCard(post, four).status).toBe("1 left");
    const full = lfgCard({ ...post, status: "full" }, [...four, member("d", "DPS")]);
    expect(full.status).toBe("Full");
    const closed = lfgCard({ ...post, status: "closed" }, four);
    expect(closed.actions).toBeUndefined();
    expect(groups(closed).some((b) => buttonOf(b))).toBe(false);
  });

  it("speaks the template's wording, and keeps it plain", () => {
    const fireteam = {
      ...post,
      slots: [{ name: "", count: 6 }],
      note: "1810",
      wording: {
        group: "fireteam",
        join: "Join as {role}",
        joinAny: "Join fireteam",
        leave: "Bail",
        close: "Disband",
        full: "Fireteam ready.",
        requirement: "Power",
        voice: false,
      },
    };
    const card = lfgCard(fireteam, [member("taz", "")]);
    const [group] = groups(card);
    expect(group?.text).toBe("**Fireteam** 1/6\n<@taz> · 5 open");
    expect(card.lead).toContain("Power: 1810");
    const labels = [
      ...groups(card).map((b) => buttonOf(b)?.label),
      ...(card.actions ?? []).map((b) => (b.toJSON() as { label: string }).label),
    ];
    expect(labels).toEqual(["Join fireteam", "Bail", "Disband"]);
  });
});
