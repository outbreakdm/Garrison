import type { ButtonHandler } from "../../../commands/types.js";
import { failed } from "../../../lib/embeds.js";
import { caseEmbed, caseRow, UNDO_PREFIX } from "../embeds.js";
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
      await interaction.followUp({ ...failed(result.error), ...ephemeral });
      return;
    }
    await interaction.editReply({
      embeds: [caseEmbed(result.case, "done")],
      components: [caseRow(result.case, { undone: true })].filter((r) => r !== null),
    });
  },
};
