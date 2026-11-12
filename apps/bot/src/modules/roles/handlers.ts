import { MessageFlags } from "discord.js";
import type { ButtonHandler, SelectHandler } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { MENU_PREFIX, parseMenuId } from "./menu.js";
import { pickRoles } from "./service.js";

/** Role menu buttons and dropdowns. Both answer privately, with what changed. */

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

export const roleMenuButtons: ButtonHandler = {
  prefix: MENU_PREFIX,
  async execute(interaction, ctx) {
    const id = parseMenuId(interaction.customId);
    if (!id?.roleId) return;
    await interaction.deferReply(ephemeral);
    await interaction.editReply(
      cardMessage(await pickRoles(ctx, interaction.member, id.menuId, { toggle: id.roleId })),
    );
  },
};

export const roleMenuSelects: SelectHandler = {
  prefix: MENU_PREFIX,
  async execute(interaction, ctx) {
    const id = parseMenuId(interaction.customId);
    if (!id || id.roleId) return;
    await interaction.deferReply(ephemeral);
    await interaction.editReply(
      cardMessage(await pickRoles(ctx, interaction.member, id.menuId, { set: interaction.values })),
    );
  },
};
