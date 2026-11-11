import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { cardMessage } from "../../../lib/card.js";
import { purgeCard } from "../embeds.js";
import { purgeMessages } from "../purge.js";
import { ephemeral, REASON_MAX, watchCommand } from "./shared.js";

export const purge: Command = {
  data: watchCommand(
    "purge",
    "Bulk-delete recent messages in this channel.",
    PermissionFlagsBits.ManageMessages,
  )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How many messages, 1 to 100")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user"))
    .addStringOption((o) =>
      o.setName("reason").setDescription("Shown in the log").setMaxLength(REASON_MAX),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const channel = interaction.channel;

    if (!channel || !("bulkDelete" in channel)) {
      await interaction.reply({
        content: "I can only purge text channels and threads.",
        ...ephemeral,
      });
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await purgeMessages(
      ctx,
      interaction.guild,
      channel,
      { id: interaction.user.id, tag: interaction.user.username },
      { amount, user, reason },
    );
    if (!result.ok) {
      await interaction.editReply(result.error);
      return;
    }
    const created = result.case;
    const count = result.deleted;

    await interaction.editReply(
      cardMessage(purgeCard(created, { requested: amount, deleted: count, channelId: channel.id })),
    );
  },
};
