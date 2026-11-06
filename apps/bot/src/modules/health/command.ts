import { getGatehouseSettings, getWatchSettings } from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { BotContext, Command } from "../../commands/types.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import {
  ALL_REQUIRED,
  type ChannelAccess,
  type Check,
  fixPermissionsUrl,
  runHealthChecks,
} from "./checks.js";

/** One emoji per line, as a status marker only. */
const MARK: Record<Check["status"], string> = { ok: "✅", warn: "⚠️", fix: "⛔" };

function channelAccess(guild: Guild, me: GuildMember, id: string | null): ChannelAccess | null {
  if (!id) return null;
  const channel = guild.channels.cache.get(id);
  if (!channel) return { exists: false, canPost: false };
  const perms = channel.permissionsFor(me);
  return {
    exists: true,
    canPost: perms.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ]),
  };
}

export async function healthFor(ctx: BotContext, guild: Guild) {
  await ensureGuild(ctx, guild);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const [watch, gate] = await Promise.all([
    getWatchSettings(ctx.db, guild.id),
    getGatehouseSettings(ctx.db, guild.id),
  ]);
  return runHealthChecks({
    everyoneId: guild.roles.everyone.id,
    botPermissions: me.permissions.bitfield,
    botTop: me.roles.highest.position,
    roles: guild.roles.cache.map((r) => ({
      id: r.id,
      position: r.position,
      managed: r.managed,
      permissions: r.permissions.bitfield,
    })),
    logChannelId: watch.logChannelId,
    logChannel: channelAccess(guild, me, watch.logChannelId),
    alertChannelId: gate.alertChannelId,
    alertChannel: channelAccess(guild, me, gate.alertChannelId),
    verifyRoleId: gate.verifyRoleId,
    staffRoleIds: gate.staffRoleIds,
    antiRaidEnabled: gate.antiRaidEnabled,
    antiNukeEnabled: gate.antiNukeEnabled,
  });
}

export const health: Command = {
  data: guildCommand(
    "health",
    "Check Garrison's permissions, role position and settings in this server.",
    PermissionFlagsBits.ManageGuild,
  ).toJSON(),
  async execute(interaction, ctx) {
    await interaction.deferReply(ephemeral);
    const checks = await healthFor(ctx, interaction.guild);
    const problems = checks.filter((c) => c.status !== "ok").length;
    const me = interaction.guild.members.me;
    const needsReinvite =
      !!me &&
      ((me.permissions.bitfield & ALL_REQUIRED) !== ALL_REQUIRED ||
        me.permissions.has(PermissionFlagsBits.Administrator));

    const embed = brandEmbed({
      tone: checks.some((c) => c.status === "fix") ? "alert" : problems ? "caution" : "go",
      title: problems
        ? `${problems} ${problems === 1 ? "thing needs" : "things need"} attention`
        : "All checks passed",
      description: checks.map((c) => `${MARK[c.status]} ${c.text}`).join("\n"),
      module: "gatehouse",
      ref: "health",
    });
    const components = needsReinvite
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Fix permissions")
              .setURL(fixPermissionsUrl(interaction.client.user.id, interaction.guild.id)),
          ),
        ]
      : [];
    await interaction.editReply({ embeds: [embed], components });
  },
};
