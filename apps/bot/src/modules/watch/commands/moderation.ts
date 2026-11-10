import { getWatchSettings } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { serverUrl, settingsReply } from "../../../lib/dashboard.js";
import { brandEmbed } from "../../../lib/embeds.js";
import { ensureGuild } from "../../../lib/guild-registry.js";
import { DEFAULT_APPEAL_TEXT } from "../copy.js";
import { watchCommand } from "./shared.js";

/** Shows Watch settings. They're changed on the dashboard, with history and undo. */
export const moderation: Command = {
  data: watchCommand(
    "moderation",
    "See Watch settings, with a link to change them on the dashboard.",
    PermissionFlagsBits.ManageGuild,
  ).toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    const settings = await getWatchSettings(ctx.db, interaction.guild.id);
    await interaction.reply(
      settingsReply({
        subject: "Watch settings are",
        url: serverUrl(interaction.guild.id, "watch?edit=settings#settings"),
        label: "Change Watch settings",
        embed: brandEmbed({
          title: "Watch settings",
          fields: [
            {
              name: "Log channel",
              value: settings.logChannelId ? `<#${settings.logChannelId}>` : "Off",
              inline: true,
            },
            { name: "DM members", value: settings.dmMembers ? "On" : "Off", inline: true },
            {
              name: "Appeal text",
              value: settings.appealText ?? `Default: ${DEFAULT_APPEAL_TEXT}`,
            },
          ],
          module: "watch",
        }),
      }),
    );
  },
};
