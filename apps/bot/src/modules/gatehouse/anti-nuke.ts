import {
  createQuarantine,
  type GatehouseSettings,
  getGatehouseSettings,
  getQuarantine,
  markQuarantineRestored,
  type Quarantine,
} from "@garrison/db";
import {
  ActionRowBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import {
  ActionRateTracker,
  canOverrideAntiNuke,
  DANGEROUS_PERMISSIONS,
  dangerousBitsAdded,
  isTrusted,
  type NukeKind,
  permissionNames,
  removableRoleIds,
} from "./nuke.js";
import { cachedGatehouseSettings, sendAlert } from "./service.js";

export const RESTORE_PREFIX = "gate:restore";

const tracker = new ActionRateTracker();
/** Actors being quarantined right now, so a burst of audit events acts once. */
const inFlight = new Set<string>();

const KIND_FOR_ACTION = new Map<AuditLogEvent, NukeKind>([
  [AuditLogEvent.ChannelDelete, "delete"],
  [AuditLogEvent.RoleDelete, "delete"],
  [AuditLogEvent.MemberBanAdd, "ban"],
  [AuditLogEvent.MemberKick, "ban"],
]);

async function trustContext(guild: Guild, settings: GatehouseSettings) {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  return { ownerId: guild.ownerId, botId: me.id, trustedIds: settings.antiNukeTrustedIds };
}

/** Entry point for Discord's audit log stream (needs the Guild Moderation intent and View Audit Log). */
export async function handleAuditLogEntry(
  ctx: BotContext,
  entry: GuildAuditLogsEntry,
  guild: Guild,
) {
  const settings = await cachedGatehouseSettings(ctx, guild.id);
  if (!settings.antiNukeEnabled || !entry.executorId) return;
  if (isTrusted(entry.executorId, await trustContext(guild, settings))) return;

  if (entry.action === AuditLogEvent.RoleUpdate && entry.targetId === guild.roles.everyone.id) {
    await guardEveryoneRole(ctx, guild, entry);
    return;
  }

  const kind = KIND_FOR_ACTION.get(entry.action);
  if (kind) await countAction(ctx, guild, entry.executorId, kind, settings);
}

/**
 * Count a ban or kick a moderator made through Garrison's own commands. Audit
 * entries for those name Garrison as the executor, so without this a rogue
 * moderator could mass-ban through /ban unnoticed.
 */
export async function recordModeratorAction(ctx: BotContext, guild: Guild, actorId: string) {
  const settings = await cachedGatehouseSettings(ctx, guild.id);
  if (!settings.antiNukeEnabled) return;
  if (isTrusted(actorId, await trustContext(guild, settings))) return;
  await countAction(ctx, guild, actorId, "ban", settings);
}

async function countAction(
  ctx: BotContext,
  guild: Guild,
  actorId: string,
  kind: NukeKind,
  settings: GatehouseSettings,
) {
  const count = tracker.record(guild.id, actorId, kind, settings.nukeWindowSeconds * 1000);
  const threshold = kind === "delete" ? settings.nukeDeleteThreshold : settings.nukeBanThreshold;
  if (count < threshold) return;
  const what = kind === "delete" ? "channel or role deletions" : "bans and kicks";
  await quarantineActor(ctx, guild, actorId, `${count} ${what} in ${settings.nukeWindowSeconds} s`);
}

async function guardEveryoneRole(ctx: BotContext, guild: Guild, entry: GuildAuditLogsEntry) {
  const change = entry.changes.find((c) => c.key === "permissions");
  if (!change) return;
  const before = BigInt((change.old as string | undefined) ?? "0");
  const after = BigInt((change.new as string | undefined) ?? "0");
  const added = dangerousBitsAdded(before, after);
  if (!added || !entry.executorId) return;

  const everyone = guild.roles.everyone;
  try {
    // Remove only what was added, keeping any other edits made since.
    await everyone.setPermissions(
      everyone.permissions.bitfield & ~added,
      "Anti-nuke: dangerous permission given to @everyone",
    );
  } catch (error) {
    ctx.logger.warn("Could not revert @everyone permissions", { guildId: guild.id, error });
  }
  await quarantineActor(ctx, guild, entry.executorId, `Gave @everyone ${permissionNames(added)}`);
}

async function quarantineActor(ctx: BotContext, guild: Guild, userId: string, reason: string) {
  const key = `${guild.id}:${userId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  tracker.reset(guild.id, userId);
  try {
    ctx.logger.warn("Anti-nuke triggered", { guildId: guild.id, userId, reason });
    const auditReason = `Anti-nuke: ${reason}`.slice(0, 512);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await sendAlert(
        ctx,
        guild,
        alertEmbed(
          `Anti-nuke triggered by <@${userId}>`,
          reason,
          "They already left the server, so there was nothing to remove.",
        ),
      );
      return;
    }
    const me = guild.members.me ?? (await guild.members.fetchMe());
    await ensureGuild(ctx, guild);

    if (member.user.bot) {
      if (!member.kickable) {
        await sendAlert(
          ctx,
          guild,
          alertEmbed(
            `Anti-nuke couldn't stop ${member.user.username}`,
            reason,
            "That bot's role sits above mine, so I can't kick it. Remove it in Server Settings → Integrations, then drag Garrison to the top of the role list.",
          ),
        );
        return;
      }
      await member.kick(auditReason);
      await createQuarantine(ctx.db, {
        guildId: guild.id,
        userId,
        userTag: member.user.username,
        reason,
        removedRoleIds: [],
        kicked: true,
      });
      await sendAlert(
        ctx,
        guild,
        alertEmbed(
          `Kicked the bot ${member.user.username}`,
          reason,
          "Bots that trip anti-nuke are kicked. Re-invite it only if you trust it, and have the owner add it to anti-nuke's trusted list in the dashboard, under Security.",
        ),
      );
      return;
    }

    const roles = member.roles.cache.map((r) => ({
      id: r.id,
      position: r.position,
      managed: r.managed,
    }));
    const removable = removableRoleIds(roles, guild.roles.everyone.id, me.roles.highest.position);
    if (removable.length) await member.roles.remove(removable, auditReason);
    const quarantine = await createQuarantine(ctx.db, {
      guildId: guild.id,
      userId,
      userTag: member.user.username,
      reason,
      removedRoleIds: removable,
      kicked: false,
    });

    const fresh = await member.fetch(true).catch(() => member);
    const stillPowerful = fresh.permissions.any(DANGEROUS_PERMISSIONS);
    const detail = stillPowerful
      ? "Their highest role sits above mine, so they still have dangerous permissions. Remove their roles by hand, then drag Garrison to the top of the role list."
      : `Removed ${removable.length} ${removable.length === 1 ? "role" : "roles"}. The owner or a trusted user can put them back.`;
    await sendAlert(
      ctx,
      guild,
      alertEmbed(`Quarantined ${member.user.username}`, reason, detail, quarantine),
      removable.length ? [restoreRow(quarantine)] : [],
    );
  } catch (error) {
    ctx.logger.error("Quarantine failed", { guildId: guild.id, userId, error });
  } finally {
    inFlight.delete(key);
  }
}

