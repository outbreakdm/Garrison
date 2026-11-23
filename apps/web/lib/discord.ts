import "server-only";
import { env } from "./env";
import { canManage, type GuildSnapshot, memberPermissions } from "./permissions";
import { isSnowflake } from "./security";

export const OAUTH_SCOPES = "identify guilds";

/** `scope` defaults to sign-in. Linking accounts asks for `identify connections` instead, and only then. */
export function authorizeUrl(state: string, codeChallenge: string, scope: string = OAUTH_SCOPES) {
  const { DISCORD_CLIENT_ID, APP_URL } = env();
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${APP_URL}/auth/callback`,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/** The longest a page waits on one Discord read, retry included. */
const DISCORD_BUDGET_MS = 10_000;
/** A rate limit longer than this isn't waited out: the page says to try again instead. */
const MAX_RETRY_WAIT_MS = 2_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait before asking again, or null to give up. One retry, for answers that
 * mean "not right now": a rate limit (Discord says how long), or a 5xx or no answer at all
 * on a read. A write isn't repeated after a 5xx: it may have gone through (an OAuth code
 * can be used once).
 */
export function retryDelay(status: number, retryAfter: string | null, isRead: boolean) {
  if (status === 429) {
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    const ms = Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : 1000;
    return ms <= MAX_RETRY_WAIT_MS ? ms : null;
  }
  if (isRead && (status === 0 || status >= 500)) return 300;
  return null;
}

async function discord<T>(path: string, init: RequestInit): Promise<T> {
  const started = Date.now();
  const isRead = (init.method ?? "GET") === "GET";
  for (let attempt = 0; ; attempt++) {
    const left = DISCORD_BUDGET_MS - (Date.now() - started);
    let status = 0;
    let retryAfter: string | null = null;
    try {
      const res = await fetch(`${env().DISCORD_API_BASE}${path}`, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(attempt === 0 ? Math.min(6_000, left) : left),
      });
      if (res.ok) return (await res.json()) as T;
      status = res.status;
      // Discord sends seconds with a fraction here; Retry-After is whole seconds.
      retryAfter = res.headers.get("x-ratelimit-reset-after") ?? res.headers.get("retry-after");
      await res.body?.cancel().catch(() => {});
    } catch {
      // No answer: a timeout or a dropped connection. Status 0 says so.
    }
    const delay = attempt === 0 ? retryDelay(status, retryAfter, isRead) : null;
    if (delay === null || Date.now() - started + delay > DISCORD_BUDGET_MS - 1_000)
      throw new DiscordError(status, path);
    await wait(delay);
  }
}

export class DiscordError extends Error {
  constructor(
    /** Discord's HTTP status, or 0 when it didn't answer in time. */
    readonly status: number,
    path: string,
  ) {
    super(
      status
        ? `Discord returned ${status} for ${path.split("?")[0]}`
        : `Discord didn't answer for ${path.split("?")[0]}`,
    );
  }
}

// --- Shared, short-lived reads -------------------------------------------------
// Every dashboard page asks about the same server. One fetch per server every 30 s
// serves the access check, the role, emoji and channel pickers and the layout
// preview, and a request already on its way is shared rather than sent again.

const READ_TTL_MS = 30_000;
const READ_MAX_KEYS = 2000;

interface Shared<T> {
  at: number;
  value: Promise<T>;
}

function shared<T>(store: Map<string, Shared<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.value;
  const value = load();
  store.set(key, { at: Date.now(), value });
  // A failed read isn't kept: the next page asks again.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  if (store.size > READ_MAX_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return value;
}

interface RawGuild {
  id: string;
  owner_id: string;
  icon?: string | null;
  /** With `with_counts`: members, and members online right now (approximate). */
  approximate_member_count?: number;
  approximate_presence_count?: number;
  premium_subscription_count?: number;
  vanity_url_code?: string | null;
  roles: {
    id: string;
    name: string;
    position: number;
    color?: number;
    managed?: boolean;
    mentionable?: boolean;
    permissions?: string;
  }[];
  emojis?: { id: string | null; name: string | null; animated?: boolean; available?: boolean }[];
}

interface RawChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id?: string | null;
  topic?: string | null;
  /** type 0: a role (or @everyone, whose id is the guild's); 1: a member. */
  permission_overwrites?: { id: string; type?: number; allow?: string; deny: string }[];
  /** Forums: the tags a post can carry. */
  available_tags?: { id: string; name: string }[];
  guild_id?: string;
}

