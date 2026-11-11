import { randomInt } from "node:crypto";
import { awardXp, getRanksSettings, listRankRewards, type RanksSettings } from "@garrison/db";
import type { GuildMember, Message } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { toV2 } from "../../lib/v2.js";
import { earnedRewards, rewardProblem, XP_COOLDOWN_MS, XP_MAX, XP_MIN } from "./rules.js";

const SETTINGS_TTL_MS = 60_000;
const settingsCache = new Map<string, { settings: RanksSettings; at: number }>();
/** Skip the database for members who just earned XP. The database cooldown is still the authority. */
const recent = new Map<string, number>();

export async function cachedRanksSettings(ctx: BotContext, guildId: string) {
  const hit = settingsCache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.settings;
  const settings = await getRanksSettings(ctx.db, guildId);
  settingsCache.set(guildId, { settings, at: Date.now() });
  return settings;
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

  await ensureGuild(ctx, message.guild);
  const result = await awardXp(
    ctx.db,
    message.guildId,
    { id: message.author.id, username: message.author.username },
    randomInt(XP_MIN, XP_MAX + 1),
    XP_COOLDOWN_MS,
  );
  if (!result.awarded || !result.leveledUpTo) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  const given = member ? await grantRewards(ctx, member, result.leveledUpTo) : [];
  if (settings.announce === "off") return;

  const roles = given.length ? ` and got ${given.map((id) => `<@&${id}>`).join(" ")}` : "";
  const text = `<@${message.author.id}> reached level ${result.leveledUpTo}${roles}.`;
  const target =
    settings.announce === "channel" && settings.announceChannelId
      ? message.guild.channels.cache.get(settings.announceChannelId)
      : message.channel;
  // The client's default allowedMentions means this never pings.
  if (target?.isSendable())
    await target.send(toV2({ embeds: [brandEmbed({ description: text })] })).catch(() => {});
}
