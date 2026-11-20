/**
 * Setup in three clicks (docs/ROADMAP.md, best bot item 2): what a new server is asked to do
 * first, on its Overview. Protect and Welcome are ordinary settings changes, checked like any
 * other (qm-settings.ts checkQmSettings) and saved through Settings history, so Undo works;
 * Build hands off to the AI assistant with a request written for the server's kind. Pure and
 * shared: the dashboard runs the steps, the tests check they pass Garrison's own rules.
 */

import type { QmSettingProposal } from "./qm-settings";

/** The kinds of server a new admin picks from; each writes its own request for the builder. */
export const SETUP_PRESETS = {
  gaming: {
    label: "Gaming clan",
    about: "Looking for group, game roles, squad voice rooms",
    prompt:
      "Set up this server for a gaming clan: a Start Here section with rules and a welcome channel, general chat, looking-for-group channels for our games, voice rooms for squads, game roles members pick themselves, and a private staff area. Keep what's already here and tidy the order.",
  },
  creator: {
    label: "Creator community",
    about: "Announcements, clips, fan chat, supporters",
    prompt:
      "Set up this server for a creator community: a Start Here section with rules, an announcements channel only staff post in, a channel for clips and highlights, fan chat, a supporters area for a Supporter role, and a private mod area. Keep what's already here and tidy the order.",
  },
  study: {
    label: "Study group",
    about: "Subjects, homework help, quiet study rooms",
    prompt:
      "Set up this server for a study group: a Start Here section with rules, a resources channel only staff post in, a channel per subject, a homework help channel with slowmode, voice study rooms, and a private moderator area. Keep what's already here and tidy the order.",
  },
} as const;
export type SetupPreset = keyof typeof SETUP_PRESETS;
export const SETUP_PRESET_KEYS = Object.keys(SETUP_PRESETS) as SetupPreset[];
export const isSetupPreset = (v: unknown): v is SetupPreset =>
  typeof v === "string" && Object.hasOwn(SETUP_PRESETS, v);

export const SETUP_STEPS = ["protect", "welcome", "build"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * Protect: automod on with scam links and invites, AI moderation (on every plan), and
 * anti-raid. Nothing here needs a channel, so it's one click.
 */
export const protectProposals = (): QmSettingProposal[] => [
  { module: "automod", field: "enabled", value: true },
  { module: "automod", field: "scamLinks", value: true },
  { module: "automod", field: "invites", value: true },
  { module: "automod", field: "aiEnabled", value: true },
  { module: "gatehouse", field: "antiRaidEnabled", value: true },
];

/** Welcome: welcome cards on, in the channel the admin picked. */
export const welcomeProposals = (channelId: string): QmSettingProposal[] => [
  { module: "welcome", field: "joinEnabled", value: true },
  { module: "welcome", field: "joinChannelId", value: channelId },
];

/** Which steps are done, from the server's settings and whether a build was ever applied. */
export function setupProgress(state: {
  automodOn: boolean;
  antiRaidOn: boolean;
  welcomeOn: boolean;
  built: boolean;
}): Record<SetupStep, boolean> {
  return {
    protect: state.automodOn && state.antiRaidOn,
    welcome: state.welcomeOn,
    build: state.built,
  };
}
