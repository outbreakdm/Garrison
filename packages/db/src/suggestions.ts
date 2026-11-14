/**
 * Suggestions: members post ideas with /suggest; each becomes a card in the server's
 * suggestions channel with For and Against buttons; staff mark it Planned, Done or
 * Declined from the dashboard, with a short note the card shows. Pure and shared.
 *
 * Free: the whole board. Pro: anonymous mode (the card hides who posted; staff still see
 * it on the dashboard).
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export const SUGGESTION_STATUSES = ["open", "planned", "done", "declined"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  open: "Open",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

export interface SuggestionsConfig {
  enabled: boolean;
  channelId: string | null;
  /** Pro: cards don't say who posted. */
  anonymous: boolean;
}

export const DEFAULT_SUGGESTIONS: SuggestionsConfig = {
  enabled: false,
  channelId: null,
  anonymous: false,
};

export const SUGGESTION_LIMITS = { text: 1000, note: 300 } as const;
const SNOWFLAKE = /^\d{17,20}$/;

export function readSuggestions(
  raw: Partial<Record<keyof SuggestionsConfig, unknown>> | null,
): SuggestionsConfig {
  if (!raw) return { ...DEFAULT_SUGGESTIONS };
  return {
    enabled: raw.enabled === true,
    channelId:
      typeof raw.channelId === "string" && SNOWFLAKE.test(raw.channelId) ? raw.channelId : null,
    anonymous: raw.anonymous === true,
  };
}

/** Check a change from the dashboard. A saved anonymous mode stays on Free; turning it on doesn't. */
export function checkSuggestions(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: SuggestionsConfig,
): Parsed<SuggestionsConfig> {
  const channelId = typeof raw.channelId === "string" && raw.channelId ? raw.channelId : null;
  if (channelId && !SNOWFLAKE.test(channelId))
    return { ok: false, error: "Pick the suggestions channel from this server's list." };
  const enabled = raw.enabled === true;
  if (enabled && !channelId)
    return { ok: false, error: "Pick the channel suggestions are posted in." };
  const anonymous = raw.anonymous === true;
  if (anonymous && !ent["suggestions.anonymous"] && !before.anonymous)
    return { ok: false, error: "Anonymous suggestions are part of Garrison Pro." };
  return { ok: true, value: { enabled, channelId, anonymous } };
}

/** A vote changes the counts: a second press of the same button takes the vote back. */
export function nextVote(current: -1 | 0 | 1, pressed: -1 | 1): -1 | 0 | 1 {
  return current === pressed ? 0 : pressed;
}
