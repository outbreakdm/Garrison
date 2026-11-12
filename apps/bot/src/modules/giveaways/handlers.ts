import { ActionRowBuilder, type ButtonBuilder, MessageFlags } from "discord.js";
import type { ButtonHandler } from "../../commands/types.js";
import { cardContainer } from "../../lib/card.js";
import { GIVEAWAY_PREFIX, parseGiveawayId, pressGiveaway } from "./service.js";

/** Enter and Leave. Answers are private, with a Leave button after entering. */
export const giveawayButtons: ButtonHandler = {
  prefix: GIVEAWAY_PREFIX,
  async execute(interaction, ctx) {
    const press = parseGiveawayId(interaction.customId);
    if (!press) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { card, leave } = await pressGiveaway(ctx, interaction.member, press);
    await interaction.editReply({
      components: [
        cardContainer(card),
        ...(leave ? [new ActionRowBuilder<ButtonBuilder>().addComponents(leave)] : []),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
