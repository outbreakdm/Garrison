import { getWatchSettings, updateWatchSettings, type WatchSettingsPatch } from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { brandEmbed } from "../../../lib/embeds.js";
import { ensureGuild } from "../../../lib/guild-registry.js";
import { DEFAULT_APPEAL_TEXT } from "../copy.js";
import { ephemeral, watchCommand } from "./shared.js";

export const moderation: Command = {
  data: watchCommand(
    "moderation",
    "View or change Watch settings for this server.",
    PermissionFlagsBits.ManageGuild,
  )
    .addChannelOption((o) =>
      o
        .setName("log_channel")
        .setDescription("Channel that gets a log entry for every case")
        .addChannelTypes(ChannelType.GuildText),
    )
    .addBooleanOption((o) =>
      o.setName("dm_members").setDescription("DM members when they're moderated"),
    )
    .addStringOption((o) =>
      o
        .setName("appeal_text")
        .setDescription("How members can appeal, shown in moderation DMs")
        .setMaxLength(300),
    )
    .addBooleanOption((o) => o.setName("clear_log_channel").setDescription("Stop logging cases"))
    .toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    const patch: WatchSettingsPatch = {};
    const channel = interaction.options.getChannel("log_channel");
    const dm = interaction.options.getBoolean("dm_members");
    const appeal = interaction.options.getString("appeal_text");
    if (channel) patch.logChannelId = channel.id;
    if (interaction.options.getBoolean("clear_log_channel")) patch.logChannelId = null;
    if (dm !== null) patch.dmMembers = dm;
    if (appeal !== null) patch.appealText = appeal.trim() || null;

    const changed = Object.keys(patch).length > 0;
    const settings = changed
      ? await updateWatchSettings(ctx.db, interaction.guild.id, patch)
      : await getWatchSettings(ctx.db, interaction.guild.id);

    await interaction.reply({
      embeds: [
        brandEmbed({
          title: changed ? "Saved. Watch settings updated" : "Watch settings",
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
      ],
      ...ephemeral,
    });
  },
};
