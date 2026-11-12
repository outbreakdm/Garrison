import {
  addWeeksInZone,
  closeLfg,
  createLfgPost,
  getOpsTimezone,
  type LfgMember,
  type LfgPost,
  listActiveMembers,
  listExpiredLfg,
  listLfgRepeatsDue,
  listLfgWithVoice,
  markLfgRepeated,
  renderWording,
  setLfgMessage,
  setLfgVoice,
} from "@garrison/db";
import {
  ChannelType,
  type Client,
  type Guild,
  OverwriteType,
  PermissionFlagsBits,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { cardEdit, cardMessage } from "../../lib/card.js";
import { lfgCard, safeText } from "./card.js";
import { voiceChannelName } from "./parse.js";
import { postWording } from "./templates.js";

/** Empty squad voice channels are removed after this long. */
const VOICE_IDLE_MS = 5 * 60_000;

/** Re-render a post's card in place. Missing messages are ignored. */
export async function refreshCard(
  ctx: BotContext,
  guild: Guild,
  post: LfgPost,
  members?: LfgMember[],
) {
  if (!post.messageId) return;
  try {
    const channel = guild.channels.cache.get(post.channelId);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(post.messageId);
    // Posts from before the switch to V2 stay embeds until they close.
    await message.edit(
      cardEdit(message, lfgCard(post, members ?? (await listActiveMembers(ctx.db, post.id)))),
    );
  } catch (error) {
    ctx.logger.debug("Could not refresh an LFG card", { postId: post.id, error });
  }
}

/**
 * The squad is full: open a voice channel only its members can join, and
 * ping exactly those members. Nobody else is mentioned.
 */
export async function announceFullSquad(
  ctx: BotContext,
  guild: Guild,
  post: LfgPost,
  members: LfgMember[],
) {
  const channel = guild.channels.cache.get(post.channelId);
  if (!channel?.isSendable()) return;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const memberIds = members.map((m) => m.userId);

  const w = postWording(post.wording);
  let voiceId = post.voiceChannelId;
  const canCreate = me.permissions.has([
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.Connect,
  ]);
  if (!voiceId && canCreate && w.voice) {
    try {
      const parent = "parentId" in channel ? channel.parentId : null;
      const voice = await guild.channels.create({
        name: voiceChannelName(post.title),
        type: ChannelType.GuildVoice,
        parent: parent ?? undefined,
        userLimit: Math.min(99, memberIds.length),
        reason: `Rally: squad full for "${voiceChannelName(post.title)}"`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.Connect],
          },
          {
            id: me.id,
            type: OverwriteType.Member,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
          ...memberIds.map((id) => ({
            id,
            type: OverwriteType.Member,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          })),
        ],
      });
      voiceId = voice.id;
      await setLfgVoice(ctx.db, post.id, voice.id);
    } catch (error) {
      ctx.logger.warn("Could not open a squad voice channel", { guildId: guild.id, error });
    }
  }

  const pings = memberIds.map((id) => `<@${id}>`).join(" ");
  await channel
    .send({
      content: voiceId
        ? `${safeText(renderWording(w.full, w, { title: post.title }))} Voice is open: <#${voiceId}>\n${pings}`
        : `${safeText(renderWording(w.full, w, { title: post.title }))}\n${pings}`,
      // Ping the squad and nobody else.
      allowedMentions: { users: memberIds, roles: [], parse: [] },
    })
    .catch((error: unknown) => ctx.logger.warn("Could not announce a full squad", { error }));
}

/** Keep the squad voice channel's access in step with who's in the group. */
export async function syncVoiceAccess(
  guild: Guild,
  post: LfgPost,
  userId: string,
  joined: boolean,
) {
  if (!post.voiceChannelId) return;
  const voice = guild.channels.cache.get(post.voiceChannelId);
  if (!voice || voice.type !== ChannelType.GuildVoice) return;
  if (joined) {
    await voice.permissionOverwrites
      .edit(
        userId,
        { ViewChannel: true, Connect: true, Speak: true },
        { type: OverwriteType.Member },
      )
      .catch(() => {});
  } else {
    await voice.permissionOverwrites.delete(userId).catch(() => {});
  }
}

/**
 * Next week's post for a weekly group whose run is over: same local time in the
 * server's time zone, same wording, the host back in their seat and everyone else
 * free to join again. If the host has another group open, it waits for that one.
 */
export async function repostWeekly(ctx: BotContext, client: Client<true>, now = new Date()) {
  for (const post of await listLfgRepeatsDue(ctx.db, now)) {
    const guild = client.guilds.cache.get(post.guildId);
    const channel = guild?.channels.cache.get(post.channelId);
    if (!guild || !channel?.isSendable()) {
      await markLfgRepeated(ctx.db, post.id, now); // the channel is gone: the repeat ends
      continue;
    }
    const tz = await getOpsTimezone(ctx.db, guild.id);
    let startsAt = addWeeksInZone(post.startsAt, 1, tz);
    while (startsAt.getTime() <= now.getTime()) startsAt = addWeeksInZone(startsAt, 1, tz);
    const hostSeat = (await listActiveMembers(ctx.db, post.id)).find(
      (m) => m.userId === post.hostId,
    );
    const next = await createLfgPost(ctx.db, {
      guildId: guild.id,
      channelId: post.channelId,
      hostId: post.hostId,
      hostSlot: hostSeat?.slotName ?? post.slots[0]?.name ?? "",
      title: post.title,
      note: post.note,
      slots: post.slots,
      startsAt,
      expiresAt: new Date(
        startsAt.getTime() + (post.expiresAt.getTime() - post.startsAt.getTime()),
      ),
      templateId: post.templateId,
      wording: post.wording,
      repeatWeekly: true,
    });
    if (!next) continue;
    await markLfgRepeated(ctx.db, post.id, now);
    try {
      const message = await channel.send(
        cardMessage(lfgCard(next, await listActiveMembers(ctx.db, next.id))),
      );
      await setLfgMessage(ctx.db, next.id, message.id);
    } catch (error) {
      ctx.logger.warn("Could not post next week's group", { postId: next.id, error });
    }
  }
}

/** Expire stale posts, repost weekly ones, and delete empty squad voice channels Garrison made. */
export async function sweepRally(ctx: BotContext, client: Client<true>) {
  for (const post of await listExpiredLfg(ctx.db)) {
    const guild = client.guilds.cache.get(post.guildId);
    if (!guild) continue;
    const closed = await closeLfg(ctx.db, post.id, "expired");
    if (closed) await refreshCard(ctx, guild, closed);
  }
  await repostWeekly(ctx, client).catch((error: unknown) =>
    ctx.logger.warn("Weekly group repost failed", { error }),
  );

  for (const post of await listLfgWithVoice(ctx.db)) {
    const guild = client.guilds.cache.get(post.guildId);
    if (!guild || !post.voiceChannelId) continue;
    const voice = guild.channels.cache.get(post.voiceChannelId);
    // Only ever touch the channel this post recorded, and only if it's still a voice channel.
    if (!voice || voice.type !== ChannelType.GuildVoice) {
      await setLfgVoice(ctx.db, post.id, null);
      continue;
    }
    const idle = voice.members.size === 0 && Date.now() - voice.createdTimestamp > VOICE_IDLE_MS;
    if (idle) {
      try {
        await voice.delete("Rally: squad voice channel empty");
        await setLfgVoice(ctx.db, post.id, null);
      } catch (error) {
        ctx.logger.warn("Could not delete a squad voice channel", { guildId: guild.id, error });
      }
    }
  }
}
