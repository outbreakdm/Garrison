import { embedColors } from "@garrison/brand";
import { blankCard, type CustomCard, entitlements } from "@garrison/db";
import { ButtonBuilder, ButtonStyle, MessageFlags, MessageFlagsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  type Card,
  cardEdit,
  cardMessage,
  cardReply,
  cardTexts,
  customCardMessage,
  legacyMessage,
  patchButton,
} from "./card.js";

const button = (id: string, label: string) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);

const card: Card = {
  tone: "caution",
  title: "Timeout applied to kel for 1 h",
  status: "Active",
  lead: "<@1> · in <#2>",
  blocks: [
    { text: "**Reason:** Spam", button: button("watch:undo:1", "Undo") },
    "divider",
    { text: "More" },
  ],
  facts: [
    { label: "Member", value: "<@1>" },
    { label: "Empty", value: "" },
  ],
  actions: Array.from({ length: 6 }, (_, i) => button(`a:${i}`, `A${i}`)),
  module: "watch",
  ref: "case #1",
  at: new Date("2026-11-06T14:02:00Z"),
};

type Node = { type: number; accent_color?: number; components?: Node[]; accessory?: Node };
const top = (payload: { components: { toJSON(): unknown }[] }) =>
  payload.components[0]?.toJSON() as Node;

describe("cardMessage (Components V2)", () => {
  it("is a V2 message that never pings", () => {
    const m = cardMessage(card);
    expect(m.flags).toBe(MessageFlags.IsComponentsV2);
    expect(m.allowedMentions).toEqual({ parse: [] });
  });

  it("draws the tone as the container's color bar", () => {
    const root = top(cardMessage(card));
    expect(root.type).toBe(17);
    expect(root.accent_color).toBe(embedColors.caution);
  });

  it("leads with a heading, then the status in bold and the lead line", () => {
    expect(cardTexts(cardMessage(card))[0]).toBe(
      "### Timeout applied to kel for 1 h\n**Active** · <@1> · in <#2>",
    );
  });

  it("puts a block's button beside it, facts as lines, and a gray footer last", () => {
    const texts = cardTexts(cardMessage(card));
    expect(texts[1]).toBe("**Reason:** Spam");
    expect(texts[2]).toBe("[Undo]");
    expect(texts).toContain("**Member:** <@1>");
    expect(texts.join("\n")).not.toContain("Empty");
    expect(texts.at(-1)).toMatch(/^-# Watch · case #1 · <t:\d+:f>$/);
  });

  it("wraps actions five to a row", () => {
    const rows = (top(cardMessage(card)).components ?? []).filter((c) => c.type === 1);
    expect(rows.map((r) => r.components?.length)).toEqual([5, 1]);
  });

  it("keeps log posts compact: a bold title and no rules", () => {
    const root = top(cardMessage({ title: "Joined", lead: "kel joined", compact: true }));
    expect(cardTexts(cardMessage({ title: "Joined", compact: true }))[0]).toBe("**Joined**");
    expect(root.components?.some((c) => c.type === 14)).toBe(false);
  });

  it("keeps all text inside Discord's 4000 characters", () => {
    const long = cardMessage({ title: "Long", blocks: [{ text: "x".repeat(5000) }] });
    expect(cardTexts(long).join("").length).toBeLessThanOrEqual(4000);
  });

  it("makes interaction replies ephemeral unless asked otherwise", () => {
    expect(cardReply(card).flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(cardReply(card, { ephemeral: false }).flags).toBe(MessageFlags.IsComponentsV2);
  });
});

describe("legacy embeds, for messages posted before V2", () => {
  it("folds the status into the title and facts into fields", () => {
    const m = legacyMessage(card);
    const json = m.embeds[0]?.toJSON();
    expect(json?.title).toBe("Timeout applied to kel for 1 h · Active");
    expect(json?.fields?.map((f) => f.name)).toEqual(["Member"]);
    expect(json?.footer?.text).toBe("Watch · case #1");
    expect(m.content).toBe("");
    expect(m.components.map((r) => r.toJSON().components.length)).toEqual([5, 2]);
  });

  it("edits a message in the format it already has", () => {
    const v2 = { flags: new MessageFlagsBitField(MessageFlags.IsComponentsV2) };
    const old = { flags: new MessageFlagsBitField(0) };
    expect("embeds" in cardEdit(old, card)).toBe(true);
    expect((cardEdit(v2, card) as { flags?: number }).flags).toBe(MessageFlags.IsComponentsV2);
  });
});

describe("patchButton", () => {
  it("changes one button in place, in either format", () => {
    const v2 = cardMessage(card);
    const message = {
      flags: new MessageFlagsBitField(MessageFlags.IsComponentsV2),
      components: v2.components as never,
    };
    const patched = patchButton(message, "watch:undo:1", { label: "Undone", disabled: true });
    const texts = cardTexts({ components: patched.components.map((c) => ({ toJSON: () => c })) });
    expect(texts).toContain("[Undone]");
    expect(texts).toContain("[A0]");

    const old = legacyMessage(card);
    const legacy = patchButton(
      { flags: new MessageFlagsBitField(0), components: old.components as never },
      "a:5",
      { disabled: true },
    );
    expect("flags" in legacy).toBe(false);
    const buttons = (
      legacy.components as unknown as { components: { custom_id: string; disabled?: boolean }[] }[]
    ).flatMap((row) => row.components);
    expect(buttons.find((b) => b.custom_id === "a:5")?.disabled).toBe(true);
    expect(buttons.find((b) => b.custom_id === "a:4")?.disabled).toBeUndefined();
  });
});

describe("customCardMessage (cards designed on the dashboard)", () => {
  const designed: CustomCard = {
    ...blankCard("Welcome"),
    blocks: [{ kind: "text", text: "Hi" }, { kind: "divider" }, { kind: "text", text: "Rules" }],
    accent: "#ff0000",
    thumbnail: "https://cdn.discordapp.com/t.png",
    image: "https://cdn.discordapp.com/i.png",
    footer: "",
  };
  const kinds = (n: Node): number[] => [
    n.type,
    ...(n.components ?? []).flatMap(kinds),
    ...(n.accessory ? kinds(n.accessory) : []),
  ];

  it("draws the Pro look on Pro: color, thumbnail, banner, no footer", () => {
    const m = customCardMessage(designed, entitlements("pro"));
    expect(m.flags).toBe(MessageFlags.IsComponentsV2);
    expect(top(m).accent_color).toBe(0xff0000);
    expect(kinds(top(m))).toEqual(expect.arrayContaining([9, 11, 12]));
    expect(cardTexts(m)).toEqual(["### Welcome", "Hi", "Rules"]);
  });

  it("falls back to the standard look on Free, keeping the text", () => {
    const m = customCardMessage(designed, entitlements("free"));
    expect(top(m).accent_color).toBe(embedColors.volt);
    expect(kinds(top(m))).not.toContain(11);
    expect(kinds(top(m))).not.toContain(12);
    expect(cardTexts(m)).toEqual(["### Welcome", "Hi", "Rules", "-# Garrison"]);
  });
});
