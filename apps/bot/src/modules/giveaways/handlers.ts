import { getGiveaway, hasEntered } from "@garrison/db";
import { type ButtonBuilder, type ButtonInteraction, MessageFlags } from "discord.js";
import type { ButtonHandler, ModalHandler } from "../../commands/types.js";
import { type Card, cardContainer, cardReply } from "../../lib/card.js";
import {
  entryBlock,
  GIVEAWAY_FORM_PREFIX,
  GIVEAWAY_PREFIX,
  giveawayForm,
  parseGiveawayId,
  pressGiveaway,
} from "./service.js";

/** The private answer to Enter or Leave, with a Leave button inside the card after entering. */
const answerWith = (result: { card: Card; leave?: ButtonBuilder }) => ({
  components: [
    cardContainer(
      result.leave
        ? { ...result.card, actions: [...(result.card.actions ?? []), result.leave] }
        : result.card,
    ),
  ],
  flags: MessageFlags.IsComponentsV2 as const,
  allowedMentions: { parse: [] as [] },
});

/**
 * Enter and Leave. A giveaway that asks a question opens its form on Enter (the rules checked
 * first, so nobody answers for nothing); submitting the form enters. Answers are private.
 */
export const giveawayButtons: ButtonHandler = {
  prefix: GIVEAWAY_PREFIX,
  async execute(interaction: ButtonInteraction<"cached">, ctx) {
    const press = parseGiveawayId(interaction.customId);
    if (!press) return;
    if (press.kind === "enter") {
      const g = await getGiveaway(ctx.db, interaction.guildId, press.id);
      if (g?.question && !(await hasEntered(ctx.db, g.id, interaction.user.id))) {
        const blocked = await entryBlock(ctx, interaction.member, g);
        if (blocked) {
          await interaction.reply(cardReply(blocked));
          return;
        }
        await interaction.showModal(giveawayForm(g));
        return;
      }
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(answerWith(await pressGiveaway(ctx, interaction.member, press)));
  },
};

/** The giveaway's question came back: enter with the answer. */
export const giveawayForms: ModalHandler = {
  prefix: GIVEAWAY_FORM_PREFIX,
  async execute(interaction, ctx) {
    const id = interaction.customId.split(":")[1] ?? "";
    let answer = "";
    try {
      answer = interaction.fields.getTextInputValue("answer");
    } catch {}
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(
      answerWith(await pressGiveaway(ctx, interaction.member, { kind: "enter", id }, answer)),
    );
  },
};
