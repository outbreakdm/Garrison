/**
 * Garrison brand constants shared by the bot, dashboard and marketing site.
 * Values mirror the Garrison design system (tokens.json). Keep them in sync.
 */

export const colors = {
  dark: {
    accent: "#d4ff3a",
    accentStrong: "#d4ff3a",
    accentInk: "#141a00",
    bg: "#151a2c",
    surface: "#1e2540",
    surfaceRaised: "#283152",
    line: "#3a4570",
    text: "#eef1fa",
    textMuted: "#a9b2cf",
    go: "#2bd99f",
    caution: "#ffb547",
    alert: "#ff6b6b",
    intel: "#5ab0ff",
    cobalt: "#7b93ff",
    orchid: "#df95f5",
    volt: "#d4ff3a",
    steel: "#a9bdd6",
  },
  light: {
    accent: "#4d6b00",
    accentStrong: "#4d6b00",
    accentInk: "#ffffff",
    bg: "#eceff7",
    surface: "#ffffff",
    surfaceRaised: "#f2f4fa",
    line: "#c8cfe2",
    text: "#141a2e",
    textMuted: "#4d5779",
    go: "#0b7a57",
    caution: "#9a5b00",
    alert: "#c62828",
    intel: "#1f6fc5",
    cobalt: "#3c53d6",
    orchid: "#9437b5",
    volt: "#4d6b00",
    steel: "#4a5d75",
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
  display: 'Archivo, system-ui, -apple-system, "Segoe UI", sans-serif',
  sans: 'Archivo, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'Archivo, system-ui, -apple-system, "Segoe UI", sans-serif',
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
  parley: { name: "Parley", plain: "Tickets" },
  beacon: { name: "Beacon", plain: "Alerts" },
  spoils: { name: "Spoils", plain: "Giveaways" },
  honors: { name: "Honors", plain: "Starboard" },
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
  message_edit: "Message edited",
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
  rs3: { label: "RuneScape", via: "claimed" },
  wow: { label: "World of Warcraft", via: "battlenet" },
} as const;

export type LinkProvider = keyof typeof linkProviders;
export const discordConnectionProviders = Object.entries(linkProviders)
  .filter(([, p]) => p.via === "discord")
  .map(([key]) => key);