const guildReads = new Map<string, Shared<RawGuild>>();
const channelReads = new Map<string, Shared<RawChannel[]>>();

const rawGuild = (guildId: string) =>
  shared(guildReads, guildId, () =>
    discord<RawGuild>(`/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    }),
  );

const rawChannels = (guildId: string) =>
  shared(channelReads, guildId, () =>
    discord<RawChannel[]>(`/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    }),
  );

/** Exchange an OAuth code for a token. The token is used for two reads, then revoked. */
export async function exchangeCode(code: string, codeVerifier: string) {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, APP_URL } = env();
  return discord<{ access_token: string }>("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${APP_URL}/auth/callback`,
      code_verifier: codeVerifier,
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
    }),
  });
}

/** Revoke the user's token as soon as login is done: Garrison never keeps it. */
export async function revokeToken(token: string) {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = env();
  await fetch(`${env().DISCORD_API_BASE}/oauth2/token/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      token_type_hint: "access_token",
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export const fetchMe = (token: string) =>
  discord<{ id: string; username: string; global_name: string | null }>("/users/@me", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchMyConnections = (token: string) =>
  discord<unknown>("/users/@me/connections", { headers: { Authorization: `Bearer ${token}` } });

export const fetchMyGuilds = (token: string) =>
  discord<{ id: string; name: string; icon: string | null; owner: boolean; permissions: string }[]>(
    "/users/@me/guilds",
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

// --- Live permission checks, with the bot token ------------------------------

const accessReads = new Map<string, Shared<MemberNow | null>>();

/** What Discord says about a member right now: whether they can manage, and their roles. */
export interface MemberNow {
  manage: boolean;
  roleIds: string[];
  /** As this server shows them: nickname, else display name, else username. */
  name?: string;
  /** Their avatar in this server, else their own, else Discord's default one. */
  avatar?: string | null;
}

interface RawMemberNow {
  roles: string[];
  nick?: string | null;
  avatar?: string | null;
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null };
}

const AVATAR_HASH = /^[a-z0-9_]+$/i;

/** The avatar the bot draws for a member (displayAvatarURL): server one, own one, or default. */
function memberAvatar(guildId: string, userId: string, m: RawMemberNow) {
  const cdn = "https://cdn.discordapp.com";
  if (m.avatar && AVATAR_HASH.test(m.avatar))
    return `${cdn}/guilds/${guildId}/users/${userId}/avatars/${m.avatar}.png?size=256`;
  if (m.user?.avatar && AVATAR_HASH.test(m.user.avatar))
    return `${cdn}/avatars/${userId}/${m.user.avatar}.png?size=256`;
  return isSnowflake(userId) ? `${cdn}/embed/avatars/${(BigInt(userId) >> 22n) % 6n}.png` : null;
}

/**
 * This user in this server, right now: asked of Discord with the bot token, not taken from
 * the login snapshot, so losing Manage Server (or a role someone gave access to, or leaving)
 * locks them out within READ_TTL_MS (30 s). Null when they aren't a member, and on any
 * error: it fails closed.
 */
export function memberNow(guildId: string, userId: string): Promise<MemberNow | null> {
  return shared(accessReads, `${guildId}:${userId}`, async () => {
    try {
      const [guild, member] = await Promise.all([
        rawGuild(guildId),
        discord<RawMemberNow>(`/guilds/${guildId}/members/${userId}`, {
          headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
        }),
      ]);
      const snapshot: GuildSnapshot = {
        ownerId: guild.owner_id,
        everyoneRoleId: guild.id,
        roles: guild.roles.map((r) => ({ id: r.id, permissions: r.permissions ?? "0" })),
      };
      const roleIds = Array.isArray(member.roles) ? member.roles.map(String) : [];
      return {
        manage: canManage(memberPermissions(snapshot, userId, roleIds)),
        roleIds,
        name: member.nick || member.user?.global_name || member.user?.username,
        avatar: memberAvatar(guildId, userId, member),
      };
    } catch (error) {
      // Discord said this person isn't there (or Garrison can't see the server): no access.
      if (error instanceof DiscordError && (error.status === 404 || error.status === 403))
        return null;
      // Discord didn't say (rate limited, down, slow). Still no access, but as an error the
      // page shows with "Try again", not as "this page doesn't exist" to its own manager.
      throw error;
    }
  });
}

// --- Server channels, for settings pickers -----------------------------------

/** The server's text and announcement channels, in Discord's order. Cached 30 s. */
/** Every channel's name by ID (text, voice, forum, announcement), for labeling counts. */
export async function channelNames(guildId: string): Promise<Map<string, string>> {
  return new Map((await rawChannels(guildId)).map((c) => [c.id, c.name]));
}

export async function listTextChannels(guildId: string) {
  return (await rawChannels(guildId))
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position)
    .map(({ id, name }) => ({ id, name }));
}

/** Where a message can go: a text channel, a forum (each send starts a post), or a thread. */
export interface PostTarget {
  id: string;
  name: string;
  kind: "text" | "forum" | "thread";
  /** A thread's channel, or a forum's name for its posts. */
  parent: string | null;
  tags: { id: string; name: string }[];
}

const threadReads = new Map<string, Shared<RawChannel[]>>();
/** Threads open now (not archived) the bot can see. Cached 30 s; empty when Discord is silent. */
const rawThreads = (guildId: string) =>
  shared(threadReads, guildId, () =>
    discord<{ threads: RawChannel[] }>(`/guilds/${guildId}/threads/active`, {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    }).then((r) => r.threads ?? []),
  );

/** Text channels, forums and open threads, in Discord's order, for the message builder. */
export async function listPostTargets(guildId: string): Promise<PostTarget[]> {
  const [channels, threads] = await Promise.all([
    rawChannels(guildId),
    rawThreads(guildId).catch(() => []),
  ]);
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const sorted = [...channels].sort((a, b) => a.position - b.position);
  return [
    ...sorted
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({ id: c.id, name: c.name, kind: "text" as const, parent: null, tags: [] })),
    ...sorted
      .filter((c) => c.type === 15 || c.type === 16)
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: "forum" as const,
        parent: null,
        tags: (c.available_tags ?? []).map((t) => ({ id: t.id, name: t.name })),
      })),
    // Public and announcement threads; private ones only open to their members.
    ...threads
      .filter((t) => t.type === 10 || t.type === 11)
      .map((t) => ({
        id: t.id,
        name: t.name,
        kind: "thread" as const,
        parent: t.parent_id ? (names.get(t.parent_id) ?? null) : null,
        tags: [],
      })),
  ];
}

/**
 * A channel or thread by ID, asked of Discord: its server, kind and name (an archived thread
 * isn't in the open list). Null when it's gone or Garrison can't see it.
 */
export async function channelInfo(
  id: string,
): Promise<{ guildId: string | null; type: number; name: string; parentId: string | null } | null> {
  try {
    const c = await discord<RawChannel>(`/channels/${id}`, {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    });
    return {
      guildId: c.guild_id ?? null,
      type: c.type,
      name: c.name,
      parentId: c.parent_id ?? null,
    };
  } catch {
    return null;
  }
}

/** An invite to the server, as Discord lists them (Manage Server needed). */
export interface ServerInvite {
  code: string;
  uses: number;
  maxUses: number;
  expiresAt: Date | null;
  createdAt: Date | null;
  inviter: string | null;
  channel: string | null;
  /** The server's own vanity link (discord.gg/name). */
  vanity: boolean;
}

interface RawInvite {
  code: string;
  uses?: number;
  max_uses?: number;
  expires_at?: string | null;
  created_at?: string;
  inviter?: { username: string } | null;
  channel?: { name: string } | null;
  guild?: { id: string } | null;
}

const inviteReads = new Map<string, Shared<RawInvite[]>>();

/**
 * Every invite in the server, the vanity link first when there is one. Cached 30 s. Null when
 * Discord refuses (Garrison lacks Manage Server) or doesn't answer.
 */
export async function listInvites(guildId: string): Promise<ServerInvite[] | null> {
  const [raw, guild] = await Promise.all([
    shared(inviteReads, guildId, () =>
      discord<RawInvite[]>(`/guilds/${guildId}/invites`, {
        headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
      }),
    ).catch(() => null),
    rawGuild(guildId).catch(() => null),
  ]);
  if (!raw) return null;
  const list: ServerInvite[] = raw.map((i) => ({
    code: i.code,
    uses: i.uses ?? 0,
    maxUses: i.max_uses ?? 0,
    expiresAt: i.expires_at ? new Date(i.expires_at) : null,
    createdAt: i.created_at ? new Date(i.created_at) : null,
    inviter: i.inviter?.username ?? null,
    channel: i.channel?.name ?? null,
    vanity: false,
  }));
  const vanity = guild?.vanity_url_code;
  if (vanity && !list.some((i) => i.code === vanity))
    list.unshift({
      code: vanity,
      uses: 0,
      maxUses: 0,
      expiresAt: null,
      createdAt: null,
      inviter: null,
      channel: null,
      vanity: true,
    });
  return list;
}

/** Which server an invite code opens, asked of Discord. Null when it's gone or unknown. */
export async function inviteServer(code: string): Promise<string | null> {
  if (!/^[A-Za-z0-9-]{2,32}$/.test(code)) return null;
  try {
    const i = await discord<RawInvite>(`/invites/${code}`, {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    });
    return i.guild?.id ?? null;
  } catch {
    return null;
  }
}

export interface GuildRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
  mentionable: boolean;
  /** Permission bits as a decimal string, as Discord sends them. */
  permissions: string;
}

/** Every role except @everyone, highest first, as Discord shows them. Cached 30 s. */
export async function listGuildRoles(guildId: string): Promise<GuildRole[]> {
  return (await guildInfo(guildId)).roles;
}

export interface ServerEmoji {
  id: string;
  name: string;
  animated: boolean;
}

/** The server's own emoji, for role menus, ticket topics and the starboard. Cached 30 s. */
export async function listGuildEmojis(guildId: string): Promise<ServerEmoji[]> {
  return (await guildInfo(guildId)).emojis;
}

/** The server's owner, asked of Discord (cached 30 s). Anti-nuke controls are theirs alone. */
/** How many members the server has, how many are online now (Discord's approximations), and its boosts. */
export async function guildCounts(
  guildId: string,
): Promise<{ members: number | null; online: number | null; boosts: number | null }> {
  const g = await rawGuild(guildId);
  return {
    members: g.approximate_member_count ?? null,
    online: g.approximate_presence_count ?? null,
    boosts: g.premium_subscription_count ?? null,
  };
}

/**
 * What a server's public page shows of it from Discord: its icon and about how many members it
 * has. Cached 30 s with every other read of the server. Null when Discord can't say.
 */
export async function publicGuildLook(
  guildId: string,
): Promise<{ iconUrl: string | null; members: number | null } | null> {
  try {
    const g = await rawGuild(guildId);
    const icon = g.icon && /^(a_)?[0-9a-f]{32}$/.test(g.icon) ? g.icon : null;
    return {
      iconUrl: icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128` : null,
      members: g.approximate_member_count ?? null,
    };
  } catch {
    return null;
  }
}

