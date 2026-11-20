import {
  activeResponders,
  entitlements,
  getGuildPlan,
  getResponders,
  matchResponder,
  type Responder,
  readResponders,
} from "@garrison/db";
import type { Message } from "discord.js";
import type { BotContext } from "../../commands/types.js";

/**
 * Auto-responders (best bot item 3): Garrison answers a word or a phrase with the reply the
 * server wrote on the Messages page. Settings are kept for 30 s, like automod's; each
 * responder waits its cooldown per channel, so a busy chat gets one reply, not one a line.
 */

const SETTINGS_TTL_MS = 30_000;
const cache = new Map<string, { at: number; list: Responder[] }>();
const lastReply = new Map<string, number>();

/** The responders working on a server now: on, and within its plan's limit. */
export async function serverResponders(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.list;
  const [raw, plan] = await Promise.all([
    getResponders(ctx.db, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  const list = activeResponders(readResponders(raw), entitlements(plan));
  cache.set(guildId, { at: Date.now(), list });
  return list;
}

/** Whether a responder may reply in a channel now; takes the slot when it may. */
export function cooledDown(r: Responder, channelId: string, now = Date.now()) {
  const key = `${r.id}:${channelId}`;
  if (now - (lastReply.get(key) ?? 0) < r.cooldownSeconds * 1000) return false;
  lastReply.set(key, now);
  return true;
}

/**
 * A member's message: the first responder it sets off replies, once per cooldown. Never to a
 * bot, a webhook, or a message automod removed.
 */
export async function onResponderMessage(ctx: BotContext, message: Message, removed: boolean) {
  if (removed || !message.inGuild() || message.author.bot || message.webhookId) return;
  if (!message.content.trim()) return;
  const list = await serverResponders(ctx, message.guildId);
  if (!list.length) return;
  const r = matchResponder(list, {
    text: message.content,
    channelId: message.channelId,
    parentId: message.channel.isThread() ? message.channel.parentId : null,
  });
  if (!r || !cooledDown(r, message.channelId)) return;
  if (!message.channel.isSendable()) return;
  await message.channel.send({ content: r.reply, allowedMentions: { parse: [] } });
}
