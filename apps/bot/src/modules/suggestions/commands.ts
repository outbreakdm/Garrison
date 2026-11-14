import { SUGGESTION_LIMITS } from "@garrison/db";
import { MessageFlags } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command } from "../../commands/types.js";
import { cardEdit, cardReply } from "../../lib/card.js";
import {
  doSuggest,
  parseSuggestionId,
  pressVote,
  SUGGESTION_PREFIX,
  suggestionCard,
} from "./service.js";

/** /suggest: any member posts an idea to the server's suggestions channel. */
export const suggest: Command = {
  data: guildCommand("suggest", "Suggest an idea for this server.", null)
    .addStringOption((o) =>
      o
        .setName("idea")
        .setDescription("What you'd like to see")
        .setRequired(true)
        .setMaxLength(SUGGESTION_LIMITS.text),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    await interaction.deferReply(ephemeral);
    const outcome = await doSuggest(
      ctx,
      interaction.guild,
      interaction.member,
      interaction.options.getString("idea", true),
    );
    await interaction.editReply(
      cardReply({
        tone: outcome.ok ? "go" : "caution",
        title: outcome.ok ? "Suggestion posted" : "Not posted",
        blocks: [
          {
            text: outcome.ok && outcome.url ? `${outcome.message} ${outcome.url}` : outcome.message,
          },
        ],
        module: "forum",
      }),
    );
  },
};

/** For and Against: the card updates in place; a vote that can't count is answered privately. */
export const suggestionButtons: ButtonHandler = {
  prefix: SUGGESTION_PREFIX,
  async execute(interaction, ctx) {
    const press = parseSuggestionId(interaction.customId);
    if (!press) return;
    const result = await pressVote(ctx, interaction.guild.id, interaction.user.id, press);
    if (!result.ok) {
      await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update(cardEdit(interaction.message, suggestionCard(result.suggestion)));
  },
};
