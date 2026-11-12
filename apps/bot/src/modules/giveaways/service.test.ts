import { entitlements, type Giveaway } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { giveawayMessage, parseGiveawayId } from "./service.js";

const ID = "0b5b3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const g = {
  id: ID,
  prize: "Nitro",
  description: null,
  winners: 2,
  endsAt: new Date("2026-11-13T12:00:00Z"),
  status: "running",
  hostId: "100000000000000001",
  requiredRoleId: "200000000000000001",
  minLevel: 5,
  bonusRoles: [{ roleId: "200000000000000002", extra: 2 }],
  accent: null,
  winnerIds: [],
} as unknown as Giveaway;

type Node = { type: number; custom_id?: string; components?: Node[] };
const all = (n: Node): Node[] => [n, ...(n.components ?? []).flatMap(all)];
const buttons = (m: { components: { toJSON(): unknown }[] }) =>
  all(m.components[0]?.toJSON() as Node).filter((n) => n.type === 2);

describe("giveaway cards", () => {
  it("shows the rules and an Enter button while running", () => {
    const m = giveawayMessage(g, 14, entitlements("pro"));
    const text = cardTexts(m).join("\n");
    expect(text).toContain("**Entries** 14");
    expect(text).toContain("<@&200000000000000001>");
    expect(text).toContain("level 5");
    expect(text).toContain("+2");
    expect(buttons(m).map((b) => b.custom_id)).toEqual([`gw:e:${ID}`]);
  });

  it("names the winners and drops the button once drawn", () => {
    const m = giveawayMessage(
      { ...g, status: "ended", winnerIds: ["100000000000000002"] },
      14,
      entitlements("free"),
    );
    expect(cardTexts(m).join("\n")).toContain("<@100000000000000002>");
    expect(buttons(m)).toEqual([]);
  });

  it("reads its custom IDs back, and nothing else", () => {
    expect(parseGiveawayId(`gw:e:${ID}`)).toEqual({ kind: "enter", id: ID });
    expect(parseGiveawayId(`gw:l:${ID}`)).toEqual({ kind: "leave", id: ID });
    expect(parseGiveawayId("gw:x:1")).toBeNull();
  });
});