export async function guildOwnerId(guildId: string): Promise<string> {
  return (await guildInfo(guildId)).ownerId;
}

async function guildInfo(guildId: string) {
  const guild = await rawGuild(guildId);
  const roles = guild.roles
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      managed: r.managed === true,
      mentionable: r.mentionable === true,
      permissions: r.permissions ?? "0",
    }));
  const emojis = (guild.emojis ?? []).flatMap((e) =>
    e.id && e.name && e.available !== false
      ? [{ id: e.id, name: e.name, animated: e.animated === true }]
      : [],
  );
  return { roles, emojis, ownerId: guild.owner_id };
}

/**
 * Where Garrison's own highest role sits: it can only give roles below it. Null
 * when Discord can't say (the bot checks again before acting, so this only
 * decides what the dashboard warns about).
 */
export async function botTopPosition(guildId: string): Promise<number | null> {
  try {
    const [me, roles] = await Promise.all([
      discord<{ roles: string[] }>(`/guilds/${guildId}/members/${env().DISCORD_CLIENT_ID}`, {
        headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
      }),
      listGuildRoles(guildId),
    ]);
    return Math.max(0, ...roles.filter((r) => me.roles.includes(r.id)).map((r) => r.position));
  } catch {
    return null;
  }
}

/**
 * Garrison's server-wide permissions in a server (its roles plus @everyone), or null when
 * Discord can't say. For warnings only: the bot checks again before acting.
 */
