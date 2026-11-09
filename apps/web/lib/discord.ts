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

const roleCache = new Map<string, { roles: GuildRole[]; ownerId: string; at: number }>();

/** Every role except @everyone, highest first, as Discord shows them. Cached 30 s. */
export async function listGuildRoles(guildId: string): Promise<GuildRole[]> {
  return (await guildInfo(guildId)).roles;
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
  const entry = { roles, ownerId: guild.owner_id, at: Date.now() };
  roleCache.set(guildId, entry);
  return entry;
}

/** Roles a Rally template could notify: not @everyone, not managed by an integration. */
export async function listNotifiableRoles(guildId: string) {
  return (await listGuildRoles(guildId))
    .filter((r) => !r.managed)
    .map(({ id, name, mentionable }) => ({ id, name, mentionable }));
}
