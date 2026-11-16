import {
  claimSend,
  dueOccurrence,
  type Entitlements,
  entitlements,
  findSendByDiscordId,
  getGuildPlan,
  getMessages,
  getOpsTimezone,
  lastSends,
  listScheduledMessages,
  pausedSchedules,
  readMessages,
  recordSentMessage,
  releaseSend,
  type SavedMessage,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  type MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { customCardMessage } from "../../lib/card.js";

/**
 * Dispatch (message builder): saved cards posted now from the dashboard, or on
 * their schedule by the minute sweep. Every send is claimed in message_sends
 * before it's posted, so a restart or a second sweep never posts twice.
 */

/** The message as Discord gets it. Link buttons are Pro: on Free they pause. */
export function dispatchMessage(m: SavedMessage, ent: Entitlements) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] =
    ent["messages.extras"] && m.buttons.length
      ? [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            m.buttons.map((b) =>
              new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link),
            ),
          ),
        ]
      : [];
  return customCardMessage(m.card, ent, rows);
}

/** A channel or thread of this server, cached or asked of Discord (archived threads aren't cached). */
async function target(guild: Guild, id: string) {
  const ch = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
  return ch && ch.guildId === guild.id ? ch : null;
}

const isForum = (type: ChannelType) =>
  type === ChannelType.GuildForum || type === ChannelType.GuildMedia;

/** What posting there takes: a forum takes Send Messages to start a post; a thread, its own. */
const needs = (ch: { type: ChannelType; isThread(): boolean }) => [
  PermissionFlagsBits.ViewChannel,
  ch.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
];

/**
 * Post a saved message: in a text channel or a thread (an archived one opens again), or as
 * a new post in a forum, with the message's title and tags. Returns the posted message's ID
 * (a forum post's first message shares the post's ID).
 */
async function post(
  guild: Guild,
  channelId: string,
  m: SavedMessage,
  ent: Entitlements,
): Promise<{ id: string } | null> {
  const channel = await target(guild, channelId);
  if (!channel) return null;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!channel.permissionsFor(me)?.has(needs(channel))) return null;
  if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
    if (!m.forumPost) return null;
    const known = new Set(channel.availableTags.map((t) => t.id));
    const thread = await channel.threads.create({
      name: m.forumPost.title,
      message: dispatchMessage(m, ent),
      appliedTags: m.forumPost.tagIds.filter((id) => known.has(id)),
      reason: `Message builder: ${m.name}`,
    });
    return { id: thread.id };
  }
  if (!channel.isSendable()) return null;
  return channel.send(dispatchMessage(m, ent));
}

/** The minute sweep: post whatever schedule is due, once. */
export async function sweepMessages(ctx: BotContext, client: Client<true>, now = new Date()) {
  for (const row of await listScheduledMessages(ctx.db)) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const messages = readMessages(row.messages).filter((m) => m.schedule && m.channelId);
    if (!messages.length) continue;
    const [plan, tz, last] = await Promise.all([
      getGuildPlan(ctx.db, guild.id),
      getOpsTimezone(ctx.db, guild.id),
      lastSends(ctx.db, guild.id),
    ]);
    const ent = entitlements(plan);
    const paused = pausedSchedules(messages, ent);
    for (const m of messages) {
      if (!m.schedule || !m.channelId || paused.has(m.id)) continue;
      // A repeat saved on Pro pauses on Free rather than turning into a one-off.
      if (m.schedule.repeat !== "none" && !ent["messages.extras"]) continue;
      const occurrence = dueOccurrence(m.schedule, tz, last.get(m.id) ?? null, now);
      if (!occurrence) continue;
      const send = { guildId: guild.id, messageId: m.id, occurrence };
      if (!(await claimSend(ctx.db, { ...send, channelId: m.channelId }))) continue;
      // A failed post gives its claim back, so the next sweep retries it (within the hour).
      const sent = await post(guild, m.channelId, m, ent).catch((error: unknown) => {
        ctx.logger.error("Scheduled message failed", { guildId: guild.id, messageId: m.id, error });
        return null;
      });
      if (sent) await recordSentMessage(ctx.db, send, sent.id);
      else await releaseSend(ctx.db, send);
    }
  }
}

const postNow = z.object({
  messageId: z.string().regex(/^[a-z0-9]{6,16}$/),
  channelId: z.string().regex(/^\d{17,20}$/),
  /** A message Garrison posted before, to update instead of posting anew. */
  edit: z
    .string()
    .regex(/^\d{17,20}$/)
    .nullish(),
});

/** "Post now" from the dashboard, checked again here with the requester's own permissions. */
export async function postMessageNow(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<{ ok: boolean; message: string }> {
  const p = postNow.safeParse(raw);
  if (!p.success) return { ok: false, message: "That request wasn't valid." };
  const m = readMessages(await getMessages(ctx.db, guild.id)).find(
    (x) => x.id === p.data.messageId,
  );
  if (!m) return { ok: false, message: "That message was removed. Refresh the page." };
  const channel = await target(guild, p.data.channelId);
  if (!channel || !(channel.isTextBased() || isForum(channel.type)))
    return { ok: false, message: "Pick a text channel, a thread or a forum." };
  if (!channel.permissionsFor(member)?.has(needs(channel)))
    return { ok: false, message: "You can't post in that channel, so Garrison won't either." };
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  if (p.data.edit) {
    // Only a message Garrison posted from the message builder, in this server.
    if (!(await findSendByDiscordId(ctx.db, guild.id, p.data.edit)) || !channel.isTextBased())
      return { ok: false, message: "Garrison only updates messages it posted from Messages." };
    const old = await channel.messages.fetch(p.data.edit).catch(() => null);
    if (!old || old.author.id !== guild.client.user.id)
      return { ok: false, message: "That message is gone, or Garrison didn't post it." };
    await old.edit(dispatchMessage(m, ent));
    return { ok: true, message: `Updated the message with ${m.name}.` };
  }
  if (isForum(channel.type) && !m.forumPost)
    return { ok: false, message: "Give it a forum post title first (Where and when)." };
  const send = { guildId: guild.id, messageId: m.id, occurrence: new Date() };
  await claimSend(ctx.db, { ...send, channelId: channel.id });
  const sent = await post(guild, channel.id, m, ent).catch(() => null);
  if (!sent) {
    // Nothing went out, so this mustn't count as a send (it would hide a scheduled one).
    await releaseSend(ctx.db, send);
    return { ok: false, message: "Garrison can't post in that channel. Check its permissions." };
  }
  await recordSentMessage(ctx.db, send, sent.id);
  return {
    ok: true,
    message: isForum(channel.type)
      ? `Started a post in ${channel.name}.`
      : `Posted ${m.name} in ${channel.isThread() ? "the thread" : "#"}${channel.name}.`,
  };
}
