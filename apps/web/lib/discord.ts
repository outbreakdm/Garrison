import "server-only";
import { env } from "./env";
import { canManage, type GuildSnapshot, memberPermissions } from "./permissions";

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

async function discord<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${env().DISCORD_API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new DiscordError(res.status, path);
  return (await res.json()) as T;
}

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`Discord returned ${status} for ${path.split("?")[0]}`);
  }
}

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

const ACCESS_TTL_MS = 30_000;
const accessCache = new Map<string, { ok: boolean; at: number }>();

/**
 * Can this user manage this server right now? Asked of Discord with the bot
 * token, not taken from the login snapshot, so losing the role locks them out
 * within ACCESS_TTL_MS. Fails closed on any error.
 */
export async function canManageGuildNow(guildId: string, userId: string): Promise<boolean> {
  const key = `${guildId}:${userId}`;
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.ok;

  const bot = { headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` } };
  let ok = false;
  try {
    const [guild, member] = await Promise.all([
      discord<{ id: string; owner_id: string; roles: { id: string; permissions: string }[] }>(
        `/guilds/${guildId}`,
        bot,
      ),
      discord<{ roles: string[] }>(`/guilds/${guildId}/members/${userId}`, bot),
    ]);
    const snapshot: GuildSnapshot = {
      ownerId: guild.owner_id,
      everyoneRoleId: guild.id,
      roles: guild.roles,
    };
    ok = canManage(memberPermissions(snapshot, userId, member.roles));
  } catch {
    ok = false;
  }
  accessCache.set(key, { ok, at: Date.now() });
  return ok;
}

// --- Server channels, for settings pickers -----------------------------------

const channelCache = new Map<string, { channels: { id: string; name: string }[]; at: number }>();

/** The server's text and announcement channels, in Discord's order. Cached 30 s. */
export async function listTextChannels(guildId: string) {
  const hit = channelCache.get(guildId);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.channels;
  const raw = await discord<{ id: string; name: string; type: number; position: number }[]>(
    `/guilds/${guildId}/channels`,
    {
      headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` },
    },
  );
  const channels = raw
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position)
    .map(({ id, name }) => ({ id, name }));
  channelCache.set(guildId, { channels, at: Date.now() });
  return channels;
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

const roleCache = new Map<
  string,
  { roles: GuildRole[]; emojis: ServerEmoji[]; ownerId: string; at: number }
>();

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
export async function guildOwnerId(guildId: string): Promise<string> {
  return (await guildInfo(guildId)).ownerId;
}

async function guildInfo(guildId: string) {
  const hit = roleCache.get(guildId);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit;
  const guild = await discord<{
    id: string;
    owner_id: string;
    roles: {
      id: string;
      name: string;
      position: number;
      managed?: boolean;
      mentionable?: boolean;
      permissions?: string;
    }[];
    emojis?: { id: string | null; name: string | null; animated?: boolean; available?: boolean }[];
  }>(`/guilds/${guildId}`, { headers: { Authorization: `Bot ${env().DISCORD_TOKEN}` } });
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
  const entry = { roles, emojis, ownerId: guild.owner_id, at: Date.now() };
  roleCache.set(guildId, entry);
  return entry;
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
}
export interface ServerLayout {
  /** Channels outside any category, as Discord lists them first. */
  loose: LayoutChannel[];
  categories: { id: string; name: string; channels: LayoutChannel[] }[];
  /** Highest first, without @everyone. */
  roles: { id: string; name: string; color: number; managed: boolean }[];
}

const VIEW_CHANNEL = 1n << 10n;
const layoutCache = new Map<string, { layout: ServerLayout; at: number }>();

/** Every category, channel and role, in Discord's order. Cached 30 s. */
export async function getServerLayout(guildId: string): Promise<ServerLayout> {
  const hit = layoutCache.get(guildId);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.layout;
  const [raw, guild] = await Promise.all([
    discord<
      {
        id: string;
        name: string;
        type: number;
        position: number;
        parent_id?: string | null;
        permission_overwrites?: { id: string; deny: string }[];
      }[]
    >(`/guilds/${guildId}/channels`, botAuth()),
    discord<{
      id: string;
      roles: { id: string; name: string; position: number; color?: number; managed?: boolean }[];
    }>(`/guilds/${guildId}`, botAuth()),
  ]);
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
      .map((r) => ({ id: r.id, name: r.name, color: r.color ?? 0, managed: r.managed === true })),
  };
  layoutCache.set(guildId, { layout, at: Date.now() });
  return layout;
}
