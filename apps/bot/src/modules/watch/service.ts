import {
  countActiveWarnings,
  createCase,
  getCase,
  getWatchSettings,
  listEscalationRules,
  type ModCase,
  revokeCase,
  type WatchSettings,
} from "@garrison/db";
import {
  DiscordAPIError,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type User,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { recordModeratorAction } from "../gatehouse/anti-nuke.js";
import { canUndo, escalationReason, hierarchyError, type MemberAction, NO_REASON } from "./copy.js";
import { caseEmbed, dmEmbed } from "./embeds.js";
import { pickEscalation } from "./escalation.js";
import { checkHierarchy } from "./hierarchy.js";

/** What Garrison itself needs for each action. A warning needs nothing from Discord. */
const permissionFor: Record<MemberAction, bigint | null> = {
  warn: null,
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
};

/** What a moderator needs to take each action: the same as the slash commands ask for. */
export const moderatorPermission: Record<MemberAction, bigint> = {
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
};

/** Permission a moderator needs to undo a case of this action. */
const undoPermission: Partial<Record<ModCase["action"], bigint>> = {
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  ban: PermissionFlagsBits.BanMembers,
};

export interface Actor {
  id: string;
  tag: string;
}

/**
 * Check, before touching Discord, that the action is allowed and that
 * Garrison can carry it out. Returns a user-facing error, or null if fine.
 * Pass `actor: null` for automatic actions (escalation), which skip actor checks.
 */
export async function checkMemberAction(
  guild: Guild,
  actor: GuildMember | null,
  target: User,
  member: GuildMember | null,
  action: MemberAction,
): Promise<string | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const permission = permissionFor[action];
  const problem = checkHierarchy({
    action,
    actorId: actor?.id ?? "system",
    botId: me.id,
    ownerId: guild.ownerId,
    targetId: target.id,
    actorTop: actor ? actor.roles.highest.position : Number.POSITIVE_INFINITY,
    botTop: me.roles.highest.position,
    targetTop: member ? member.roles.highest.position : null,
    botHasPermission: permission === null || me.permissions.has(permission),
  });
  if (problem) return hierarchyError(problem, action, `<@${target.id}>`);
  if (action === "timeout" && member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return `I can't time out <@${target.id}>: Discord doesn't allow timeouts on administrators.`;
  }
  return null;
}

export interface MemberActionRequest {
  guild: Guild;
  actor: Actor;
  target: User;
  member: GuildMember | null;
  action: MemberAction;
  reason: string | null;
  durationSeconds?: number | null;
  deleteMessageSeconds?: number;
  source?: "manual" | "escalation";
}

export type MemberActionResult =
  | { ok: true; case: ModCase; dmSent: boolean | null; escalated: ModCase | null }
  | { ok: false; error: string };

async function sendDm(req: MemberActionRequest, settings: WatchSettings): Promise<boolean | null> {
  if (!settings.dmMembers || !req.member) return null;
  try {
    await req.target.send({
      embeds: [
        dmEmbed({
          action: req.action,
          guildName: req.guild.name,
          reason: req.reason,
          durationSeconds: req.durationSeconds ?? null,
          appealText: settings.appealText,
        }),
      ],
    });
    return true;
  } catch {
    return false;
  }
}

async function performOnDiscord(req: MemberActionRequest) {
  const auditReason = `${req.actor.tag}: ${req.reason ?? NO_REASON}`.slice(0, 512);
  switch (req.action) {
    case "warn":
      return;
    case "timeout":
      if (!req.member || !req.durationSeconds)
        throw new Error("Timeout needs a member and a duration");
      await req.member.timeout(req.durationSeconds * 1000, auditReason);
      return;
    case "kick":
      if (!req.member) throw new Error("Kick needs a member");
      await req.member.kick(auditReason);
      return;
    case "ban":
      await req.guild.members.ban(req.target.id, {
        reason: auditReason,
        deleteMessageSeconds: req.deleteMessageSeconds ?? 0,
      });
      return;
  }
}

/** Post a case to the guild's log channel, if one is set. Failures are logged, never thrown. */
export async function postCaseLog(
  ctx: BotContext,
  guild: Guild,
  settings: WatchSettings,
  c: ModCase,
) {
  if (!settings.logChannelId) return;
  try {
    const channel =
      guild.channels.cache.get(settings.logChannelId) ??
      (await guild.channels.fetch(settings.logChannelId));
    if (channel?.isSendable()) await channel.send({ embeds: [caseEmbed(c)] });
  } catch (error) {
    ctx.logger.warn("Could not post to the Watch log channel", {
      guildId: guild.id,
      channelId: settings.logChannelId,
      error,
    });
  }
}

/**
 * Apply a moderation action end to end: DM the member, act on Discord, record
 * the case, post it to the log channel and, for warnings, run escalation.
 * Call `checkMemberAction` first.
 */
