import type { LfgSlotGroup, Parsed } from "@garrison/db";
import { parseDuration } from "../../lib/duration.js";

export { MAX_GROUPS, MAX_SLOTS, type Parsed, parseSlots } from "@garrison/db";

export const MAX_START_SECONDS = 7 * 86_400;
/** Posts close this long after they start, unless their template says otherwise. */
export const LIFETIME_AFTER_START_MS = 3 * 3_600_000;

/** "now" (or nothing) → now; "10m", "2h" → that long from now, up to 7 days. */
export function parseStart(input: string | null, now = Date.now()): Parsed<Date> {
  if (!input || input.trim().toLowerCase() === "now") return { ok: true, value: new Date(now) };
  const seconds = parseDuration(input);
  if (!seconds || seconds > MAX_START_SECONDS) {
    return {
      ok: false,
      error: `Say when it starts as "now" or a time from now, like 10m or 2h (up to 7 d).`,
    };
  }
  return { ok: true, value: new Date(now + seconds * 1000) };
}

/** Match a typed role to a slot group, ignoring case. Unnamed groups match anything. */
export function matchSlot(groups: LfgSlotGroup[], typed: string | null): string | null {
  if (groups.length === 1 && groups[0]?.name === "") return "";
  if (!typed) return groups[0]?.name ?? null;
  return groups.find((g) => g.name.toLowerCase() === typed.trim().toLowerCase())?.name ?? null;
}

/** A safe voice channel name from user text: no mentions, markdown or odd characters. */
export function voiceChannelName(title: string) {
  const clean = title
    .replace(/[^\p{L}\p{N} +'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || "Squad";
}
