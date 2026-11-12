/**
 * Garrison brand constants shared by the bot, dashboard and marketing site.
 * Values mirror the Garrison design system (tokens.json). Keep them in sync.
 */

export const colors = {
  dark: {
    accent: "#d4ff3a",
    accentStrong: "#d4ff3a",
    accentInk: "#0b0d10",
    bg: "#0b0d10",
    surface: "#12161b",
    surfaceRaised: "#1a2028",
    line: "#2a323d",
    text: "#e8ecf1",
    textMuted: "#8c96a3",
    go: "#2bd99f",
    caution: "#ffb547",
    alert: "#ff5c5c",
    intel: "#5ab0ff",
  },
  light: {
    accent: "#d4ff3a",
    accentStrong: "#4d6b00",
    accentInk: "#0b0d10",
    bg: "#f4f6f8",
    surface: "#ffffff",
    surfaceRaised: "#edf0f3",
    line: "#d5dbe2",
    text: "#11151a",
    textMuted: "#5a6472",
    go: "#0b7a57",
    caution: "#9a5b00",
    alert: "#c62828",
    intel: "#1f6fc5",
  },
} as const;

const hexToInt = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/**
 * Discord embed bar colours. Volt marks a normal message; the status colours
 * mark moderation and alerts, and are never used for decoration.
 */
export const embedColors = {
  volt: hexToInt(colors.dark.accent),
  go: hexToInt(colors.dark.go),
  caution: hexToInt(colors.dark.caution),
  alert: hexToInt(colors.dark.alert),
  intel: hexToInt(colors.dark.intel),
} as const;

export type EmbedTone = keyof typeof embedColors;

export const fonts = {
  display: '"Saira Semi Condensed", "Arial Narrow", sans-serif',
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
} as const;

/**
 * Each module has a short themed name and a plain label shown next to it in
 * the dashboard. Slash commands use the plain word.
 */
export const modules = {
  watch: { name: "Watch", plain: "Moderation" },
  gatehouse: { name: "Gatehouse", plain: "Security" },
  ledger: { name: "Ledger", plain: "Logs" },
  rally: { name: "Rally", plain: "Looking for group" },
  ops: { name: "Ops", plain: "Events" },
  barracks: { name: "Barracks", plain: "Members" },
  ranks: { name: "Ranks", plain: "Leveling" },
  insignia: { name: "Insignia", plain: "Role menus" },
  herald: { name: "Herald", plain: "Welcome" },
  dispatch: { name: "Dispatch", plain: "Messages" },
  quartermaster: { name: "Quartermaster", plain: "AI builder" },
} as const;

export type ModuleKey = keyof typeof modules;

export const brand = {
  name: "Garrison",
  tagline: "Guard the gate. Rally the squad.",
  oneLiner:
    "Moderation, security, LFG and raid signups in one fast bot, with everything a server needs to stay safe included free.",
} as const;

/** Ledger event types and their labels, shared by bot embeds and the dashboard filter. */
export const ledgerTypeLabels: Record<string, string> = {
  member_join: "Joined",
  member_leave: "Left",
  member_kick: "Kick",
  member_ban: "Ban",
  member_unban: "Unban",
  member_roles: "Roles",
  member_timeout: "Timeout",
  member_timeout_end: "Timeout removed",
  member_nick: "Nickname",
  channel_create: "Channel created",
  channel_delete: "Channel deleted",
  channel_update: "Channel edited",
  channel_permissions: "Channel permissions",
  role_create: "Role created",
  role_delete: "Role deleted",
  role_update: "Role edited",
  invite_create: "Invite created",
  invite_delete: "Invite deleted",
  webhook_create: "Webhook created",
  webhook_delete: "Webhook deleted",
  bot_add: "Bot added",
  server_update: "Server edited",
  message_delete: "Message deleted",
  message_delete_by_mod: "Message removed",
  message_bulk_delete: "Bulk delete",
  voice_join: "Voice join",
  voice_leave: "Voice leave",
  voice_switch: "Voice switch",
  voice_disconnect: "Voice disconnect",
  voice_move: "Voice move",
};

/**
 * The Discord permissions Garrison asks for when invited: exactly what its
 * modules use, never Administrator. Bit values from Discord's documentation;
 * a bot test checks this equals the set /health verifies.
 */
const bit = (n: number) => 1n << BigInt(n);
export const inviteSettings = {
  scopes: "bot applications.commands",
  permissions:
    bit(1) | // Kick Members
    bit(2) | // Ban Members
    bit(4) | // Manage Channels
    bit(5) | // Manage Server
    bit(7) | // View Audit Log
    bit(10) | // View Channel
    bit(11) | // Send Messages
    bit(13) | // Manage Messages
    bit(14) | // Embed Links
    bit(16) | // Read Message History
    bit(20) | // Connect
    bit(26) | // Change Nickname
    bit(28) | // Manage Roles
    bit(40), // Moderate Members
} as const;

export function inviteUrl(clientId: string, guildId?: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: inviteSettings.scopes,
    permissions: inviteSettings.permissions.toString(),
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * Game accounts Barracks understands. `discord` ones arrive through the
 * member's Discord Connections; the rest are linked directly.
 */
export const linkProviders = {
  steam: { label: "Steam", via: "discord" },
  battlenet: { label: "Battle.net", via: "discord" },
  riotgames: { label: "Riot Games", via: "discord" },
  leagueoflegends: { label: "League of Legends", via: "discord" },
  xbox: { label: "Xbox", via: "discord" },
  playstation: { label: "PlayStation", via: "discord" },
  epicgames: { label: "Epic Games", via: "discord" },
  bungie: { label: "Bungie", via: "discord" },
  roblox: { label: "Roblox", via: "discord" },
  osrs: { label: "Old School RuneScape", via: "claimed" },
  wow: { label: "World of Warcraft", via: "battlenet" },
} as const;

export type LinkProvider = keyof typeof linkProviders;
export const discordConnectionProviders = Object.entries(linkProviders)
  .filter(([, p]) => p.via === "discord")
  .map(([key]) => key);
