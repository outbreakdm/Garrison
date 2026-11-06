import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { REASON_MAX, runMemberAction, watchCommand } from "./shared.js";

export const ban: Command = {
  data: watchCommand(
    "ban",
    "Ban a user, whether or not they're in the server.",
    PermissionFlagsBits.BanMembers,
  )
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Shown to the member and in the log")
        .setMaxLength(REASON_MAX),
    )
    .addIntegerOption((o) =>
      o
        .setName("delete_messages")
        .setDescription("Delete their recent messages")
        .addChoices(
          { name: "Don't delete any", value: 0 },
          { name: "Last hour", value: 3600 },
          { name: "Last 24 hours", value: 86_400 },
          { name: "Last 7 days", value: 604_800 },
        ),
    )
    .toJSON(),
  execute: (interaction, ctx) =>
    runMemberAction(interaction, ctx, "ban", {
      deleteMessageSeconds: interaction.options.getInteger("delete_messages") ?? 0,
    }),
};
