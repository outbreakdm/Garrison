import { DEFAULT_ECONOMY, type Purchase, type ShopItem } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { shopForm, shopPanelMessage } from "./panel.js";
import { purchaseCard } from "./service.js";

const item = (over: Partial<ShopItem> = {}): ShopItem => ({
  id: "item0001",
  name: "VIP",
  description: null,
  emoji: null,
  price: 500,
  kind: "role",
  roleId: "360000000000000001",
  hours: null,
  stock: null,
  perMember: null,
  needsRoleId: null,
  question: null,
  ...over,
});
const config = { ...DEFAULT_ECONOMY, enabled: true };
const noWords = { shopPanelTitle: null, shopPanelBody: null };

type Json = { type?: number; options?: { value: string; description?: string }[] };
const menuOf = (payload: ReturnType<typeof shopPanelMessage>) => {
  const found: Json[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as Json & { components?: unknown[] };
    if (node.type === 3) found.push(node);
    for (const c of node.components ?? []) walk(c);
  };
  for (const c of payload.components) walk(c.toJSON());
  return found[0];
};

describe("the shop panel", () => {
  it("lists the shop with what's left, and sells only what's in stock", () => {
    const color = item({
      id: "item0002",
      name: "Custom color",
      kind: "staff",
      roleId: null,
      stock: 3,
      question: "Which color?",
    });
    const gone = item({ id: "item0003", name: "Shout-out", kind: "staff", roleId: null, stock: 1 });
    const panel = shopPanelMessage(
      config,
      noWords,
      [item(), color, gone],
      new Map([
        ["item0002", 1],
        ["item0003", 1],
      ]),
    );
    const texts = cardTexts(panel).join("\n");
    expect(texts).toContain("Shop");
    expect(texts).toContain("**Custom color** · 🪙 500 Coins · handed over by staff · 2 left");
    expect(texts).toContain("**Shout-out**");
    expect(texts).toContain("sold out");
    const menu = menuOf(panel);
    expect(menu?.options?.map((o) => o.value)).toEqual(["item0001", "item0002"]);
    expect(menu?.options?.[1]?.description).toContain("asks you something");
  });

  it("has no dropdown when there's nothing to sell", () => {
    expect(menuOf(shopPanelMessage(config, noWords, [], new Map()))).toBeUndefined();
  });

  it("asks an item's question in Discord's form", () => {
    const form = shopForm(item({ kind: "staff", roleId: null, question: "Which color?" })).toJSON();
    expect(form.custom_id).toBe("shopform:item0001");
    expect(JSON.stringify(form)).toContain("Which color?");
  });

  it("shows staff what the member answered", () => {
    const p = {
      id: "00000000-0000-4000-8000-000000000001",
      guildId: "1",
      userId: "42",
      username: "kel",
      itemId: "item0002",
      itemName: "Custom color",
      price: 500,
      kind: "staff",
      roleId: null,
      expiresAt: null,
      status: "waiting",
      decidedBy: null,
      channelId: null,
      messageId: null,
      answers: [{ label: "Which color?", value: "Teal" }],
      createdAt: new Date(),
    } satisfies Purchase;
    expect(cardTexts(purchaseCard(p, config)).join("\n")).toContain("**Which color?**\nTeal");
  });
});
