import { randomInt } from "node:crypto";
import {
  awardXp,
  boostFor,
  entitlements,
  getGuildPlan,
  getRanksSettings,
  listRankRewards,
  type RankBoost,
  type RanksSettings,
  readBoosts,
} from "@garrison/db";
import type { Guild, GuildBasedChannel, GuildMember, Message } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { earnedRewards, rewardProblem, XP_COOLDOWN_MS, XP_MAX, XP_MIN } from "./rules.js";

const SETTINGS_TTL_MS = 60_000;
const settingsCache = new Map<
  string,
  { settings: RanksSettings; boosts: RankBoost[]; at: number }
>();
/** Skip the database for members who just earned XP. The database cooldown is still the authority. */
const recent = new Map<string, number>();

async function cachedRanks(ctx: BotContext, guildId: string) {
  const hit = settingsCache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit;
  const [settings, plan] = await Promise.all([
    getRanksSettings(ctx.db, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  // Boosts are Pro: on Free they're kept but not applied.
  const boosts = entitlements(plan)["ranks.boosts"] ? readBoosts(settings.boosts) : [];
  const entry = { settings, boosts, at: Date.now() };
  settingsCache.set(guildId, entry);
  return entry;
}

export async function cachedRanksSettings(ctx: BotContext, guildId: string) {
  return (await cachedRanks(ctx, guildId)).settings;
}

/** The boost multiplier for this member in this channel (1 without boosts). */
export async function boostAt(
  ctx: BotContext,
  member: GuildMember | null,
  channel: { id: string; parentId: string | null } | null,
) {
  if (!member) return 1;
  const { boosts } = await cachedRanks(ctx, member.guild.id);
  if (!boosts.length) return 1;
  return boostFor(boosts, {
    roleIds: member.roles.cache.keys(),
    channelId: channel?.id ?? null,
    parentId: channel?.parentId ?? null,
  });
}

/** Rewards and the level-up message, wherever level-ups go (`fallback` for "where they were"). */
export async function celebrateLevel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember | null,
  userId: string,
  level: number,
  settings: RanksSettings,
  fallback: GuildBasedChannel | null,
) {
  const given = member ? await grantRewards(ctx, member, level) : [];
  if (settings.announce === "off") return;
  const roles = given.length ? ` and got ${given.map((id) => `<@&${id}>`).join(" ")}` : "";
  const text = `<@${userId}> reached level ${level}${roles}.`;
  const target =
    settings.announce === "channel" && settings.announceChannelId
      ? guild.channels.cache.get(settings.announceChannelId)
      : fallback;
  // The client's default allowedMentions means this never pings.
  if (target?.isSendable()) await target.send(text).catch(() => {});
}

export function invalidateRanksSettings(guildId: string) {
  settingsCache.delete(guildId);
}

/** Give a member every reward role they've earned, re-checking each role is still safe. */
export async function grantRewards(ctx: BotContext, member: GuildMember, level: number) {
  const rewards = earnedRewards(await listRankRewards(ctx.db, member.guild.id), level);
  const me = member.guild.members.me ?? (await member.guild.members.fetchMe());
  const given: string[] = [];
  for (const reward of rewards) {
    const role = reward.roleId ? member.guild.roles.cache.get(reward.roleId) : undefined;
    if (!role || member.roles.cache.has(role.id)) continue;
    const facts = {
      id: role.id,
      name: role.name,
      managed: role.managed,
      position: role.position,
      permissions: role.permissions.bitfield,
    };
    const problem = rewardProblem(facts, member.guild.roles.everyone.id, me.roles.highest.position);
    if (problem) {
      ctx.logger.warn("Skipped an unsafe level reward", {
        guildId: member.guild.id,
        roleId: role.id,
        problem,
      });
      continue;
    }
    try {
      await member.roles.add(role, `Ranks: reached level ${reward.level}`);
      given.push(role.id);
    } catch (error) {
      ctx.logger.warn("Could not give a level reward", {
        guildId: member.guild.id,
        roleId: role.id,
        error,
      });
    }
  }
  return given;
}

export async function handleMessage(ctx: BotContext, message: Message) {
  if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return;
  const settings = await cachedRanksSettings(ctx, message.guildId);
  if (!settings.enabled) return;

  const key = `${message.guildId}:${message.author.id}`;
  const last = recent.get(key) ?? 0;
  if (Date.now() - last < XP_COOLDOWN_MS) return;
  recent.set(key, Date.now());
  if (recent.size > 50_000) recent.clear();

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  const channel = message.channel.isThread() ? message.channel.parent : message.channel;
  const gain = Math.round(
    randomInt(XP_MIN, XP_MAX + 1) *
      (await boostAt(ctx, member, channel ? { id: channel.id, parentId: channel.parentId } : null)),
  );
  if (gain <= 0) return;

  await ensureGuild(ctx, message.guild);
  const result = await awardXp(
    ctx.db,
    message.guildId,
    { id: message.author.id, username: message.author.username },
    gain,
    XP_COOLDOWN_MS,
  );
  if (!result.awarded || !result.leveledUpTo) return;
  await celebrateLevel(
    ctx,
    message.guild,
    member,
    message.author.id,
    result.leveledUpTo,
    settings,
    message.channel,
  );
}
