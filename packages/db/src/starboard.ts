/**
 * Starboard (module "Honors"): a message that collects enough of one emoji is
 * reposted to a starboard channel, with its star count kept current. Pure and
 * shared (`@garrison/db/cards`). Free: the whole feature. Pro: the card's colour.
 */

import { ACCENT, STANDARD_ACCENT } from "./cards";
import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";
import { isOneEmoji } from "./role-menus";

export interface StarboardConfig {
  enabled: boolean;
  channelId: string | null;
  emoji: string;
  /** Reactions needed to reach the board. */
  threshold: number;
  /** Count the author's own reaction. */
  selfStar: boolean;
  /** Channels whose messages never reach the board. */
  ignoredChannelIds: string[];
  /** Pro: the card's colour. Null: Garrison volt. */
  accent: string | null;
}

export const DEFAULT_STARBOARD: StarboardConfig = {
  enabled: false,
  channelId: null,
  emoji: "⭐",
  threshold: 3,
  selfStar: false,
  ignoredChannelIds: [],
  accent: null,
};

export const STARBOARD_LIMITS = { threshold: 50, ignored: 25 } as const;
const SNOWFLAKE = /^\d{17,20}$/;

/** A stored row, read leniently. */
export function readStarboard(raw: Partial<Record<keyof StarboardConfig, unknown>> | null) {
  if (!raw) return { ...DEFAULT_STARBOARD };
  const threshold = Number(raw.threshold);
  return {
    enabled: raw.enabled === true,
    channelId:
      typeof raw.channelId === "string" && SNOWFLAKE.test(raw.channelId) ? raw.channelId : null,
    emoji: typeof raw.emoji === "string" && isOneEmoji(raw.emoji) ? raw.emoji : "⭐",
    threshold:
      Number.isInteger(threshold) && threshold >= 1 && threshold <= STARBOARD_LIMITS.threshold
        ? threshold
        : 3,
    selfStar: raw.selfStar === true,
    ignoredChannelIds: Array.isArray(raw.ignoredChannelIds)
      ? raw.ignoredChannelIds.filter((v): v is string => typeof v === "string" && SNOWFLAKE.test(v))
      : [],
    accent: typeof raw.accent === "string" && ACCENT.test(raw.accent) ? raw.accent : null,
  } satisfies StarboardConfig;
}

/** Check a change from the dashboard. `before` is what's saved: a saved colour stays on Free. */
export function checkStarboard(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: StarboardConfig,
): Parsed<StarboardConfig> {
  const channelId = typeof raw.channelId === "string" && raw.channelId ? raw.channelId : null;
  if (channelId && !SNOWFLAKE.test(channelId))
    return { ok: false, error: "Pick the starboard channel from this server's list." };
  const enabled = raw.enabled === true;
  if (enabled && !channelId)
    return { ok: false, error: "Pick the channel starred messages go to." };
  const emoji = typeof raw.emoji === "string" ? raw.emoji.trim() : "";
  if (!isOneEmoji(emoji))
    return { ok: false, error: "The emoji must be one standard emoji, like ⭐." };
  const threshold = Number(raw.threshold);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > STARBOARD_LIMITS.threshold)
    return {
      ok: false,
      error: `Reactions needed go from 1 to ${STARBOARD_LIMITS.threshold}.`,
    };
  const ignored = Array.isArray(raw.ignoredChannelIds)
    ? [...new Set(raw.ignoredChannelIds.map(String))]
    : [];
  if (!ignored.every((id) => SNOWFLAKE.test(id)))
    return { ok: false, error: "Pick ignored channels from this server's list." };
  if (ignored.length > STARBOARD_LIMITS.ignored)
    return { ok: false, error: `Ignore up to ${STARBOARD_LIMITS.ignored} channels.` };
  let accent: string | null = null;
  if (raw.accent) {
    const a = typeof raw.accent === "string" ? raw.accent.trim().toLowerCase() : "";
    if (!ACCENT.test(a)) return { ok: false, error: "Pick the colour as #rrggbb." };
    accent = a === STANDARD_ACCENT ? null : a;
  }
  if (accent && !ent["starboard.look"] && accent !== before.accent)
    return { ok: false, error: "Your own starboard colour is part of Garrison Pro." };
  return {
    ok: true,
    value: {
      enabled,
      channelId,
      emoji,
      threshold,
      selfStar: raw.selfStar === true,
      ignoredChannelIds: ignored,
      accent,
    },
  };
}

/** Whether a message's reactions put it on the board. */
export function reachesBoard(
  config: Pick<StarboardConfig, "threshold" | "selfStar">,
  count: number,
  authorReacted: boolean,
) {
  const stars = count - (!config.selfStar && authorReacted ? 1 : 0);
  return { stars, on: stars >= config.threshold };
}

export const starboardAccent = (config: StarboardConfig, ent: Entitlements) =>
  (ent["starboard.look"] && config.accent) || STANDARD_ACCENT;
