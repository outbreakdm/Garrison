import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { REASON_MAX, runMemberAction, watchCommand } from "./shared.js";

export const kick: Command = {
  data: watchCommand(
    "kick",
    "Remove a member from the server. They can rejoin with an invite.",
    PermissionFlagsBits.KickMembers,
  )
    .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Shown to the member and in the log")
        .setMaxLength(REASON_MAX),
    )
    .toJSON(),
  execute: (interaction, ctx) => runMemberAction(interaction, ctx, "kick"),
};
