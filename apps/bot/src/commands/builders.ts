import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";

/** Base builder for Garrison commands: guild-only, hidden from members without `permission`. */
export function guildCommand(name: string, description: string, permission: bigint) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(permission)
    .setContexts(InteractionContextType.Guild);
}

export const ephemeral = { flags: MessageFlags.Ephemeral } as const;
