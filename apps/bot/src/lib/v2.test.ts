import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import { ephemeral } from "../commands/builders.js";
import { linkRow } from "./dashboard.js";
import { brandEmbed, done, failed } from "./embeds.js";
import { toV2, withRows } from "./v2.js";

const V2 = MessageFlags.IsComponentsV2;
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("every message in the layout components", () => {
  it("turns an embed into a card: heading, text, fields, small print, buttons inside", () => {
    const out = plain(
      toV2({
        embeds: [
          brandEmbed({
            kind: "danger",
            title: "Ban applied to kel",
            description: "**Reason:** spam",
            fields: [{ name: "Member", value: "<@1>", inline: true }],
            module: "watch",
            ref: "case #9",
          }),
        ],
        components: [linkRow("https://dash.example.org", "Open")],
      }),
    );
    expect(out.flags).toBe(V2);
    expect(out.embeds).toBeUndefined();
    expect(out.content).toBeUndefined();
    const [card] = out.components;
    expect(card).toMatchObject({ type: 17, accent_color: 0xff5c5c });
    expect(
      card.components.map((c: { type: number; content?: string }) => c.content ?? c.type),
    ).toEqual([
      "### Ban applied to kel",
      "**Reason:** spam",
      "**Member**\n<@1>",
      "-# Watch · case #9",
      1,
    ]);
  });

  it("keeps the three kinds: no accent, green, red", () => {
    const accent = (p: unknown) => plain(toV2(p)).components[0].accent_color;
    expect(accent({ embeds: [brandEmbed({ title: "Roster" })] })).toBeUndefined();
    expect(accent(done("Saved."))).toBe(0x2bd99f);
    expect(accent(failed("No."))).toBe(0xff5c5c);
  });

  it("keeps a private reply private", () => {
    expect(toV2({ ...failed("No."), ...ephemeral }).flags).toBe(MessageFlags.Ephemeral | V2);
  });

  it("puts ping mentions on their own line above the card, and they still ping", () => {
    const out = plain(
      toV2({
        content: "<@1> <@2>",
        embeds: [brandEmbed({ description: "Molten Core starts soon." })],
        allowedMentions: { users: ["1", "2"] },
      }),
    );
    expect(out.components[0]).toEqual({ type: 10, content: "<@1> <@2>" });
    expect(out.components[1].type).toBe(17);
    expect(out.allowedMentions).toEqual({ users: ["1", "2"] });
  });

  it("clears the old text and embeds when editing a message", () => {
    const out = toV2(done("Discarded."), { edit: true });
    expect(out).toMatchObject({ content: null, embeds: [] });
  });

  it("leaves a message that's already in the new layout alone", () => {
    const already = { components: [], flags: V2 };
    expect(toV2(already)).toEqual(already);
  });

  it("swaps a card's buttons without losing its text", () => {
    const message = {
      embeds: [],
      components: [
        {
          toJSON: () => ({
            type: 17,
            components: [
              { type: 10, content: "### Quarantined rogue" },
              { type: 1, components: [{ type: 2, label: "Restore roles" }] },
            ],
          }),
        },
      ],
    };
    const out = plain(
      withRows(message as never, [linkRow("https://dash.example.org", "Roles restored")]),
    );
    expect(out.flags).toBe(V2);
    expect(out.components[0].components[0].content).toBe("### Quarantined rogue");
    expect(out.components[0].components[1].components[0].label).toBe("Roles restored");
    expect(out.components[0].components).toHaveLength(2);
  });
});
