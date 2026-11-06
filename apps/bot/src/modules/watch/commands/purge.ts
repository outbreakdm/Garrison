import { createCase, getWatchSettings } from "@garrison/db";
import { type Collection, type Message, PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { confirmationEmbedForPurge } from "../embeds.js";
import { ensureGuild, postCaseLog } from "../service.js";
import { ephemeral, REASON_MAX, watchCommand } from "./shared.js";

const BULK_DELETE_MAX_AGE_MS = 14 * 86_400_000;

export const purge: Command = {
  data: watchCommand(
    "purge",
    "Bulk-delete recent messages in this channel.",
    PermissionFlagsBits.ManageMessages,
  )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How many messages, 1 to 100")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user"))
    .addStringOption((o) =>
      o.setName("reason").setDescription("Shown in the log").setMaxLength(REASON_MAX),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const channel = interaction.channel;

    if (!channel || !("bulkDelete" in channel)) {
      await interaction.reply({
        content: "I can only purge text channels and threads.",
        ...ephemeral,
      });
      return;
    }
    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    const perms = channel.permissionsFor(me);
    if (!perms?.has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])) {
      await interaction.reply({
        content: `I can't delete messages in <#${channel.id}>: I'm missing Manage Messages or Read Message History there. Give Garrison both in the channel's permissions.`,
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);
    const fetched: Collection<string, Message> = await channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const eligible = fetched
      .filter((m) => !m.pinned && m.createdTimestamp > cutoff && (!user || m.author.id === user.id))
      .first(amount);
    const deleted = eligible.length ? await channel.bulkDelete(eligible, true) : null;
    const count = deleted?.size ?? 0;

    await ensureGuild(ctx, interaction.guild);
    const created = await createCase(ctx.db, {
      guildId: interaction.guild.id,
      action: "purge",
      targetId: user?.id ?? null,
      targetTag: user?.username ?? null,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.username,
      reason,
      details: { channelId: channel.id, deleted: count, requested: amount },
    });
    const settings = await getWatchSettings(ctx.db, interaction.guild.id);
    await postCaseLog(ctx, interaction.guild, settings, created);

    await interaction.editReply({
      embeds: [
        confirmationEmbedForPurge(created, {
          requested: amount,
          deleted: count,
          channelId: channel.id,
        }),
      ],
    });
  },
};
