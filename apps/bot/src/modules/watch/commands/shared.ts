import type { ChatInputCommandInteraction } from "discord.js";
import { ephemeral } from "../../../commands/builders.js";
import type { BotContext } from "../../../commands/types.js";
import type { MemberAction } from "../copy.js";
import { caseRow, confirmationEmbed } from "../embeds.js";
import { applyMemberAction, checkMemberAction } from "../service.js";

export const REASON_MAX = 512;

export { ephemeral, guildCommand as watchCommand } from "../../../commands/builders.js";

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
    components: [caseRow(result.case)].filter((r) => r !== null),
  });
}