const botMemberReads = new Map<string, Shared<{ roles: string[] }>>();

export async function botPermissions(guildId: string): Promise<bigint | null> {
  try {
    const [me, guild] = await Promise.all([
      // Cached 30 s like the guild: the menu checks it on every page.
      shared(botMemberReads, guildId, () =>
        discord<{ roles: string[] }>(`/guilds/${guildId}/members/${env().DISCORD_CLIENT_ID}`, {
          headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
        }),
      ),
      rawGuild(guildId),
    ]);
    let bits = 0n;
    for (const r of guild.roles)
      if (r.id === guildId || me.roles.includes(r.id)) bits |= BigInt(r.permissions ?? "0");
    return bits;
  } catch {
    return null;
  }
}

/** How Garrison looks in one server now: its nickname and server-only images. */
export interface BotLook {
  nick: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

export async function botLook(guildId: string): Promise<BotLook | null> {
  const id = env().DISCORD_CLIENT_ID;
  try {
    const me = await discord<{
      nick?: string | null;
      avatar?: string | null;
      banner?: string | null;
    }>(`/guilds/${guildId}/members/${id}`, {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    });
    const cdn = `https://cdn.discordapp.com/guilds/${guildId}/users/${id}`;
    return {
      nick: me.nick ?? null,
      avatarUrl: me.avatar ? `${cdn}/avatars/${me.avatar}.png?size=128` : null,
      bannerUrl: me.banner ? `${cdn}/banners/${me.banner}.png?size=480` : null,
    };
  } catch {
    return null;
  }
}

/** Roles a Rally template could notify: not @everyone, not managed by an integration. */
export async function listNotifiableRoles(guildId: string) {
  return (await listGuildRoles(guildId))
    .filter((r) => !r.managed)
    .map(({ id, name, mentionable }) => ({ id, name, mentionable }));
}

// --- Members, for moderating from the dashboard --------------------------------

const SNOWFLAKE = /^\d{17,20}$/;

export interface MemberCard {
  id: string;
  username: string;
  /** Server nickname, else display name, else username. */
  name: string;
  /** A cdn.discordapp.com URL, or null for the default avatar. */
  avatar: string | null;
  bot: boolean;
  /** Null when they aren't in this server (banned, left, or never joined). */
  joinedAt: Date | null;
  roleIds: string[];
  timedOutUntil: Date | null;
}

interface RawUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
}
interface RawMember {
  user: RawUser;
  nick?: string | null;
  roles: string[];
  joined_at?: string | null;
  communication_disabled_until?: string | null;
}

