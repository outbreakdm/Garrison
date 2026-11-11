import { getActiveLockdown } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../../commands/builders.js";
import type { Command } from "../../../commands/types.js";
import { cardMessage, cardReply } from "../../../lib/card.js";
import { formatDuration, parseDuration } from "../../../lib/duration.js";
import { lockdownEndedCard, lockdownStartedCard, noLockdownCard } from "../embeds.js";
import { lockGuild, unlockGuild } from "../service.js";

const MAX_LOCKDOWN_SECONDS = 7 * 86_400;

export const lockdown: Command = {
  data: guildCommand(
    "lockdown",
    "Stop members posting, and pause invites, while you deal with a raid.",
    PermissionFlagsBits.ManageChannels,
  )
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Lock every channel @everyone can see")
        .addStringOption((o) =>
          o.setName("reason").setDescription("Shown in the alert").setMaxLength(300),
        )
        .addStringOption((o) =>
          o
            .setName("duration")
            .setDescription("Lift on its own after, e.g. 30m or 2h. Leave empty to lift by hand")
            .setMaxLength(32),
        )
        .addBooleanOption((o) =>
          o.setName("pause_invites").setDescription("Pause invites too (default: yes)"),
        ),
    )
    .addSubcommand((s) =>
      s.setName("end").setDescription("Lift the lockdown and restore every channel"),
    )
    .addSubcommand((s) => s.setName("status").setDescription("Show whether a lockdown is active"))
    .toJSON(),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const actor = { id: interaction.user.id, tag: interaction.user.username };

    if (sub === "status") {
      const active = await getActiveLockdown(ctx.db, interaction.guild.id);
      const card = active
        ? lockdownStartedCard(active, {
            channels: new Set(active.snapshot.map((s) => s.channelId)).size,
            failed: 0,
          })
        : noLockdownCard();
      await interaction.reply(cardReply(card));
      return;
    }

    if (sub === "end") {
      await interaction.deferReply(ephemeral);
      const result = await unlockGuild(ctx, interaction.guild, actor);
      await interaction.editReply(
        result.ok ? cardMessage(lockdownEndedCard(result.lockdown, result)) : result.error,
      );
      return;
    }

    const rawDuration = interaction.options.getString("duration");
    let durationMinutes: number | null = null;
    if (rawDuration) {
      const seconds = parseDuration(rawDuration);
      if (!seconds || seconds < 60 || seconds > MAX_LOCKDOWN_SECONDS) {
        await interaction.reply({
          content: `Use a duration between 1 min and ${formatDuration(MAX_LOCKDOWN_SECONDS)}, like 30m or 2h.`,
          ...ephemeral,
        });
        return;
      }
      durationMinutes = Math.ceil(seconds / 60);
    }

    await interaction.deferReply(ephemeral);
    const result = await lockGuild(ctx, interaction.guild, {
      source: "manual",
      reason: interaction.options.getString("reason"),
      actorId: actor.id,
      actorTag: actor.tag,
      durationMinutes,
      pauseInvites: interaction.options.getBoolean("pause_invites") ?? true,
    });
    if (!result.ok) {
      await interaction.editReply(result.error);
      return;
    }
    // The card already says how to lift it and carries the reference.
    await interaction.editReply(cardMessage(lockdownStartedCard(result.lockdown, result)));
  },
};
