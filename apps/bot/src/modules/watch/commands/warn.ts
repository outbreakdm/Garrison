import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { REASON_MAX, runMemberAction, watchCommand } from "./shared.js";

export const warn: Command = {
  data: watchCommand(
    "warn",
    "Warn a member. Warnings count toward escalation rules.",
    PermissionFlagsBits.ModerateMembers,
  )
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Shown to the member and in the log")
        .setMaxLength(REASON_MAX),
    )
    .toJSON(),
  execute: (interaction, ctx) => runMemberAction(interaction, ctx, "warn"),
};
