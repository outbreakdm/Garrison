import {
  activeClearRules,
  activeStickies,
  type ClearRule,
  clearStickyPost,
  dueTempRoles,
  entitlements,
  getGuildPlan,
  getStickyPost,
  getUtilitySettings,
  listClearingGuilds,
  pruneRoleSnapshots,
  readClearRules,
  readStickies,
  removeTimedRole,
  type Sticky,
  saveRoleSnapshot,
  setStickyPost,
  takeRoleSnapshot,
} from "@garrison/db";
import {
  type Client,
  type Collection,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type PartialGuildMember,
  PermissionFlagsBits,
  type Snowflake,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { grantableRoles } from "../applications/service.js";

/**
 * Role and channel tools (best bot item 6; packages/db utilities.ts). Settings are kept for
 * 30 s, like the auto-responders'. Roles come back on rejoin only when the server turned it
 * on, and never one Garrison couldn't give by hand (a bot's, one above it, or a moderator's).
 */

const SETTINGS_TTL_MS = 30_000;
/** How long a sticky waits after the last message before it's posted again. */
export const STICKY_WAIT_MS = 10_000;
/** How often each self-clearing channel is cleared. */
const CLEAR_EVERY_MS = 10 * 60_000;
/** Discord deletes in bulk only messages younger than 14 days (a little margin kept). */
const BULK_MAX_AGE_MS = 14 * 86_400_000 - 10 * 60_000;
/** Older ones go one at a time, a few a run, so a big backlog doesn't hold up the sweep. */
const SINGLE_DELETES = 10;
const PAGES = 5;

type Config = {
  restoreRoles: boolean;
  skip: Set<string>;
  stickies: Sticky[];
  clearing: ClearRule[];
};
const cache = new Map<string, { at: number; config: Config }>();

export async function utilityConfig(ctx: BotContext, guildId: string): Promise<Config> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.config;
  const [s, plan] = await Promise.all([
    getUtilitySettings(ctx.db, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  const ent = entitlements(plan);
  const config: Config = {
    restoreRoles: s.restoreRoles,
    skip: new Set(s.restoreSkipRoleIds),
    stickies: activeStickies(readStickies(s.stickies), ent),
    clearing: activeClearRules(readClearRules(s.clearing), ent),
  };
  cache.set(guildId, { at: Date.now(), config });
  return config;
}

/** The roles worth keeping when someone leaves: not @everyone, not a bot's own role. */
export const rolesToKeep = (member: GuildMember | PartialGuildMember) =>
  [...member.roles.cache.values()]
    .filter((r) => r.id !== member.guild.id && !r.managed)
    .map((r) => r.id);

export async function onUtilityLeave(ctx: BotContext, member: GuildMember | PartialGuildMember) {
  if (member.user?.bot) return;
  const config = await utilityConfig(ctx, member.guild.id);
  if (!config.restoreRoles) return;
  // A member Discord didn't send in full has no roles to keep.
  if (member.partial && !member.roles.cache.size) return;
  await saveRoleSnapshot(ctx.db, {
    guildId: member.guild.id,
    userId: member.id,
    roleIds: rolesToKeep(member),
  });
}

/** A rejoining member gets back what they had, once; a role skipped or unsafe stays off. */
export async function onUtilityJoin(ctx: BotContext, member: GuildMember) {
  if (member.user.bot) return;
  const config = await utilityConfig(ctx, member.guild.id);
  if (!config.restoreRoles) return;
  const ids = await takeRoleSnapshot(ctx.db, member.guild.id, member.id);
  if (!ids.length) return;
  const roles = grantableRoles(member.guild, ids).filter((r) => !config.skip.has(r.id));
  if (!roles.length) return;
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
  await member.roles.add(roles, "Garrison: roles back on rejoin");
}

const waiting = new Set<string>();

/** After chat in a channel with a sticky, it's posted again at the bottom, once things settle. */
export async function onStickyMessage(ctx: BotContext, message: Message) {
  if (!message.inGuild() || message.author.id === message.client.user.id) return;
  const config = await utilityConfig(ctx, message.guildId);
  const sticky = config.stickies.find((s) => s.channelId === message.channelId);
  if (!sticky || waiting.has(message.channelId)) return;
  waiting.add(message.channelId);
  const channel = message.channel;
  setTimeout(() => {
    void repostSticky(ctx, channel, message.guildId)
      .catch((error: unknown) =>
        ctx.logger.warn("Sticky message failed", { guildId: message.guildId, error }),
      )
      .finally(() => waiting.delete(channel.id));
  }, STICKY_WAIT_MS);
}

async function repostSticky(ctx: BotContext, channel: GuildTextBasedChannel, guildId: string) {
  // Read again: it may have been changed or removed while it waited.
  const sticky = (await utilityConfig(ctx, guildId)).stickies.find(
    (s) => s.channelId === channel.id,
  );
  if (!sticky) return;
  const before = await getStickyPost(ctx.db, channel.id);
  if (before && channel.lastMessageId === before.messageId) return;
  const me = channel.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.ViewChannel))
    return;
  if (before)
    await channel.messages.delete(before.messageId).catch(async () => {
      await clearStickyPost(ctx.db, channel.id);
    });
  const sent = await channel.send({ content: sticky.text, allowedMentions: { parse: [] } });
  await setStickyPost(ctx.db, { guildId, channelId: channel.id, messageId: sent.id });
}

/** The messages a self-clearing channel removes now: old enough, and not pinned if kept. */
export function messagesToClear(
  messages: { id: string; createdTimestamp: number; pinned: boolean }[],
  rule: Pick<ClearRule, "hours" | "keepPinned">,
  now = Date.now(),
) {
  const cutoff = now - rule.hours * 3_600_000;
  const due = messages.filter((m) => m.createdTimestamp < cutoff && !(rule.keepPinned && m.pinned));
  return {
    bulk: due.filter((m) => now - m.createdTimestamp < BULK_MAX_AGE_MS).map((m) => m.id),
    single: due
      .filter((m) => now - m.createdTimestamp >= BULK_MAX_AGE_MS)
      .slice(0, SINGLE_DELETES)
      .map((m) => m.id),
  };
}

async function clearChannel(channel: GuildTextBasedChannel, rule: ClearRule, now = Date.now()) {
  const me = channel.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (
    !perms?.has(PermissionFlagsBits.ManageMessages) ||
    !perms.has(PermissionFlagsBits.ReadMessageHistory)
  )
    return 0;
  const seen: Message[] = [];
  let before: Snowflake | undefined;
  for (let page = 0; page < PAGES; page++) {
    const batch: Collection<Snowflake, Message> = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    seen.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last()?.id;
  }
  const { bulk, single } = messagesToClear(seen, rule, now);
  for (let i = 0; i < bulk.length; i += 100) await channel.bulkDelete(bulk.slice(i, i + 100), true);
  for (const id of single) await channel.messages.delete(id).catch(() => null);
  return bulk.length + single.length;
}

const lastCleared = new Map<string, number>();
let lastPrune = 0;

/** Each sweep: timed roles whose time is up, channels due a clear, and old snapshots. */
export async function sweepUtilities(ctx: BotContext, client: Client<true>, now = new Date()) {
  for (const t of await dueTempRoles(ctx.db, now)) {
    const guild = client.guilds.cache.get(t.guildId);
    if (guild) {
      const member = await guild.members.fetch(t.userId).catch(() => null);
      if (member?.roles.cache.has(t.roleId))
        await member.roles
          .remove(t.roleId, "Garrison: timed role ended")
          .catch((error: unknown) =>
            ctx.logger.warn("Couldn't end a timed role", { guildId: t.guildId, error }),
          );
    }
    await removeTimedRole(ctx.db, t.id);
  }
  for (const { guildId } of await listClearingGuilds(ctx.db)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const rule of (await utilityConfig(ctx, guildId)).clearing) {
      if (now.getTime() - (lastCleared.get(rule.id) ?? 0) < CLEAR_EVERY_MS) continue;
      lastCleared.set(rule.id, now.getTime());
      const channel = guild.channels.cache.get(rule.channelId);
      if (!channel?.isTextBased() || channel.isVoiceBased()) continue;
      const removed = await clearChannel(channel, rule, now.getTime()).catch((error: unknown) => {
        ctx.logger.warn("Self-clearing channel failed", { guildId, error });
        return 0;
      });
      if (removed) ctx.logger.info("Self-clearing channel cleared", { guildId, removed });
    }
  }
  if (now.getTime() - lastPrune > 60 * 60_000) {
    lastPrune = now.getTime();
    await pruneRoleSnapshots(ctx.db, now);
  }
}
