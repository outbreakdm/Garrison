import { getGatehouseSettings } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { guildCommand } from "../../../commands/builders.js";
import type { Command } from "../../../commands/types.js";
import { serverUrl, settingsReply } from "../../../lib/dashboard.js";
import { ensureGuild } from "../../../lib/guild-registry.js";
import { settingsEmbed } from "../embeds.js";

/**
 * Shows Gatehouse settings. They're changed on the dashboard's Security page,
 * where anti-nuke stays owner-only, with history and undo.
 */
export const security: Command = {
  data: guildCommand(
    "security",
    "See anti-raid and anti-nuke settings, with a link to change them on the dashboard.",
    PermissionFlagsBits.ManageGuild,
  ).toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    const settings = await getGatehouseSettings(ctx.db, interaction.guild.id);
    await interaction.reply(
      settingsReply({
        subject: "Security settings are",
        url: serverUrl(interaction.guild.id, "gatehouse"),
        label: "Change security settings",
        embed: settingsEmbed(settings),
        note: "Only the server owner can change anti-nuke.",
      }),
    );
  },
};
