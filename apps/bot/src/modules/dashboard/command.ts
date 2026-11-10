import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { linkRow, NO_DASHBOARD, serverUrl } from "../../lib/dashboard.js";
import { failed, info } from "../../lib/embeds.js";
import { safeText } from "../../lib/text.js";

/** A button to this server's dashboard. Same permission the dashboard asks for. */
export const dashboard: Command = {
  data: guildCommand(
    "dashboard",
    "Open this server's Garrison dashboard: settings, moderation, raids and builds.",
    PermissionFlagsBits.ManageGuild,
  ).toJSON(),
  async execute(interaction) {
    const url = serverUrl(interaction.guild.id);
    await interaction.reply(
      url
        ? {
            ...info(
              `The dashboard for ${safeText(interaction.guild.name)}: what needs attention, every setting, moderation, raids and Quartermaster. Sign in with Discord.`,
            ),
            components: [linkRow(url, "Open dashboard")],
            ...ephemeral,
          }
        : { ...failed(NO_DASHBOARD), ...ephemeral },
    );
  },
};