const avatarUrl = (u: RawUser) =>
  u.avatar && /^[a-z0-9_]+$/i.test(u.avatar)
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=96`
    : null;

function memberCard(m: RawMember): MemberCard {
  const until = m.communication_disabled_until ? new Date(m.communication_disabled_until) : null;
  return {
    id: m.user.id,
    username: m.user.username,
    name: m.nick || m.user.global_name || m.user.username,
    avatar: avatarUrl(m.user),
    bot: m.user.bot === true,
    joinedAt: m.joined_at ? new Date(m.joined_at) : null,
    roleIds: m.roles,
    timedOutUntil: until && until.getTime() > Date.now() ? until : null,
  };
}

const botAuth = () => ({ headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` } });

/** Is this person in the server right now? Asked of Discord with the bot's token. */
export async function isGuildMember(guildId: string, userId: string): Promise<boolean> {
  if (!SNOWFLAKE.test(userId)) return false;
  try {
    await discord<RawMember>(`/guilds/${guildId}/members/${userId}`, botAuth());
    return true;
  } catch {
    return false;
  }
}

/**
 * One person by ID: their member record when they're in the server, else the
 * bare user (someone who left or was banned can still be banned or looked up).
 * Null when Discord doesn't know the ID.
 */
export async function fetchMemberCard(guildId: string, userId: string): Promise<MemberCard | null> {
  if (!SNOWFLAKE.test(userId)) return null;
  try {
    return memberCard(await discord<RawMember>(`/guilds/${guildId}/members/${userId}`, botAuth()));
  } catch (error) {
    if (!(error instanceof DiscordError) || error.status !== 404) throw error;
  }
  try {
    const user = await discord<RawUser>(`/users/${userId}`, botAuth());
    return memberCard({ user, roles: [], joined_at: null });
  } catch {
    return null;
  }
}

const NAME_TTL_MS = 10 * 60_000;
const nameCache = new Map<string, { at: number; name: string | null }>();

