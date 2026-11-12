import {
  claimStarPost,
  type Entitlements,
  entitlements,
  getGuildPlan,
  getStarboard,
  getStarPost,
  reachesBoard,
  releaseStarPost,
  type StarboardConfig,
  setStarCount,
  setStarMessage,
  starboardAccent,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  type Message,
  MessageFlags,
  type MessageReaction,
  type PartialMessageReaction,
  PermissionFlagsBits,
  TextDisplayBuilder,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { safeText } from "../../lib/text.js";

/**
 * Honors (starboard). On each reaction with the server's emoji, the message's
 * count is checked; once it reaches the threshold the message is reposted to the
 * board, and later reactions update the count. Only IDs and the count are stored.
 */

const SETTINGS_TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: StarboardConfig }>();
async function config(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value;
  const value = await getStarboard(ctx.db, guildId);
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

const TEXT_MAX = 1500;
const IMAGE = /\.(png|jpe?g|gif|webp)(\?|$)/i;

/** The repost: who and where, the message's text and first image, and a link back. */
export function starMessage(message: Message<true>, stars: number, emoji: string, accent: string) {
  const author = message.member?.displayName ?? message.author.username;
  const text =
    message.content.length > TEXT_MAX ? `${message.content.slice(0, TEXT_MAX)}…` : message.content;
  const image = [...message.attachments.values()].find(
    (a) => a.contentType?.startsWith("image/") || IMAGE.test(a.name),
  );
  const container = new ContainerBuilder()
    .setAccentColor(Number.parseInt(accent.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${emoji} ${stars}** · ${safeText(author)} in <#${message.channelId}>`,
      ),
    );
  // The author's own words, as they wrote them: mentions show but never ping.
  if (text) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  if (image)
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image.url)),
    );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(message.url)
        .setLabel("Jump to message"),
    ),
  );
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [] },
  };
}

/** A reaction was added or removed. Never throws: the starboard must not break the bot. */
export async function onStarReaction(
  ctx: BotContext,
  raw: MessageReaction | PartialMessageReaction,
) {
  const reaction = raw.partial ? await raw.fetch().catch(() => null) : raw;
  if (!reaction) return;
  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  if (!message?.inGuild() || message.author.bot || message.system) return;
  const cfg = await config(ctx, message.guildId);
  if (!cfg.enabled || !cfg.channelId || reaction.emoji.name !== cfg.emoji) return;
  if (message.channelId === cfg.channelId || cfg.ignoredChannelIds.includes(message.channelId))
    return;
  const board = message.guild.channels.cache.get(cfg.channelId);
  if (!board?.isSendable() || !board.isTextBased()) return;
  // Never move a message from an age-restricted channel onto a board that isn't.
  const nsfw = (c: unknown) => Boolean((c as { nsfw?: boolean }).nsfw);
  if (nsfw(message.channel) && !nsfw(board)) return;

  const existing = await getStarPost(ctx.db, message.guildId, message.id);
  // Below the threshold and not on the board: nothing to do, and no need to ask who reacted.
  if (!existing && reaction.count < cfg.threshold) return;
  const authorReacted =
    !cfg.selfStar &&
    (await reaction.users.fetch({ limit: 100 }).catch(() => null))?.has(message.author.id);
  const { stars, on } = reachesBoard(cfg, reaction.count, Boolean(authorReacted));
  const ent: Entitlements = entitlements(await getGuildPlan(ctx.db, message.guildId));
  const payload = () => starMessage(message, stars, cfg.emoji, starboardAccent(cfg, ent));

  if (existing) {
    if (existing.stars === stars) return;
    await setStarCount(ctx.db, message.guildId, message.id, stars);
    if (!existing.starMessageId) return;
    const posted = await board.messages.fetch(existing.starMessageId).catch(() => null);
    await posted?.edit(payload()).catch(() => null);
    return;
  }
  if (!on) return;
  const me = message.guild.members.me ?? (await message.guild.members.fetchMe());
  if (
    !board
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
  )
    return;
  // Claimed first, so two reactions at once can't post the message twice.
  const claimed = await claimStarPost(ctx.db, {
    guildId: message.guildId,
    messageId: message.id,
    channelId: message.channelId,
    authorId: message.author.id,
    stars,
  });
  if (!claimed) return;
  const posted = await board.send(payload()).catch((error: unknown) => {
    ctx.logger.warn("Starboard post failed", { guildId: message.guildId, error });
    return null;
  });
  if (posted) await setStarMessage(ctx.db, message.guildId, message.id, posted.id);
  else await releaseStarPost(ctx.db, message.guildId, message.id);
}
