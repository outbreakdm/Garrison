import {
  claimSend,
  dueOccurrence,
  type Entitlements,
  entitlements,
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

async function post(guild: Guild, channelId: string, m: SavedMessage, ent: Entitlements) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isSendable()) return null;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (
    !channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
  )
    return null;
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
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased())
    return { ok: false, message: "Pick a text channel." };
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed))
    return { ok: false, message: "You can't post in that channel, so Garrison won't either." };
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const send = { guildId: guild.id, messageId: m.id, occurrence: new Date() };
  await claimSend(ctx.db, { ...send, channelId: channel.id });
  const sent = await post(guild, channel.id, m, ent).catch(() => null);
  if (!sent) {
    // Nothing went out, so this mustn't count as a send (it would hide a scheduled one).
    await releaseSend(ctx.db, send);
    return { ok: false, message: "Garrison can't post in that channel. Check its permissions." };
  }
  await recordSentMessage(ctx.db, send, sent.id);
  return { ok: true, message: `Posted ${m.name} in #${channel.name}.` };
}
