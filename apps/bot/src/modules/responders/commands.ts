import { findTag } from "@garrison/db";
import { guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { notice } from "../../lib/card.js";
import { serverResponders } from "./service.js";

/**
 * /tag: post one of the server's tags, the custom commands made on the Messages page.
 * Anyone can use it; the reply is the server's own words, and never pings.
 */
export const tag: Command = {
  data: guildCommand("tag", "Post one of this server's saved replies.", null)
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Which tag")
        .setRequired(true)
        .setAutocomplete(true)
        .setMaxLength(32),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const name = interaction.options.getString("name", true);
    const found = findTag(await serverResponders(ctx, interaction.guildId), name);
    if (!found) {
      await interaction.reply(
        notice(
          `This server has no tag called "${name.slice(0, 32)}". Staff add tags on the dashboard's Messages page.`,
          "intel",
        ),
      );
      return;
    }
    await interaction.reply({ content: found.reply, allowedMentions: { parse: [] } });
  },
  async autocomplete(interaction, ctx) {
    const q = interaction.options.getFocused().toLowerCase();
    const tags = (await serverResponders(ctx, interaction.guildId)).filter(
      (r) => r.trigger === "command",
    );
    await interaction.respond(
      tags
        .filter((r) => r.text.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((r) => ({ name: `${r.text} · ${r.name}`.slice(0, 100), value: r.text })),
    );
  },
};
