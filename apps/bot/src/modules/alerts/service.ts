import { lookup } from "node:dns/promises";
import {
  type AlertFeed,
  type AlertProvider,
  type AlertStateRow,
  alertButton,
  alertHeading,
  alertLook,
  claimAlertItem,
  type Entitlements,
  entitlements,
  fillAlert,
  getAlertFeeds,
  getGuildLanguage,
  getGuildPlan,
  isFeedPaused,
  type Language,
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
  blueskyPosts,
  kickLive,
  type LiveStream,
  type Post,
  redditPosts,
  resolveYoutubeHandle,
  rssPosts,
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
  /** Kick's public API needs an app too (KICK_CLIENT_ID and KICK_CLIENT_SECRET). */
  kick?: { clientId: string; secret: string } | null;
  /** Reddit refuses anonymous reads from servers: an app's keys (REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET). */
  reddit?: { clientId: string; secret: string } | null;
}

const TWITCH_EVERY_MS = 2 * 60_000;
const YOUTUBE_EVERY_MS = 5 * 60_000;
/** Reddit, Bluesky and RSS: new posts are checked every 10 minutes, to be a polite reader. */
const POSTS_EVERY_MS = 10 * 60_000;
let lastPosts = 0;
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
export function alertMessage(
  feed: AlertFeed,
  ent: Entitlements,
  item: AlertItem,
  lang: Language = "en",
) {
  const look = alertLook(feed, ent);
  const values = { name: item.name, title: item.title, game: item.game, url: item.url };
  const container = new ContainerBuilder()
    .setAccentColor(Number.parseInt(look.accent.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${safeText(alertHeading(feed.provider, item.name, lang))}`,
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
          .setLabel(alertButton(feed.provider, lang)),
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

async function post(
  guild: Guild,
  feed: AlertFeed,
  ent: Entitlements,
  lang: Language,
  item: AlertItem,
) {
  const channel = guild.channels.cache.get(feed.channelId);
  if (!channel?.isSendable()) return false;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]))
    return false;
  await channel.send(alertMessage(feed, ent, item, lang));
  return true;
}

interface Watched {
  guild: Guild;
  feed: AlertFeed;
  ent: Entitlements;
  /** The language the server's alerts are written in. */
  lang: Language;
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
    const lang = await getGuildLanguage(ctx.db, guild.id);
    readAlertFeeds(row.feeds).forEach((feed, i) => {
      if (!isFeedPaused(i, ent))
        out.push({ guild, feed, ent, lang, state: stateOf.get(`${guild.id}:${feed.id}`) });
    });
  }
  return out;
}

const key = (w: Watched) => ({ guildId: w.guild.id, feedId: w.feed.id });

export async function sweepTwitch(ctx: BotContext, list: Watched[], keys: AlertKeys) {
  await sweepLive(ctx, list, "twitch", keys.twitch, twitchLive);
}

/** Twitch or Kick: each live stream is announced once, in every server that watches it. */
async function sweepLive(
  ctx: BotContext,
  list: Watched[],
  provider: "twitch" | "kick",
  app: { clientId: string; secret: string } | null | undefined,
  fetchLive: (
    app: { clientId: string; secret: string },
    handles: string[],
  ) => Promise<Map<string, LiveStream>>,
) {
  const feeds = list.filter((w) => w.feed.provider === provider);
  if (!feeds.length) return;
  if (!app) {
    for (const w of feeds)
      if (w.state?.problem !== "not_configured")
        await noteAlertCheck(ctx.db, key(w), { problem: "not_configured" });
    return;
  }
  const live = await fetchLive(app, [...new Set(feeds.map((w) => w.feed.handle))]);
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
    await post(w.guild, w.feed, w.ent, w.lang, {
      id: stream.id,
      name: stream.name,
      title: stream.title,
      game: stream.game,
      url:
        provider === "twitch"
          ? `https://www.twitch.tv/${stream.login}`
          : `https://kick.com/${stream.login}`,
      thumbnail: stream.thumbnail ? `${stream.thumbnail}?t=${Date.now()}` : "",
    }).catch((error: unknown) =>
      ctx.logger.warn("Live alert failed to post", { provider, guildId: w.guild.id, error }),
    );
  }
}

/** A feed's posts as one shape: who the heading names, and the newest posts first. */
type PostFeed = { name: string; posts: Post[] } | null;

/**
 * Where each new-post provider reads from. RSS refuses any address inside a network.
 * "not_configured": Reddit has no app keys, so it can't be read at all.
 */
const POST_SOURCES: Partial<
  Record<AlertProvider, (handle: string, keys: AlertKeys) => Promise<PostFeed | "not_configured">>
> = {
  reddit: async (sub, keys) => {
    if (!keys.reddit) return "not_configured";
    const posts = await redditPosts(keys.reddit, sub);
    return posts && { name: sub, posts };
  },
  bluesky: async (actor) => {
    const posts = await blueskyPosts(actor);
    return posts && { name: posts[0]?.author ?? actor, posts };
  },
  rss: (address) =>
    rssPosts(address, async (host) =>
      (await lookup(host, { all: true, verbatim: true })).map((a) => a.address),
    ),
};

