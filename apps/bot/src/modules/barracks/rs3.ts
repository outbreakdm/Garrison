import { politely } from "./osrs.js";

/**
 * RuneScape 3 hiscores. Public, no key. The "lite" endpoint answers in CSV: one
 * "rank,level,xp" line per skill, Overall first. Shares the polite spacing with
 * the OSRS lookups (same host).
 */

const HISCORES = "https://secure.runescape.com/m=hiscore/index_lite.ws";

export interface Rs3Stats {
  totalLevel: number;
  totalXp: number;
}

/** Overall from the CSV, or null when it doesn't look like hiscores. */
export function parseRs3(csv: string): Rs3Stats | null {
  const first = csv.trim().split("\n")[0]?.split(",");
  if (!first || first.length < 3) return null;
  const level = Number(first[1]);
  const xp = Number(first[2]);
  if (!Number.isFinite(level) || !Number.isFinite(xp)) return null;
  return { totalLevel: Math.max(level, 0), totalXp: Math.max(xp, 0) };
}

export type Rs3Result =
  | { ok: true; name: string; stats: Rs3Stats }
  | { ok: false; reason: "not_found" | "unavailable" };

export async function fetchRs3Hiscores(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Rs3Result> {
  await politely();
  try {
    const res = await fetchImpl(`${HISCORES}?player=${encodeURIComponent(name.trim())}`, {
      headers: { "User-Agent": "Garrison Discord bot (roster lookups)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const stats = parseRs3(await res.text());
    // RS3 doesn't return the name's capitalisation, so keep what the player typed.
    return stats ? { ok: true, name: name.trim(), stats } : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
