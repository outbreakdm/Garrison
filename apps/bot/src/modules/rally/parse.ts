import type { LfgSlotGroup } from "@garrison/db";
import { parseDuration } from "../../lib/duration.js";

export const MAX_GROUPS = 4;
export const MAX_SLOTS = 40;
export const MAX_START_SECONDS = 7 * 86_400;
/** Posts close this long after they start, so stale groups don't pile up. */
export const LIFETIME_AFTER_START_MS = 3 * 3_600_000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} +'-]{0,19}$/u;

/**
 * Parse slot groups: "Tank 1, Healer 1, DPS 3", "Tank, Healer, 3 DPS".
 * Without `roles`, `size` numbered slots. Totals include the host.
 */
export function parseSlots(roles: string | null, size: number | null): Parsed<LfgSlotGroup[]> {
  if (!roles) {
    const count = size ?? 5;
    if (count < 2 || count > MAX_SLOTS)
      return { ok: false, error: `Groups hold 2 to ${MAX_SLOTS} players.` };
    return { ok: true, value: [{ name: "", count }] };
  }
  const groups: LfgSlotGroup[] = [];
  for (const raw of roles
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = raw.match(/^(\d+)\s*x?\s+(.+)$/i) ?? raw.match(/^(.+?)\s+x?(\d+)$/i);
    const [name, count] = m ? (/^\d/.test(raw) ? [m[2], m[1]] : [m[1], m[2]]) : [raw, "1"];
    const clean = (name ?? "").trim();
    if (!NAME.test(clean)) {
      return {
        ok: false,
        error: `"${raw}" isn't a role I can use. Use letters and numbers, up to 20 characters, like "Tank 1".`,
      };
    }
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1)
      return { ok: false, error: `"${raw}" needs a count of 1 or more.` };
    if (groups.some((g) => g.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: `"${clean}" is listed twice.` };
    }
    groups.push({ name: clean, count: n });
  }
  if (!groups.length) return { ok: false, error: 'List roles like "Tank 1, Healer 1, DPS 3".' };
  if (groups.length > MAX_GROUPS) return { ok: false, error: `Use ${MAX_GROUPS} roles at most.` };
  const total = groups.reduce((s, g) => s + g.count, 0);
  if (total < 2 || total > MAX_SLOTS)
    return { ok: false, error: `Groups hold 2 to ${MAX_SLOTS} players. That's ${total}.` };
  return { ok: true, value: groups };
}

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
