import type { ButtonHandler } from "../../../commands/types.js";
import { cardEdit } from "../../../lib/card.js";
import { caseCard, UNDO_PREFIX, undoButton as undoCaseButton } from "../embeds.js";
import { undoCase } from "../service.js";
import { ephemeral } from "./shared.js";

export const undoButton: ButtonHandler = {
  prefix: UNDO_PREFIX,
  async execute(interaction, ctx) {
    const caseNumber = Number(interaction.customId.slice(UNDO_PREFIX.length + 1));
    if (!Number.isInteger(caseNumber) || caseNumber < 1) return;

    await interaction.deferUpdate();
    const result = await undoCase(ctx, interaction.guild, caseNumber, interaction.member);
    if (!result.ok) {
      await interaction.followUp({ content: result.error, ...ephemeral });
      return;
    }
    // The confirmation may predate the switch to V2: edit it in its own format.
    await interaction.editReply(
      cardEdit(
        interaction.message,
        caseCard(result.case, { button: undoCaseButton(result.case, true) }),
      ),
    );
  },
};
