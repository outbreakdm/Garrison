import { getGatehouseSettings, getWatchSettings, saveHealthSnapshot } from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { BotContext, Command } from "../../commands/types.js";
import { type Card, cardMessage } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import {
  ALL_REQUIRED,
  type ChannelAccess,
  type Check,
  fixPermissionsUrl,
  runHealthChecks,
} from "./checks.js";

/** Checks grouped by what they ask of you: fix now, worth a look, passed. */
export function healthCard(checks: Check[], fixButton: ButtonBuilder | null): Card {
  const list = (items: Check[]) => items.map((c) => `- ${c.text}`).join("\n");
  const fix = checks.filter((c) => c.status === "fix");
  const warn = checks.filter((c) => c.status === "warn");
  const ok = checks.filter((c) => c.status === "ok");
  const problems = fix.length + warn.length;
  const blocks: Card["blocks"] = [];
  if (fix.length)
    blocks.push({ text: `**Fix now**\n${list(fix)}`, button: fixButton ?? undefined });
  if (warn.length)
    blocks.push({
      text: `**Worth a look**\n${list(warn)}`,
      button: !fix.length && fixButton ? fixButton : undefined,
    });
  if (ok.length) {
    if (problems) blocks.push("divider");
    blocks.push({ text: `**Passed**\n${list(ok)}` });
  }
  return {
    tone: fix.length ? "alert" : problems ? "caution" : "go",
    title: problems
      ? `${problems} ${problems === 1 ? "thing needs" : "things need"} attention`
      : "All checks passed",
    lead: problems ? `${ok.length} of ${checks.length} checks passed` : undefined,
    blocks,
    actions: fixButton && !problems ? [fixButton] : undefined,
    module: "gatehouse",
    ref: "health",
  };
}

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
    await saveHealthSnapshot(ctx.db, interaction.guild.id, checks).catch(() => {});
    const me = interaction.guild.members.me;
    const needsReinvite =
      !!me &&
      ((me.permissions.bitfield & ALL_REQUIRED) !== ALL_REQUIRED ||
        me.permissions.has(PermissionFlagsBits.Administrator));
    const fixButton = needsReinvite
      ? new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Fix permissions")
          .setURL(fixPermissionsUrl(interaction.client.user.id, interaction.guild.id))
      : null;
    await interaction.editReply(cardMessage(healthCard(checks, fixButton)));
  },
};

/** Refresh every server's health snapshot for the dashboard. Uses cached data only: no extra Discord calls. */
export async function snapshotAllHealth(ctx: BotContext, guilds: Iterable<Guild>) {
  for (const guild of guilds) {
    try {
      await saveHealthSnapshot(ctx.db, guild.id, await healthFor(ctx, guild));
    } catch (error) {
      ctx.logger.warn("Health snapshot failed", { guildId: guild.id, error });
    }
  }
}
