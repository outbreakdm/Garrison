import { ephemeral } from "../../../commands/builders.js";
import type { ButtonHandler } from "../../../commands/types.js";
import { done, failed } from "../../../lib/embeds.js";
import { withRows } from "../../../lib/v2.js";
import { RESTORE_PREFIX, restoreQuarantine, restoreRow } from "../anti-nuke.js";

const UUID = /^[0-9a-f-]{36}$/;

/** Anyone can see the alert, so the owner/trusted check happens on every click. */
export const restoreButton: ButtonHandler = {
  prefix: RESTORE_PREFIX,
  async execute(interaction, ctx) {
    const id = interaction.customId.slice(RESTORE_PREFIX.length + 1);
    if (!UUID.test(id)) return;
    await interaction.deferReply(ephemeral);
    const result = await restoreQuarantine(ctx, interaction.guild, id, interaction.member);
    if (!result.ok) {
      await interaction.editReply(failed(result.error));
      return;
    }
    await interaction.message
      .edit(withRows(interaction.message, [restoreRow(result.quarantine, true)]))
      .catch(() => {});
    await interaction.editReply(
      done(
        `Restored ${result.restored} ${result.restored === 1 ? "role" : "roles"} to <@${result.quarantine.userId}>.`,
      ),
    );
  },
};
