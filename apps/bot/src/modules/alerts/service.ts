import {
  type AlertFeed,
  type AlertStateRow,
  alertHeading,
  alertLook,
  claimAlertItem,
  type Entitlements,
  entitlements,
  fillAlert,
  getAlertFeeds,
  getGuildPlan,
  isFeedPaused,
  listAlertSettings,
  listAlertState,
  noteAlertCheck,
  readAlertFeeds,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  ContainerBuilder,
  type Guild,
  type GuildMember,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { safeText } from "../../lib/text.js";
import {
  type LiveStream,
  resolveYoutubeHandle,
  twitchLive,
  type Video,
  youtubeThumbnail,
  youtubeVideos,
} from "./providers.js";

/**
 * Beacon: the minute sweep checks Twitch every 2 minutes and YouTube every 5,
 * once per watched channel however many servers watch it, then posts where
 * something is new. A first check only records what's there, so adding a feed
 * never posts an old video.
 */

export interface AlertKeys {
  twitch: { clientId: string; secret: string } | null;
}

const TWITCH_EVERY_MS = 2 * 60_000;
const YOUTUBE_EVERY_MS = 5 * 60_000;
/** A video older than this when first noticed is recorded, not announced. */
const FRESH_MS = 24 * 3_600_000;
let lastTwitch = 0;
let lastYoutube = 0;

export interface AlertItem {
  id: string;
  name: string;
  title: string;
  game: string;
  url: string;
  thumbnail: string;
}

/** The alert as Discord gets it: heading, the feed's words, the thumbnail and a link button. */
export function alertMessage(feed: AlertFeed, ent: Entitlements, item: AlertItem) {
  const look = alertLook(feed, ent);
  const values = { name: item.name, title: item.title, game: item.game, url: item.url };
  const container = new ContainerBuilder()
    .setAccentColor(Number.parseInt(look.accent.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${safeText(alertHeading(feed.provider, item.name))}`,
      ),
      new TextDisplayBuilder().setContent(fillAlert(look.text, values, safeText).slice(0, 1800)),
    );
  if (item.thumbnail)
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(item.thumbnail)
          .setDescription(item.title.slice(0, 200)),
      ),
    );
  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(item.url)
          .setLabel(feed.provider === "twitch" ? "Watch on Twitch" : "Watch on YouTube"),
      ),
    );
  const components = feed.roleId
    ? [new TextDisplayBuilder().setContent(`<@&${feed.roleId}>`), container]
    : [container];
  return {
    components,
    flags: MessageFlags.IsComponentsV2 as const,
    // The one ping an alert makes: the role the server picked. Never @everyone.
    allowedMentions: { parse: [], roles: feed.roleId ? [feed.roleId] : [] },
  };
}

async function post(guild: Guild, feed: AlertFeed, ent: Entitlements, item: AlertItem) {
  const channel = guild.channels.cache.get(feed.channelId);
  if (!channel?.isSendable()) return false;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]))
    return false;
  await channel.send(alertMessage(feed, ent, item));
  return true;
}

interface Watched {
  guild: Guild;
  feed: AlertFeed;
  ent: Entitlements;
  state: AlertStateRow | undefined;
}

/** Every active feed in servers Garrison is in, with its plan and what was last seen. */
async function watched(ctx: BotContext, client: Client<true>): Promise<Watched[]> {
  const [rows, states] = await Promise.all([listAlertSettings(ctx.db), listAlertState(ctx.db)]);
  const stateOf = new Map(states.map((s) => [`${s.guildId}:${s.feedId}`, s]));
  const out: Watched[] = [];
  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
    readAlertFeeds(row.feeds).forEach((feed, i) => {
      if (!isFeedPaused(i, ent))
        out.push({ guild, feed, ent, state: stateOf.get(`${guild.id}:${feed.id}`) });
    });
  }
  return out;
}

const key = (w: Watched) => ({ guildId: w.guild.id, feedId: w.feed.id });

export async function sweepTwitch(ctx: BotContext, list: Watched[], keys: AlertKeys) {
  const feeds = list.filter((w) => w.feed.provider === "twitch");
  if (!feeds.length) return;
  if (!keys.twitch) {
    for (const w of feeds)
      if (w.state?.problem !== "not_configured")
        await noteAlertCheck(ctx.db, key(w), { problem: "not_configured" });
    return;
  }
  const live = await twitchLive(keys.twitch, [...new Set(feeds.map((w) => w.feed.handle))]);
  for (const w of feeds) {
    const stream: LiveStream | undefined = live.get(w.feed.handle);
    if (!stream) {
      if (w.state?.liveSince || w.state?.problem)
        await noteAlertCheck(ctx.db, key(w), { liveSince: null, problem: null });
      continue;
    }
    // Each stream is announced once: its ID is swapped in before posting.
    if (
      !(await claimAlertItem(ctx.db, key(w), stream.id, {
        post: true,
        liveSince: stream.startedAt,
      }))
    )
      continue;
    await post(w.guild, w.feed, w.ent, {
      id: stream.id,
      name: stream.name,
      title: stream.title,
      game: stream.game,
      url: `https://www.twitch.tv/${stream.login}`,
      thumbnail: stream.thumbnail ? `${stream.thumbnail}?t=${Date.now()}` : "",
    }).catch((error: unknown) =>
      ctx.logger.warn("Twitch alert failed to post", { guildId: w.guild.id, error }),
    );
  }
}

