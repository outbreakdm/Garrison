import { getSuggestionSettings, SUGGESTION_LIMITS, suggestionQuestions } from "@garrison/db";
import { ButtonBuilder, ButtonStyle, type Interaction } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { BotContext, ButtonHandler, Command, ModalHandler } from "../../commands/types.js";
import { cardEdit, cardReply, notice } from "../../lib/card.js";
import {
  doSuggest,
  parseSuggestionId,
  pressVote,
  SUGGEST_FORM_PREFIX,
  SUGGEST_PANEL_PREFIX,
  SUGGESTION_PREFIX,
  submitSuggestion,
  suggestionCard,
  suggestionModal,
  suggestWait,
} from "./service.js";

/** What a member is told after suggesting, privately. */
const outcomeReply = (outcome: { ok: boolean; message: string; url?: string }) =>
  cardReply({
    tone: outcome.ok ? "go" : "caution",
    title: outcome.ok ? "Suggestion posted" : "Not posted",
    blocks: [{ text: outcome.message }],
    actions:
      outcome.ok && outcome.url
        ? [
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("View suggestion")
              .setURL(outcome.url),
          ]
        : [],
    module: "forum",
  });

/**
 * Open the suggestions form, or say privately why not (off, or too soon after the last one).
 * The form must be Discord's first answer to the press, so nothing is deferred before it.
 */
async function openForm(
  interaction: Extract<Interaction<"cached">, { showModal: unknown }>,
  ctx: BotContext,
) {
  const config = await getSuggestionSettings(ctx.db, interaction.guildId);
  const wait = suggestWait(interaction.guildId, interaction.user.id);
  const why = !config.enabled
    ? "Suggestions aren't on in this server right now."
    : wait > 0
      ? `One suggestion a minute. Try again in ${wait}s.`
      : null;
  if (why) {
    await interaction.reply(notice(why, "intel"));
    return;
  }
  await interaction.showModal(suggestionModal(config));
}

/** /suggest: with the idea typed in, it's posted at once; without, the server's form opens. */
export const suggest: Command = {
  data: guildCommand("suggest", "Suggest an idea for this server.", null)
    .addStringOption((o) =>
      o
        .setName("idea")
        .setDescription("What you'd like to see (leave it out to fill in the form)")
        .setRequired(false)
        .setMaxLength(SUGGESTION_LIMITS.text),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const idea = interaction.options.getString("idea");
    if (!idea?.trim()) {
      await openForm(interaction, ctx);
      return;
    }
    await interaction.deferReply(ephemeral);
    const outcome = await doSuggest(ctx, interaction.guild, interaction.member, idea);
    await interaction.editReply(outcomeReply(outcome));
  },
};

/** The panel's button: opens the form. */
export const suggestionPanelButtons: ButtonHandler = {
  prefix: SUGGEST_PANEL_PREFIX,
  async execute(interaction, ctx) {
    await openForm(interaction, ctx);
  },
};

/** The form came back: post the suggestion and answer privately. */
export const suggestionModals: ModalHandler = {
  prefix: SUGGEST_FORM_PREFIX,
  async execute(interaction, ctx) {
    const config = await getSuggestionSettings(ctx.db, interaction.guildId);
    const given: Record<string, string> = {};
    for (const q of suggestionQuestions(config)) {
      try {
        given[q.id] = interaction.fields.getTextInputValue(q.id);
      } catch {
        given[q.id] = "";
      }
    }
    await interaction.deferReply(ephemeral);
    const outcome = await submitSuggestion(ctx, interaction.guild, interaction.member, given);
    await interaction.editReply(outcomeReply(outcome));
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
      await interaction.reply(notice(result.message, "intel"));
      return;
    }
    await interaction.update(cardEdit(interaction.message, suggestionCard(result.suggestion)));
  },
};
