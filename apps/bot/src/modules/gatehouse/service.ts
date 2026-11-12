import {
  endLockdown,
  type GatehouseSettings,
  getActiveLockdown,
  getGatehouseSettings,
  getWatchSettings,
  type Lockdown,
  type LockdownSnapshotEntry,
  listExpiredLockdowns,
  saveLockdownSnapshot,
  startLockdown,
} from "@garrison/db";
import {
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  Routes,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { type Card, cardMessage } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import {
  lockdownEndedCard,
  lockdownStartedCard,
  newAccountFlagCard,
  raidAlertCard,
} from "./embeds.js";
import {
  accountAgeDays,
  describeAccountAge,
  JoinRateTracker,
  type OverwriteChange,
  planChannelLock,
  planRestore,
} from "./plan.js";

const LOCKABLE = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

/** Discord lets invites be paused for at most 24 hours at a time. */
const MAX_INVITE_PAUSE_MS = 24 * 3_600_000;

// --- Settings cache --------------------------------------------------------
// Member joins arrive in bursts during a raid; don't hit the database for each.

const SETTINGS_TTL_MS = 60_000;
const settingsCache = new Map<string, { settings: GatehouseSettings; at: number }>();

export async function cachedGatehouseSettings(ctx: BotContext, guildId: string) {
  const hit = settingsCache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.settings;
  const settings = await getGatehouseSettings(ctx.db, guildId);
  settingsCache.set(guildId, { settings, at: Date.now() });
  return settings;
}

export function invalidateGatehouseSettings(guildId: string) {
  settingsCache.delete(guildId);
}

// --- Alerts ----------------------------------------------------------------

/** Post to the Gatehouse alert channel, falling back to the Watch log channel. */
export async function sendAlert(ctx: BotContext, guild: Guild, card: Card) {
  const settings = await cachedGatehouseSettings(ctx, guild.id);
  const channelId =
    settings.alertChannelId ?? (await getWatchSettings(ctx.db, guild.id)).logChannelId;
  if (!channelId) return;
  try {
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId));
    if (channel?.isSendable()) await channel.send(cardMessage(card));
  } catch (error) {
    ctx.logger.warn("Could not post a Gatehouse alert", { guildId: guild.id, channelId, error });
  }
}

// --- Lockdown --------------------------------------------------------------

async function applyChanges(guild: Guild, changes: OverwriteChange[], reason: string) {
  let failed = 0;
  // Sequential on purpose: discord.js queues per route anyway, and order makes failures easy to reason about.
  for (const change of changes) {
    const route = Routes.channelPermission(change.channelId, change.targetId);
    try {
      if (change.after) {
        await guild.client.rest.put(route, {
          body: {
            type: change.type,
            allow: change.after.allow.toString(),
            deny: change.after.deny.toString(),
          },
          reason,
        });
      } else {
        await guild.client.rest.delete(route, { reason });
      }
    } catch {
      failed++;
    }
  }
  return failed;
}

export interface LockRequest {
  source: "manual" | "anti_raid";
  reason: string | null;
  actorId: string;
  actorTag: string;
  /** Minutes until it lifts on its own. Null or 0 waits for /lockdown end. */
  durationMinutes: number | null;
  pauseInvites: boolean;
  raid?: { joins: number; windowSeconds: number };
}

export type LockResult =
  | { ok: true; lockdown: Lockdown; channels: number; failed: number }
  | { ok: false; error: string };

