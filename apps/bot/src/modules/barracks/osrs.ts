/**
 * Old School RuneScape hiscores. Public, no key. Jagex publishes no rate
 * limit, so requests are spaced out and results cached on the link.
 */

const HISCORES = "https://secure.runescape.com/m=hiscore_oldschool/index_lite.json";
const MIN_GAP_MS = 1500;

/** RuneScape names: 1–12 letters, numbers, spaces, hyphens or underscores. */
export const isValidRsn = (name: string) =>
  /^[A-Za-z0-9 _-]{1,12}$/.test(name) && name.trim().length > 0;
export const normalizeRsn = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, " ");

export interface OsrsSkill {
  name: string;
  level: number;
  xp: number;
}

export interface OsrsStats {
  totalLevel: number;
  combatLevel: number;
  totalXp: number;
}

/** The standard OSRS combat level formula. Unranked skills count at their minimum. */
export function combatLevel(levels: Record<string, number>) {
  const lv = (skill: string, min = 1) => Math.max(min, levels[skill] ?? min);
  const base = 0.25 * (lv("Defense") + lv("Hitpoints", 10) + Math.floor(lv("Prayer") / 2));
  const melee = 0.325 * (lv("Attack") + lv("Strength"));
  const range = 0.325 * Math.floor((3 * lv("Ranged")) / 2);
  const mage = 0.325 * Math.floor((3 * lv("Magic")) / 2);
  return Math.floor(base + Math.max(melee, range, mage));
}

export function summarize(skills: OsrsSkill[]): OsrsStats {
  const levels = Object.fromEntries(skills.map((s) => [s.name, s.level]));
  const overall = skills.find((s) => s.name === "Overall");
  return {
    totalLevel: Math.max(overall?.level ?? 0, 0),
    totalXp: Math.max(overall?.xp ?? 0, 0),
    combatLevel: combatLevel(levels),
  };
}

let nextSlot = 0;
/** Space out hiscore requests (OSRS and RS3 share Jagex's host). */
export async function politely() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

export type HiscoreResult =
  | { ok: true; name: string; stats: OsrsStats }
  | { ok: false; reason: "not_found" | "unavailable" };

/** Look a player up. "not_found" also covers players too low-level to appear on the hiscores. */
export async function fetchHiscores(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HiscoreResult> {
  await politely();
  try {
    const res = await fetchImpl(`${HISCORES}?player=${encodeURIComponent(name.trim())}`, {
      headers: { "User-Agent": "Garrison Discord bot (roster lookups)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body = (await res.json()) as { name?: unknown; skills?: unknown };
    if (!Array.isArray(body.skills)) return { ok: false, reason: "unavailable" };
    const skills = body.skills
      .filter(
        (s): s is { name: string; level: number; xp: number } =>
          typeof s?.name === "string" && typeof s?.level === "number",
      )
      .map(({ name: n, level, xp }) => ({ name: n, level, xp: typeof xp === "number" ? xp : 0 }));
    return {
      ok: true,
      name: typeof body.name === "string" ? body.name : name.trim(),
      stats: summarize(skills),
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
