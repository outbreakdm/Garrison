import { getCase } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { cardReply } from "../../../lib/card.js";
import { canUndo } from "../copy.js";
import { caseCard, undoButton } from "../embeds.js";
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
        content: `There is no case #${number} in this server.`,
        ...ephemeral,
      });
      return;
    }
    await interaction.reply(
      cardReply(
        caseCard(c, { button: canUndo(c.action) && !c.revokedAt ? undoButton(c) : undefined }),
      ),
    );
  },
};