export async function lockGuild(
  ctx: BotContext,
  guild: Guild,
  req: LockRequest,
): Promise<LockResult> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
    return {
      ok: false,
      error:
        "I can't lock channels: I'm missing Manage Channels or Manage Roles. Give Garrison both in Server Settings → Roles.",
    };
  }

  await ensureGuild(ctx, guild);
  const endsAt = req.durationMinutes ? new Date(Date.now() + req.durationMinutes * 60_000) : null;
  const lockdown = await startLockdown(ctx.db, {
    guildId: guild.id,
    source: req.source,
    reason: req.reason,
    startedById: req.actorId,
    endsAt,
  });
  if (!lockdown)
    return { ok: false, error: "A lockdown is already active. Lift it with /lockdown end." };

  const auditReason = `${req.actorTag}: lockdown${req.reason ? ` · ${req.reason}` : ""}`.slice(
    0,
    512,
  );

  let invitesPaused = false;
  if (req.pauseInvites && me.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const until = new Date(
      Math.min(endsAt?.getTime() ?? Number.POSITIVE_INFINITY, Date.now() + MAX_INVITE_PAUSE_MS),
    );
    try {
      await guild.setIncidentActions({ invitesDisabledUntil: until });
      invitesPaused = true;
    } catch (error) {
      ctx.logger.warn("Could not pause invites", { guildId: guild.id, error });
    }
  }

  const settings = await getGatehouseSettings(ctx.db, guild.id);
  const changes: OverwriteChange[] = [];
  const snapshot: LockdownSnapshotEntry[] = [];
  let channels = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!LOCKABLE.has(channel.type) || !("permissionOverwrites" in channel)) continue;
    const overwrites = channel.permissionOverwrites.cache.map((o) => ({
      id: o.id,
      type: o.type as 0 | 1,
      allow: o.allow.bitfield,
      deny: o.deny.bitfield,
    }));
    const plan = planChannelLock(
      channel.id,
      overwrites,
      guild.roles.everyone.id,
      settings.staffRoleIds,
    );
    if (plan.changes.length) channels++;
    changes.push(...plan.changes);
    snapshot.push(...plan.snapshot);
  }

  // Save the snapshot before touching anything, so a crash mid-lock can still be undone.
  await saveLockdownSnapshot(ctx.db, lockdown.id, snapshot, invitesPaused);
  const failed = await applyChanges(guild, changes, auditReason);

  const saved: Lockdown = { ...lockdown, snapshot, invitesPaused };
  ctx.logger.info("Lockdown started", { guildId: guild.id, source: req.source, channels, failed });
  await sendAlert(ctx, guild, lockdownStartedCard(saved, { channels, failed, raid: req.raid }));
  return { ok: true, lockdown: saved, channels, failed };
}

export type UnlockResult =
  | { ok: true; lockdown: Lockdown; restored: number; failed: number }
  | { ok: false; error: string };

export async function unlockGuild(
  ctx: BotContext,
  guild: Guild,
  actor: { id: string; tag: string },
  existing?: Lockdown,
): Promise<UnlockResult> {
  const active = existing ?? (await getActiveLockdown(ctx.db, guild.id));
  if (!active) return { ok: false, error: "No lockdown is active." };

  // Claim the end first, so a manual end racing the auto-unlock restores only once.
  const ended = await endLockdown(ctx.db, active.id, actor.id);
  if (!ended) return { ok: false, error: "That lockdown was already lifted." };

  const auditReason = `${actor.tag}: lift lockdown`;
  const changes = planRestore(ended.snapshot);
  const failed = await applyChanges(guild, changes, auditReason);

  if (ended.invitesPaused) {
    await guild.setIncidentActions({ invitesDisabledUntil: null }).catch((error: unknown) => {
      ctx.logger.warn("Could not resume invites", { guildId: guild.id, error });
    });
  }

  ctx.logger.info("Lockdown lifted", {
    guildId: guild.id,
    restored: changes.length - failed,
    failed,
  });
  const result = { restored: changes.length - failed, failed };
  await sendAlert(ctx, guild, lockdownEndedCard(ended, result));
  return { ok: true, lockdown: ended, ...result };
}

/** Lift lockdowns whose time is up, for guilds this client serves. */
export async function sweepExpiredLockdowns(ctx: BotContext, client: Client<true>) {
  const expired = await listExpiredLockdowns(ctx.db);
  for (const lockdown of expired) {
    const guild = client.guilds.cache.get(lockdown.guildId);
    if (!guild) continue;
    await unlockGuild(ctx, guild, { id: client.user.id, tag: "Auto-unlock" }, lockdown).catch(
      (error) => ctx.logger.error("Auto-unlock failed", { guildId: guild.id, error }),
    );
  }
}

