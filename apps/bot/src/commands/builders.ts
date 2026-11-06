import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";

/**
 * Base builder for Garrison commands: guild-only, hidden from members without
 * `permission`. Pass null only for commands every member should have, like /lfg.
 */
export function guildCommand(name: string, description: string, permission: bigint | null) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(permission)
    .setContexts(InteractionContextType.Guild);
}

export const ephemeral = { flags: MessageFlags.Ephemeral } as const;
