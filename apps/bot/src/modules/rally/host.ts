import {
  claimLfgPing,
  getLfgPost,
  handOverLfg,
  type LfgPost,
  leaveLfg,
  listActiveMembers,
  setLfgLocked,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import { ephemeral } from "../../commands/builders.js";
import type { BotContext, SelectHandler } from "../../commands/types.js";
import { RALLY_PREFIX, safeText } from "./card.js";
import { refreshCard, syncVoiceAccess } from "./service.js";

/**
 * A group's host controls, behind the card's Manage button: remove someone, hand the group to a
 * member, lock it so nobody new joins, and ping the group. Only the host or someone with Manage
 * Messages; checked again on every press.
 */

const UUID = /^[0-9a-f-]{36}$/;
const NOT_HOST = "Only the host or a moderator can manage this group.";

type Pressed = ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached">;

function mayManage(interaction: Pressed, post: LfgPost) {
  return (
    interaction.user.id === post.hostId ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)
  );
}

/** The panel: member menus for Remove and Hand over, then Lock and Ping. */
async function panel(interaction: Pressed, ctx: BotContext, post: LfgPost, note?: string) {
  const members = (await listActiveMembers(ctx.db, post.id)).filter(
    (m) => m.userId !== post.hostId,
  );
  const nameOf = (id: string) =>
    interaction.guild.members.cache.get(id)?.displayName ?? `Member ${id.slice(-4)}`;
  const options = members.slice(0, 25).map((m) => ({
    label: nameOf(m.userId).slice(0, 100),
    description: m.slotName ? m.slotName.slice(0, 100) : undefined,
    value: m.userId,
  }));
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (options.length)
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${RALLY_PREFIX}:kick:${post.id}`)
          .setPlaceholder("Remove someone")
          .addOptions(options),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${RALLY_PREFIX}:host:${post.id}`)
          .setPlaceholder("Hand the group to")
          .addOptions(options),
      ),
    );
  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${RALLY_PREFIX}:lock:${post.id}`)
        .setLabel(post.locked ? "Unlock" : "Lock")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${RALLY_PREFIX}:ping:${post.id}`)
        .setLabel("Ping the group")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!members.length),
    ),
  );
  const lines = [
    note,
    `**${safeText(post.title)}** · ${post.locked ? "locked: nobody new can join" : "open to join"}`,
    members.length
      ? `Members: ${members.map((m) => `<@${m.userId}>`).join(" ")}`
      : "Nobody else has joined yet.",
  ].filter(Boolean);
  return {
    content: lines.join("\n"),
    components: rows,
    allowedMentions: { parse: [] as [] },
  };
}

/** Manage, Lock and Ping, pressed on a group's card or its panel. */
export async function hostButton(
  interaction: ButtonInteraction<"cached">,
  ctx: BotContext,
  action: string,
  postId: string,
) {
  const post = await getLfgPost(ctx.db, interaction.guild.id, postId);
  if (!post || (post.status !== "open" && post.status !== "full")) {
    await interaction.reply({ content: "This group is closed.", ...ephemeral });
    return;
  }
  if (!mayManage(interaction, post)) {
    await interaction.reply({ content: NOT_HOST, ...ephemeral });
    return;
  }
  if (action === "manage") {
    await interaction.reply({ ...(await panel(interaction, ctx, post)), ...ephemeral });
    return;
  }
  if (action === "lock") {
    const updated = await setLfgLocked(ctx.db, post.id, !post.locked);
    if (!updated) {
      await interaction.update({ content: "This group is closed.", components: [] });
      return;
    }
    await refreshCard(ctx, interaction.guild, updated);
    const note = updated.locked ? "Locked. Nobody new can join." : "Unlocked.";
    await interaction.update(await panel(interaction, ctx, updated, note));
    return;
  }
  if (action === "ping") {
    const pinged = await claimLfgPing(ctx.db, post.id);
    if (!pinged) {
      const note = "You pinged the group in the last 10 minutes.";
      await interaction.update(await panel(interaction, ctx, post, note));
      return;
    }
    const members = (await listActiveMembers(ctx.db, post.id)).filter(
      (m) => m.userId !== post.hostId,
    );
    const channel = interaction.guild.channels.cache.get(post.channelId);
    if (channel?.isSendable() && members.length)
      await channel
        .send({
          content: `<@${post.hostId}> is getting **${safeText(post.title)}** together: ${members
            .map((m) => `<@${m.userId}>`)
            .join(" ")}`,
          allowedMentions: { users: members.map((m) => m.userId), roles: [], parse: [] },
        })
        .catch(() => {});
    await interaction.update(await panel(interaction, ctx, pinged, "Pinged the group."));
  }
}

/** Remove someone, or hand the group over, from the panel's menus. */
export const rallySelects: SelectHandler = {
  prefix: RALLY_PREFIX,
  async execute(interaction, ctx) {
    const [, action, postId] = interaction.customId.split(":");
    if (!postId || !UUID.test(postId)) return;
    const post = await getLfgPost(ctx.db, interaction.guild.id, postId);
    if (!post || (post.status !== "open" && post.status !== "full")) {
      await interaction.update({ content: "This group is closed.", components: [] });
      return;
    }
    if (!mayManage(interaction, post)) {
      await interaction.reply({ content: NOT_HOST, ...ephemeral });
      return;
    }
    const target = interaction.values[0] ?? "";
    if (action === "kick") {
      if (target === post.hostId) return;
      const result = await leaveLfg(ctx.db, post.id, target);
      if (!result.ok) {
        await interaction.update(await panel(interaction, ctx, post, "They already left."));
        return;
      }
      await refreshCard(ctx, interaction.guild, result.post, result.members);
      await syncVoiceAccess(interaction.guild, result.post, target, false);
      await interaction.update(await panel(interaction, ctx, result.post, `Removed <@${target}>.`));
      return;
    }
    if (action === "host") {
      const result = await handOverLfg(ctx.db, post.id, target);
      if (!result.ok) {
        const note =
          result.reason === "hosts_another"
            ? "They already host another open group here."
            : "They're not in the group anymore.";
        await interaction.update(await panel(interaction, ctx, post, note));
        return;
      }
      await refreshCard(ctx, interaction.guild, result.post);
      // The old host's panel is done: the new host manages it now.
      await interaction.update({
        content: `<@${target}> hosts **${safeText(result.post.title)}** now.`,
        components: [],
        allowedMentions: { parse: [] },
      });
    }
  },
};
