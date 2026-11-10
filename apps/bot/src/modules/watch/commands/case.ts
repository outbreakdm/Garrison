import { getCase } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { failed } from "../../../lib/embeds.js";
import { caseEmbed, caseRow } from "../embeds.js";
import { ephemeral, watchCommand } from "./shared.js";

export const caseCommand: Command = {
  data: watchCommand(
    "case",
    "Look up a moderation case by number.",
    PermissionFlagsBits.ModerateMembers,
  )
    .addIntegerOption((o) =>
      o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const number = interaction.options.getInteger("number", true);
    const c = await getCase(ctx.db, interaction.guild.id, number);
    if (!c) {
      await interaction.reply({
        ...failed(`There is no case #${number} in this server.`),
        ...ephemeral,
      });
      return;
    }
    await interaction.reply({
      embeds: [caseEmbed(c)],
      components: [caseRow(c)].filter((r) => r !== null),
      ...ephemeral,
    });
  },
};
