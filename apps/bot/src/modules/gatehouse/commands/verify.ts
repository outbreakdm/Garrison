import { getGatehouseSettings } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../../commands/builders.js";
import type { ButtonHandler, Command } from "../../../commands/types.js";
import { serverUrl, settingsReply } from "../../../lib/dashboard.js";
import { brandEmbed } from "../../../lib/embeds.js";
import { ensureGuild } from "../../../lib/guild-registry.js";
import { VERIFY_BUTTON_ID } from "../embeds.js";
import { verifyMember } from "../service.js";

/**
 * Verification is set up on the dashboard: the role, the minimum account age,
 * and posting the Verify button. `setup` and `off` stay so the commands people
 * know still lead there; both only show where it's at.
 */
export const verify: Command = {
  data: guildCommand(
    "verify",
    "See verification, with a link to set it up on the dashboard.",
    PermissionFlagsBits.ManageGuild,
  )
    .addSubcommand((s) =>
      s.setName("setup").setDescription("Set up the Verify button, on the dashboard"),
    )
    .addSubcommand((s) =>
      s.setName("off").setDescription("Turn verification off, on the dashboard"),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    const s = await getGatehouseSettings(ctx.db, interaction.guild.id);
    await interaction.reply(
      settingsReply({
        subject: "Verification is",
        url: serverUrl(interaction.guild.id, "gatehouse?edit=verification#verification"),
        label: s.verifyRoleId ? "Change verification" : "Set up verification",
        embed: brandEmbed({
          title: "Verification",
          fields: [
            {
              name: "Status",
              value: s.verifyRoleId ? `On · gives <@&${s.verifyRoleId}>` : "Off",
              inline: true,
            },
            {
              name: "Min account age",
              value: s.verifyMinAccountAgeDays ? `${s.verifyMinAccountAgeDays} days` : "Any",
              inline: true,
            },
          ],
          module: "gatehouse",
        }),
      }),
    );
  },
};

export const verifyButton: ButtonHandler = {
  prefix: VERIFY_BUTTON_ID,
  async execute(interaction, ctx) {
    await interaction.deferReply(ephemeral);
    await interaction.editReply(await verifyMember(ctx, interaction.member));
  },
};
