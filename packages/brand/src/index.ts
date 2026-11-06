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
  quartermaster: { name: "Quartermaster", plain: "AI builder" },
} as const;

export type ModuleKey = keyof typeof modules;

export const brand = {
  name: "Garrison",
  tagline: "Guard the gate. Rally the squad.",
  oneLiner:
    "Moderation, security, LFG and raid signups in one fast bot, with everything a server needs to stay safe included free.",
} as const;