/** The posts a feed hasn't announced yet, oldest first, and whether to announce them. */
export function unseenPosts<T extends { id: string }>(items: T[], last: string | null) {
  const newest = items[0];
  if (!newest) return { unseen: [] as T[], announce: false };
  const known = last ? items.findIndex((v) => v.id === last) : -1;
  // First look, or a post we can't place (deleted): record the newest, announce only if fresh.
  return {
    unseen: known === -1 ? (last === newest.id ? [] : [newest]) : items.slice(0, known).reverse(),
    announce: last !== null,
  };
}

/** Reddit, Bluesky and RSS: each feed read once however many servers watch it. */
export async function sweepPosts(
  ctx: BotContext,
  list: Watched[],
  keys: AlertKeys,
  now = new Date(),
) {
  const feeds = list.filter((w) => POST_SOURCES[w.feed.provider]);
  const read = new Map<string, PostFeed | "not_configured" | undefined>();
  const idOf = (w: Watched) => `${w.feed.provider}:${w.feed.handle.toLowerCase()}`;
  for (const w of feeds) {
    if (read.has(idOf(w))) continue;
    const source = POST_SOURCES[w.feed.provider];
    read.set(
      idOf(w),
      await source?.(w.feed.handle, keys).catch((error: unknown) => {
        ctx.logger.warn("Alert feed failed", { provider: w.feed.provider, error });
        return undefined;
      }),
    );
  }
  for (const w of feeds) {
    const got = read.get(idOf(w));
    if (got === undefined) continue; // Didn't answer: try again next time.
    if (got === "not_configured") {
      if (w.state?.problem !== "not_configured")
        await noteAlertCheck(ctx.db, key(w), { problem: "not_configured" });
      continue;
    }
    if (got === null) {
      if (w.state?.problem !== "not_found")
        await noteAlertCheck(ctx.db, key(w), { problem: "not_found" });
      continue;
    }
    const { unseen, announce } = unseenPosts(got.posts, w.state?.lastItemId ?? null);
    if (!unseen.length) {
      if (w.state?.problem) await noteAlertCheck(ctx.db, key(w), { problem: null });
      continue;
    }
    for (const p of unseen.slice(-3)) {
      const fresh = now.getTime() - p.published.getTime() < FRESH_MS;
      const claimed = await claimAlertItem(ctx.db, key(w), p.id, { post: announce && fresh });
      if (!claimed || !announce || !fresh || !p.url) continue;
      await post(w.guild, w.feed, w.ent, w.lang, {
        id: p.id,
        name: w.feed.provider === "bluesky" ? p.author || got.name : got.name,
        title: p.title || "New post",
        game: p.author,
        url: p.url,
        thumbnail: p.thumbnail,
      }).catch((error: unknown) =>
        ctx.logger.warn("Alert failed to post", {
          provider: w.feed.provider,
          guildId: w.guild.id,
          error,
        }),
      );
    }
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
      await post(w.guild, w.feed, w.ent, w.lang, {
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

const TEST_URL: Record<AlertProvider, (handle: string) => string> = {
  twitch: (h) => `https://www.twitch.tv/${h}`,
  kick: (h) => `https://kick.com/${h}`,
  youtube: () => "https://www.youtube.com/",
  reddit: (h) => `https://www.reddit.com/r/${h}/`,
  bluesky: (h) => `https://bsky.app/profile/${h}`,
  rss: (h) => h,
};

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
  const sample: AlertItem = {
    id: "test",
    name: feed.provider === "rss" ? new URL(feed.handle).hostname : feed.handle,
    title: "This is a test alert from the dashboard",
    game: feed.provider === "twitch" || feed.provider === "kick" ? "Just Chatting" : "Garrison",
    url: TEST_URL[feed.provider](feed.handle),
    thumbnail: "",
  };
  const lang = await getGuildLanguage(ctx.db, guild.id);
  const posted = await post(guild, { ...feed, roleId: null }, ent, lang, sample).catch(() => false);
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
  const duePosts = now - lastPosts >= POSTS_EVERY_MS;
  if (!dueTwitch && !dueYoutube && !duePosts) return;
  const list = await watched(ctx, client);
  if (dueTwitch) {
    lastTwitch = now;
    await sweepTwitch(ctx, list, keys).catch((error: unknown) =>
      ctx.logger.warn("Twitch alerts failed", { error }),
    );
    await sweepLive(ctx, list, "kick", keys.kick, kickLive).catch((error: unknown) =>
      ctx.logger.warn("Kick alerts failed", { error }),
    );
  }
  if (duePosts) {
    lastPosts = now;
    await sweepPosts(ctx, list, keys, new Date(now)).catch((error: unknown) =>
      ctx.logger.warn("Post alerts failed", { error }),
    );
  }
  if (dueYoutube) {
    lastYoutube = now;
    await sweepYoutube(ctx, list, new Date(now)).catch((error: unknown) =>
      ctx.logger.warn("YouTube alerts failed", { error }),
    );
  }
}