export async function applyMemberAction(
  ctx: BotContext,
  req: MemberActionRequest,
): Promise<MemberActionResult> {
  await ensureGuild(ctx, req.guild);
  const settings = await getWatchSettings(ctx.db, req.guild.id);

  // A kicked or banned member shares no server with us afterwards, so DM first.
  const dmFirst = req.action === "kick" || req.action === "ban";
  let dmSent = dmFirst ? await sendDm(req, settings) : null;

  try {
    await performOnDiscord(req);
  } catch (error) {
    ctx.logger.warn("Discord refused a moderation action", { action: req.action, error });
    const detail = error instanceof DiscordAPIError ? `: ${error.message}` : "";
    return {
      ok: false,
      error: `Discord refused the ${req.action}${detail}. Check Garrison's role position and permissions.`,
    };
  }

  if (!dmFirst) dmSent = await sendDm(req, settings);

  const durationSeconds = req.action === "timeout" ? (req.durationSeconds ?? null) : null;
  const created = await createCase(ctx.db, {
    guildId: req.guild.id,
    action: req.action,
    source: req.source ?? "manual",
    targetId: req.target.id,
    targetTag: req.target.username,
    moderatorId: req.actor.id,
    moderatorTag: req.actor.tag,
    reason: req.reason,
    durationSeconds,
    expiresAt: durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : null,
    details: req.deleteMessageSeconds ? { deleteMessageSeconds: req.deleteMessageSeconds } : {},
  });
  await postCaseLog(ctx, req.guild, settings, created);

  // Bans and kicks through Garrison show Garrison as the audit-log executor,
  // so count them against the moderator here or anti-nuke would never see them.
  if ((req.action === "ban" || req.action === "kick") && (req.source ?? "manual") === "manual") {
    await recordModeratorAction(ctx, req.guild, req.actor.id).catch((error: unknown) =>
      ctx.logger.error("Anti-nuke check failed", { guildId: req.guild.id, error }),
    );
  }

  const escalated = req.action === "warn" ? await runEscalation(ctx, req) : null;
  return { ok: true, case: created, dmSent, escalated };
}

async function runEscalation(ctx: BotContext, warn: MemberActionRequest): Promise<ModCase | null> {
  if (!warn.member) return null;
  const rules = await listEscalationRules(ctx.db, warn.guild.id);
  if (!rules.length) return null;

  const counts = new Map<number, number>();
  for (const windowMinutes of new Set(rules.map((r) => r.windowMinutes))) {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    counts.set(
      windowMinutes,
      await countActiveWarnings(ctx.db, warn.guild.id, warn.target.id, since),
    );
  }
  const rule = pickEscalation(rules, (w) => counts.get(w) ?? 0);
  if (!rule) return null;

  const problem = await checkMemberAction(warn.guild, null, warn.target, warn.member, rule.action);
  if (problem) {
    ctx.logger.info("Escalation rule matched but cannot be applied", {
      guildId: warn.guild.id,
      problem,
    });
    return null;
  }

  const me = warn.guild.members.me ?? (await warn.guild.members.fetchMe());
  const result = await applyMemberAction(ctx, {
    guild: warn.guild,
    actor: { id: me.id, tag: me.user.username },
    target: warn.target,
    member: warn.member,
    action: rule.action,
    reason: escalationReason(rule.warnCount, rule.windowMinutes),
    durationSeconds: rule.durationSeconds,
    source: "escalation",
  });
  return result.ok ? result.case : null;
}

export type UndoResult = { ok: true; case: ModCase } | { ok: false; error: string };

/** Reverse a case on Discord and mark it revoked. Safe to call twice. */
export async function undoCase(
  ctx: BotContext,
  guild: Guild,
  caseNumber: number,
  actor: GuildMember,
): Promise<UndoResult> {
  const c = await getCase(ctx.db, guild.id, caseNumber);
  if (!c) return { ok: false, error: `There is no case #${caseNumber} in this server.` };
  if (!canUndo(c.action)) {
    return {
      ok: false,
      error: `Case #${caseNumber} can't be undone: Discord has no way to reverse a ${c.action}.`,
    };
  }
  if (c.revokedAt) return { ok: false, error: `Case #${caseNumber} was already undone.` };
  const needed = undoPermission[c.action];
  if (needed && !actor.permissions.has(needed)) {
    const name = c.action === "ban" ? "Ban Members" : "Moderate Members";
    return { ok: false, error: `You need ${name} to undo case #${caseNumber}.` };
  }

  const auditReason = `${actor.user.username}: undo case #${caseNumber}`;
  try {
    if (c.action === "timeout" && c.targetId) {
      const member = await guild.members.fetch(c.targetId).catch(() => null);
      if (member?.isCommunicationDisabled()) await member.timeout(null, auditReason);
    }
    if (c.action === "ban" && c.targetId) {
      await guild.members.unban(c.targetId, auditReason).catch((error: unknown) => {
        if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan)
          return;
        throw error;
      });
    }
  } catch (error) {
    ctx.logger.warn("Discord refused an undo", { caseNumber, error });
    return {
      ok: false,
      error: `Discord refused to undo case #${caseNumber}. Check that Garrison still has the permission it used.`,
    };
  }

  const revoked = await revokeCase(ctx.db, guild.id, caseNumber, actor.id);
  if (!revoked) return { ok: false, error: `Case #${caseNumber} was already undone.` };
  const settings = await getWatchSettings(ctx.db, guild.id);
  await postCaseLog(ctx, guild, settings, revoked);
  return { ok: true, case: revoked };
}