export async function sweepYoutube(ctx: BotContext, list: Watched[], now = new Date()) {
  const feeds = list.filter((w) => w.feed.provider === "youtube");
  // Resolve @handles once, and read each channel's feed once.
  const channelOf = new Map<Watched, string | null>();
  for (const w of feeds) {
    if (w.feed.handle.startsWith("UC")) channelOf.set(w, w.feed.handle);
    else if (w.state?.resolvedId) channelOf.set(w, w.state.resolvedId);
    else {
      const id = await resolveYoutubeHandle(w.feed.handle).catch(() => undefined);
      if (id === undefined) continue; // YouTube didn't answer: try again next time.
      await noteAlertCheck(ctx.db, key(w), { resolvedId: id, problem: id ? null : "not_found" });
      channelOf.set(w, id);
    }
  }
  const videosOf = new Map<string, Video[] | null>();
  for (const id of new Set([...channelOf.values()].filter((v): v is string => Boolean(v)))) {
    const videos = await youtubeVideos(id).catch((error: unknown) => {
      ctx.logger.warn("YouTube feed failed", { channelId: id, error });
      return undefined;
    });
    if (videos !== undefined) videosOf.set(id, videos);
  }
  for (const w of feeds) {
    const channelId = channelOf.get(w);
    if (!channelId) continue;
    const videos = videosOf.get(channelId);
    if (videos === undefined) continue;
    if (videos === null) {
      await noteAlertCheck(ctx.db, key(w), { problem: "not_found" });
      continue;
    }
    const newest = videos[0];
    if (!newest) {
      await noteAlertCheck(ctx.db, key(w), { problem: null });
      continue;
    }
    const last = w.state?.lastItemId ?? null;
    // First look, or a video we can't place: record the newest, announce only if it's fresh.
    const known = last ? videos.findIndex((v) => v.id === last) : -1;
    const unseen = known === -1 ? [newest] : videos.slice(0, known).reverse();
    const announce = last !== null;
    for (const v of unseen.slice(-3)) {
      const fresh = now.getTime() - v.published.getTime() < FRESH_MS;
      const claimed = await claimAlertItem(ctx.db, key(w), v.id, { post: announce && fresh });
      if (!claimed || !announce || !fresh) continue;
      await post(w.guild, w.feed, w.ent, {
        id: v.id,
        name: v.author || "A channel",
        title: v.title,
        game: "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail: youtubeThumbnail(v.id),
      }).catch((error: unknown) =>
        ctx.logger.warn("YouTube alert failed to post", { guildId: w.guild.id, error }),
      );
    }
  }
}

/** "Send a test alert" from the dashboard: a sample in the feed's channel, without its ping. */
export async function doTestAlert(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<{ ok: boolean; message: string }> {
  const feedId = (raw as { feedId?: unknown })?.feedId;
  if (typeof feedId !== "string" || !/^[a-z0-9]{6,16}$/.test(feedId))
    return { ok: false, message: "That request wasn't valid." };
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const feeds = readAlertFeeds(await getAlertFeeds(ctx.db, guild.id));
  const index = feeds.findIndex((f) => f.id === feedId);
  const feed = feeds[index];
  if (!feed) return { ok: false, message: "That alert was removed. Refresh the page." };
  if (isFeedPaused(index, ent))
    return { ok: false, message: "That alert is paused: the server has more than its plan runs." };
  const channel = guild.channels.cache.get(feed.channelId);
  if (!channel?.isSendable()) return { ok: false, message: "The alert's channel was deleted." };
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed))
    return { ok: false, message: "You can't post in that channel." };
  const sample: AlertItem =
    feed.provider === "twitch"
      ? {
          id: "test",
          name: feed.handle,
          title: "This is a test alert from the dashboard",
          game: "Just Chatting",
          url: `https://www.twitch.tv/${feed.handle}`,
          thumbnail: "",
        }
      : {
          id: "test",
          name: feed.handle,
          title: "This is a test alert from the dashboard",
          game: "",
          url: "https://www.youtube.com/",
          thumbnail: "",
        };
  const posted = await post(guild, { ...feed, roleId: null }, ent, sample).catch(() => false);
  return posted
    ? {
        ok: true,
        message: `Posted a test alert in #${"name" in channel ? channel.name : "the channel"}, without the ping.`,
      }
    : { ok: false, message: "Garrison can't post in that channel. Check its permissions." };
}

/** The minute sweep's alert step: each provider on its own cadence. */
export async function sweepAlerts(
  ctx: BotContext,
  client: Client<true>,
  keys: AlertKeys,
  now = Date.now(),
) {
  const dueTwitch = now - lastTwitch >= TWITCH_EVERY_MS;
  const dueYoutube = now - lastYoutube >= YOUTUBE_EVERY_MS;
  if (!dueTwitch && !dueYoutube) return;
  const list = await watched(ctx, client);
  if (dueTwitch) {
    lastTwitch = now;
    await sweepTwitch(ctx, list, keys).catch((error: unknown) =>
      ctx.logger.warn("Twitch alerts failed", { error }),
    );
  }
  if (dueYoutube) {
    lastYoutube = now;
    await sweepYoutube(ctx, list, new Date(now)).catch((error: unknown) =>
      ctx.logger.warn("YouTube alerts failed", { error }),
    );
  }
}