function alertEmbed(title: string, reason: string, detail: string, q?: Quarantine) {
  return brandEmbed({
    tone: "alert",
    title,
    description: detail,
    fields: [{ name: "Why", value: reason }],
    module: "gatehouse",
    ref: q ? `quarantine ${q.id.slice(0, 6)}` : undefined,
  });
}

export function restoreRow(q: Pick<Quarantine, "id">, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RESTORE_PREFIX}:${q.id}`)
      .setLabel(disabled ? "Roles restored" : "Restore roles")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export type RestoreResult =
  | { ok: true; restored: number; quarantine: Quarantine }
  | { ok: false; error: string };

/** Put a quarantined member's roles back. Only the owner or a trusted user may. */
export async function restoreQuarantine(
  ctx: BotContext,
  guild: Guild,
  quarantineId: string,
  clicker: GuildMember,
): Promise<RestoreResult> {
  const settings = await getGatehouseSettings(ctx.db, guild.id);
  if (
    !canOverrideAntiNuke(clicker.id, {
      ownerId: guild.ownerId,
      trustedIds: settings.antiNukeTrustedIds,
    })
  ) {
    return {
      ok: false,
      error: "Only the server owner or a trusted user can restore roles after anti-nuke.",
    };
  }
  const q = await getQuarantine(ctx.db, guild.id, quarantineId);
  if (!q) return { ok: false, error: "I can't find that quarantine." };
  if (q.kicked) return { ok: false, error: "That bot was kicked. Re-invite it if you trust it." };

  const member = await guild.members.fetch(q.userId).catch(() => null);
  if (!member) return { ok: false, error: `<@${q.userId}> isn't in the server any more.` };

  // Claim it first, so two clicks restore once.
  const claimed = await markQuarantineRestored(ctx.db, q.id, clicker.id);
  if (!claimed) return { ok: false, error: "Those roles were already restored." };

  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      ok: false,
      error: "I'm missing Manage Roles, so I can't give the roles back. Restore them by hand.",
    };
  }
  const restorable = q.removedRoleIds.filter((id) => {
    const role = guild.roles.cache.get(id);
    return role && role.position < me.roles.highest.position;
  });
  if (restorable.length)
    await member.roles.add(restorable, `Anti-nuke quarantine restored by ${clicker.user.username}`);
  return { ok: true, restored: restorable.length, quarantine: claimed };
}
