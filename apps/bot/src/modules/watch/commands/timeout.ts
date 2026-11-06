import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { formatDuration, MAX_TIMEOUT_SECONDS, parseDuration } from "../../../lib/duration.js";
import { ephemeral, REASON_MAX, runMemberAction, watchCommand } from "./shared.js";

export const timeout: Command = {
  data: watchCommand(
    "timeout",
    "Time out a member so they can't chat or join voice.",
    PermissionFlagsBits.ModerateMembers,
  )
    .addUserOption((o) => o.setName("user").setDescription("Member to time out").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("duration")
        .setDescription("For example 10m, 1h, 1d. Up to 28d")
        .setRequired(true)
        .setMaxLength(32),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Shown to the member and in the log")
        .setMaxLength(REASON_MAX),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const raw = interaction.options.getString("duration", true);
    const seconds = parseDuration(raw);
    if (!seconds) {
      await interaction.reply({
        content: `I can't read "${raw}" as a duration. Use a number and a unit, like 10m, 1h or 2d.`,
        ...ephemeral,
      });
      return;
    }
    if (seconds > MAX_TIMEOUT_SECONDS) {
      await interaction.reply({
        content: `Timeouts can last ${formatDuration(MAX_TIMEOUT_SECONDS)} at most. For longer, use /ban.`,
        ...ephemeral,
      });
      return;
    }
    await runMemberAction(interaction, ctx, "timeout", { durationSeconds: seconds });
  },
};