// --- Anti-raid -------------------------------------------------------------

const tracker = new JoinRateTracker();
/** After a raid triggers, stay quiet for this long so one raid gives one alert. */
const RAID_COOLDOWN_MS = 5 * 60_000;
const raidCooldownUntil = new Map<string, number>();

/** Is a raid being handled in this server right now? Welcomes stay quiet while it is. */
export const raidUnderway = (guildId: string, now = Date.now()) =>
  (raidCooldownUntil.get(guildId) ?? 0) > now;

export async function handleMemberJoin(ctx: BotContext, member: GuildMember) {
  const { guild } = member;
  const settings = await cachedGatehouseSettings(ctx, guild.id);
  const now = Date.now();
  const inCooldown = (raidCooldownUntil.get(guild.id) ?? 0) > now;

  if (settings.antiRaidEnabled && !inCooldown) {
    const joins = tracker.record(guild.id, settings.raidWindowSeconds * 1000, now);
    if (joins >= settings.raidJoinCount) {
      raidCooldownUntil.set(guild.id, now + RAID_COOLDOWN_MS);
      tracker.reset(guild.id);
      const raid = { joins, windowSeconds: settings.raidWindowSeconds };
      ctx.logger.warn("Raid detected", { guildId: guild.id, ...raid });

      if (settings.raidResponse === "lockdown") {
        const me = guild.members.me ?? (await guild.members.fetchMe());
        const result = await lockGuild(ctx, guild, {
          source: "anti_raid",
          reason: `Anti-raid: ${joins} joins in ${settings.raidWindowSeconds} s`,
          actorId: me.id,
          actorTag: "Anti-raid",
          durationMinutes: settings.autoUnlockMinutes || null,
          pauseInvites: true,
          raid,
        });
        if (!result.ok)
          await sendAlert(ctx, guild, raidAlertCard(joins, settings.raidWindowSeconds));
      } else {
        await sendAlert(ctx, guild, raidAlertCard(joins, settings.raidWindowSeconds));
      }
      return;
    }
  }

  // During a raid one summary beats a flag per account.
  if (settings.flagAccountAgeDays > 0 && !inCooldown) {
    const days = accountAgeDays(member.user.createdTimestamp, now);
    if (days < settings.flagAccountAgeDays) {
      await sendAlert(
        ctx,
        guild,
        newAccountFlagCard(
          { id: member.id, username: member.user.username, createdAt: member.user.createdAt },
          days,
        ),
      );
    }
  }
}

// --- Verification ----------------------------------------------------------

export async function verifyMember(ctx: BotContext, member: GuildMember): Promise<string> {
  const settings = await getGatehouseSettings(ctx.db, member.guild.id);
  if (!settings.verifyRoleId) return "Verification is off in this server.";
  const role = member.guild.roles.cache.get(settings.verifyRoleId);
  if (!role) return "The verified role was deleted. Ask a moderator to run /verify setup again.";
  if (member.roles.cache.has(role.id)) return "You're already verified.";

  const days = accountAgeDays(member.user.createdTimestamp);
  if (days < settings.verifyMinAccountAgeDays) {
    const ready = new Date(
      member.user.createdTimestamp + settings.verifyMinAccountAgeDays * 86_400_000,
    );
    return `Your account is ${describeAccountAge(days)}. This server needs accounts at least ${settings.verifyMinAccountAgeDays} days old. Try again <t:${Math.floor(ready.getTime() / 1000)}:R>.`;
  }

  const me = member.guild.members.me ?? (await member.guild.members.fetchMe());
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    return `I can't give <@&${role.id}>: my role sits below it. Ask a moderator to drag Garrison above it in Server Settings → Roles.`;
  }
  await member.roles.add(role, "Passed verification");
  return "Verified. Welcome in.";
}