/**
 * Display names for a page of user IDs (log rows, appeal reviewers), so owners read
 * people, not 18-digit numbers. Looks up at most 20 unknown IDs per call, keeps names
 * for 10 minutes, and leaves out anyone Discord doesn't know or a failed read.
 */
export async function memberNames(guildId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    if (!SNOWFLAKE.test(id)) continue;
    const hit = nameCache.get(`${guildId}:${id}`);
    if (hit && Date.now() - hit.at < NAME_TTL_MS) {
      if (hit.name) out.set(id, hit.name);
    } else missing.push(id);
  }
  await Promise.all(
    missing.slice(0, 20).map(async (id) => {
      const card = await fetchMemberCard(guildId, id).catch(() => undefined);
      if (card === undefined) return;
      nameCache.set(`${guildId}:${id}`, { at: Date.now(), name: card?.name ?? null });
      if (card) out.set(id, card.name);
    }),
  );
  if (nameCache.size > 2_000) nameCache.clear();
  return out;
}

/** Members whose name or nickname starts with `query`; a user ID finds that one person. */
export async function searchMembers(guildId: string, query: string): Promise<MemberCard[]> {
  const q = query.trim().replace(/^@/, "").slice(0, 32);
  if (!q) return [];
  if (SNOWFLAKE.test(q)) {
    const one = await fetchMemberCard(guildId, q);
    return one ? [one] : [];
  }
  const found = await discord<RawMember[]>(
    `/guilds/${guildId}/members/search?${new URLSearchParams({ query: q, limit: "12" })}`,
    botAuth(),
  );
  return found.map(memberCard);
}

// --- The server's shape, for the Quartermaster preview ---------------------------

export interface LayoutChannel {
  id: string;
  name: string;
  kind: "text" | "voice" | "other";
  /** Hidden from @everyone. */
  locked: boolean;
  topic?: string | null;
  /** Role overwrites (@everyone's id is the server's), as permission bit strings. */
  overwrites?: { id: string; allow: string; deny: string }[];
}
export interface ServerLayout {
  /** Channels outside any category, as Discord lists them first. */
  loose: LayoutChannel[];
  categories: { id: string; name: string; channels: LayoutChannel[] }[];
  /** Highest first, without @everyone. */
  roles: {
    id: string;
    name: string;
    color: number;
    managed: boolean;
    /** Permission bits, as Discord sends them. */
    permissions?: string;
    position?: number;
  }[];
}

const VIEW_CHANNEL = 1n << 10n;
/** Every category, channel and role, in Discord's order. Cached 30 s. */
export async function getServerLayout(guildId: string): Promise<ServerLayout> {
  const [raw, guild] = await Promise.all([rawChannels(guildId), rawGuild(guildId)]);
  const isVoice = (t: number) => t === 2 || t === 13;
  const channel = (c: (typeof raw)[number]): LayoutChannel => {
    const everyone = c.permission_overwrites?.find((o) => o.id === guildId);
    let locked = false;
    try {
      locked = everyone ? (BigInt(everyone.deny) & VIEW_CHANNEL) !== 0n : false;
    } catch {
      locked = false;
    }
    return {
      id: c.id,
      name: c.name,
      kind: c.type === 0 || c.type === 5 ? "text" : isVoice(c.type) ? "voice" : "other",
      locked,
      topic: c.topic ?? null,
      overwrites: (c.permission_overwrites ?? [])
        .filter((o) => (o.type ?? 0) === 0)
        .map((o) => ({ id: o.id, allow: o.allow ?? "0", deny: o.deny ?? "0" })),
    };
  };
  // Discord lists text channels above voice ones inside each category.
  const order = (a: (typeof raw)[number], b: (typeof raw)[number]) =>
    Number(isVoice(a.type)) - Number(isVoice(b.type)) || a.position - b.position;
  const inside = (parent: string | null) =>
    raw
      .filter((c) => c.type !== 4 && (c.parent_id ?? null) === parent)
      .sort(order)
      .map(channel);
  const layout: ServerLayout = {
    loose: inside(null),
    categories: raw
      .filter((c) => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, channels: inside(c.id) })),
    roles: guild.roles
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color ?? 0,
        managed: r.managed === true,
        permissions: r.permissions ?? "0",
        position: r.position,
      })),
  };
  return layout;
}
