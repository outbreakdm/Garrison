/**
 * XP boosts (Pro): a role, channel or category that multiplies the XP earned there.
 * ×0 turns XP off (a bot-commands channel, a "no XP" role). With several that
 * apply, any ×0 wins; otherwise the biggest. Shared by the bot and the dashboard.
 */

export interface RankBoost {
  kind: "role" | "channel";
  /** A role ID, or a channel or category ID (a category covers its channels). */
  id: string;
  multiplier: number;
}

export const BOOST_MULTIPLIERS = [0, 0.5, 1.5, 2, 3] as const;
export const BOOSTS_MAX = 10;
/** XP for each minute in voice, before boosts. Messages give 15 to 25, once a minute. */
export const VOICE_XP = 10;

const SNOWFLAKE = /^\d{17,20}$/;

export type BoostCheck = { ok: true; value: RankBoost[] } | { ok: false; error: string };

export function checkBoosts(raw: unknown): BoostCheck {
  if (!Array.isArray(raw)) return { ok: false, error: "That list of boosts wasn't valid." };
  if (raw.length > BOOSTS_MAX) return { ok: false, error: `Up to ${BOOSTS_MAX} boosts.` };
  const out: RankBoost[] = [];
  const seen = new Set<string>();
  for (const b of raw) {
    const kind = (b as RankBoost)?.kind;
    const id = (b as RankBoost)?.id;
    const multiplier = Number((b as RankBoost)?.multiplier);
    if ((kind !== "role" && kind !== "channel") || typeof id !== "string" || !SNOWFLAKE.test(id))
      return { ok: false, error: "Pick a role or channel for each boost." };
    if (!(BOOST_MULTIPLIERS as readonly number[]).includes(multiplier))
      return { ok: false, error: "Pick one of the listed multipliers." };
    if (seen.has(id)) return { ok: false, error: "Each role or channel can have one boost." };
    seen.add(id);
    out.push({ kind, id, multiplier });
  }
  return { ok: true, value: out };
}

/** Stored boosts, or none if what's stored no longer passes. */
export function readBoosts(raw: unknown): RankBoost[] {
  const checked = checkBoosts(raw ?? []);
  return checked.ok ? checked.value : [];
}

/** The multiplier for a member's roles in a channel (and that channel's category). */
export function boostFor(
  boosts: RankBoost[],
  where: { roleIds: Iterable<string>; channelId: string | null; parentId: string | null },
) {
  const roles = new Set(where.roleIds);
  const apply = boosts.filter((b) =>
    b.kind === "role" ? roles.has(b.id) : b.id === where.channelId || b.id === where.parentId,
  );
  if (!apply.length) return 1;
  if (apply.some((b) => b.multiplier === 0)) return 0;
  return Math.max(...apply.map((b) => b.multiplier));
}
