import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotContext } from "../../../commands/types.js";
import { canUndo, type MemberAction } from "../copy.js";
import { confirmationEmbed, undoRow } from "../embeds.js";
import { applyMemberAction, checkMemberAction } from "../service.js";

export const REASON_MAX = 512;

/** Base builder for Watch commands: guild-only, hidden from members without `permission`. */
export function watchCommand(name: string, description: string, permission: bigint) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(permission)
    .setContexts(InteractionContextType.Guild);
}

export const ephemeral = { flags: MessageFlags.Ephemeral } as const;

/** Shared flow for /warn, /timeout, /kick and /ban. */
export async function runMemberAction(
  interaction: ChatInputCommandInteraction<"cached">,
  ctx: BotContext,
  action: MemberAction,
  opts: { durationSeconds?: number; deleteMessageSeconds?: number } = {},
) {
  const target = interaction.options.getUser("user", true);
  const member = interaction.options.getMember("user");
  const reason = interaction.options.getString("reason")?.slice(0, REASON_MAX) ?? null;

  if (!member && action !== "ban") {
    await interaction.reply({ content: `<@${target.id}> isn't in this server.`, ...ephemeral });
    return;
  }

  await interaction.deferReply(ephemeral);
  const problem = await checkMemberAction(
    interaction.guild,
    interaction.member,
    target,
    member,
    action,
  );
  if (problem) {
    await interaction.editReply(problem);
    return;
  }

  const result = await applyMemberAction(ctx, {
    guild: interaction.guild,
    actor: { id: interaction.user.id, tag: interaction.user.username },
    target,
    member,
    action,
    reason,
    durationSeconds: opts.durationSeconds ?? null,
    deleteMessageSeconds: opts.deleteMessageSeconds,
  });
  if (!result.ok) {
    await interaction.editReply(result.error);
    return;
  }

  await interaction.editReply({
    embeds: [
      confirmationEmbed(result.case, { dmSent: result.dmSent, escalated: result.escalated }),
    ],
    components: canUndo(result.case.action) ? [undoRow(result.case)] : [],
  });
}
