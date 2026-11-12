import {
  type CustomCard,
  type Entitlements,
  entitlements,
  fillWelcome,
  getActiveLockdown,
  getGuildPlan,
  getWelcome,
} from "@garrison/db";
import type { GuildMember, PartialGuildMember } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { customCardMessage } from "../../lib/card.js";
import { raidUnderway } from "../gatehouse/service.js";
import { menuRoleProblem } from "../roles/menu.js";
import { roleFacts } from "../roles/service.js";

/**
 * Herald (Welcome): a card when someone joins or leaves, a welcome DM (Pro), and
 * roles on join. Quiet during a raid or lockdown, so raiders get no roles and
 * the channel doesn't flood; and at most WELCOMES_PER_MINUTE cards a minute.
 */

export const WELCOMES_PER_MINUTE = 10;
const recent = new Map<string, number[]>();

/** Room for one more card in this server this minute? Records it if so. */
export function takeSlot(guildId: string, now = Date.now()) {
  const times = (recent.get(guildId) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= WELCOMES_PER_MINUTE) {
    recent.set(guildId, times);
    return false;
  }
  times.push(now);
  recent.set(guildId, times);
  return true;
}

async function quiet(ctx: BotContext, guildId: string) {
  return raidUnderway(guildId) || Boolean(await getActiveLockdown(ctx.db, guildId));
}

const vars = (member: GuildMember | PartialGuildMember) => ({
  userId: member.id,
  name: member.displayName ?? member.user?.username ?? "Someone",
  server: member.guild.name,
  count: member.guild.memberCount,
});

/** A card for this member, pinging only them (and only through {user}). */
function message(card: CustomCard, ent: Entitlements, member: GuildMember | PartialGuildMember) {
  return {
    ...customCardMessage(fillWelcome(card, vars(member)), ent),
    allowedMentions: { users: [member.id] },
  };
}

async function sendTo(
  member: GuildMember | PartialGuildMember,
  channelId: string,
  payload: object,
) {
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isSendable()) return;
  await channel.send(payload);
}

export async function welcomeJoin(ctx: BotContext, member: GuildMember) {
  if (member.user.bot) return;
  const { guild } = member;
  const w = await getWelcome(ctx.db, guild.id);
  if (!w.joinEnabled && !w.dmEnabled && !w.joinRoleIds.length) return;
  if (await quiet(ctx, guild.id)) return;
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));

  // Roles first, so the welcome lands with the member already in their channels.
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const top = me.roles.highest.position;
  const give = w.joinRoleIds.slice(0, ent["welcome.roles"]).filter((id) => {
    const role = guild.roles.cache.get(id);
    return !menuRoleProblem(role ? roleFacts(role) : undefined, guild.id, top);
  });
  if (give.length) await member.roles.add(give, "Welcome: roles on join").catch(() => null);

  if (w.joinEnabled && w.joinChannelId && takeSlot(guild.id))
    await sendTo(member, w.joinChannelId, message(w.joinCard, ent, member));
  if (w.dmEnabled && ent["welcome.dm"])
    await member.send(message(w.dmCard, ent, member)).catch(() => null); // DMs may be closed.
}

export async function welcomeLeave(ctx: BotContext, member: GuildMember | PartialGuildMember) {
  if (member.user?.bot) return;
  const w = await getWelcome(ctx.db, member.guild.id);
  if (!w.leaveEnabled || !w.leaveChannelId) return;
  if (await quiet(ctx, member.guild.id)) return;
  if (!takeSlot(member.guild.id)) return;
  const ent = entitlements(await getGuildPlan(ctx.db, member.guild.id));
  // They've left, so the card names them without a mention.
  const card = fillWelcome(w.leaveCard, vars(member), { mention: false });
  await sendTo(member, w.leaveChannelId, customCardMessage(card, ent));
}
