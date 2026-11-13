/**
 * Giveaways (module "Spoils"): a card with an Enter button; when time's up the
 * bot draws winners. Pure and shared (`@garrison/db/cards`).
 *
 * Free: 2 running at once, anyone can enter. Pro: 20 running, entry rules (a role
 * or a level from Ranks), bonus entries for chosen roles, and the card's color.
 */

import { ACCENT, STANDARD_ACCENT } from "./cards";
import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";

export interface BonusRole {
  roleId: string;
  /** Extra entries on top of the one everyone gets. */
  extra: number;
}

export interface GiveawayDraft {
  channelId: string;
  prize: string;
  description: string | null;
  winners: number;
  /** Minutes from now until the draw. */
  durationMinutes: number;
  requiredRoleId: string | null;
  minLevel: number | null;
  bonusRoles: BonusRole[];
  accent: string | null;
  /** Pro: start the same giveaway again as soon as this one is drawn. */
  repeat: boolean;
}

export const GIVEAWAY_LIMITS = {
  prize: 100,
  description: 500,
  winners: 20,
  bonusRoles: 3,
  extra: 10,
  minLevel: 500,
} as const;
export const RUNNING_HARD_MAX = FEATURES["giveaways.running"].pro;

/** How long a giveaway can run, offered as choices. */
export const GIVEAWAY_DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "1 day" },
  { minutes: 4320, label: "3 days" },
  { minutes: 10080, label: "1 week" },
  { minutes: 20160, label: "2 weeks" },
];

const SNOWFLAKE = /^\d{17,20}$/;
const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Check a new giveaway against its shape and the plan. */
export function checkGiveaway(
  raw: Record<string, unknown>,
  ent: Entitlements,
): Parsed<GiveawayDraft> {
  if (typeof raw.channelId !== "string" || !SNOWFLAKE.test(raw.channelId))
    return { ok: false, error: "Pick the channel to post it in." };
  const prize = line(raw.prize);
  if (!prize) return { ok: false, error: "Say what the prize is." };
  if (prize.length > GIVEAWAY_LIMITS.prize)
    return { ok: false, error: `Prizes can be ${GIVEAWAY_LIMITS.prize} characters.` };
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().replace(/\r\n/g, "\n")
      : null;
  if (description && description.length > GIVEAWAY_LIMITS.description)
    return { ok: false, error: `Descriptions can be ${GIVEAWAY_LIMITS.description} characters.` };
  const winners = Number(raw.winners);
  if (!Number.isInteger(winners) || winners < 1 || winners > GIVEAWAY_LIMITS.winners)
    return { ok: false, error: `Winners go from 1 to ${GIVEAWAY_LIMITS.winners}.` };
  const durationMinutes = Number(raw.durationMinutes);
  if (!GIVEAWAY_DURATIONS.some((d) => d.minutes === durationMinutes))
    return { ok: false, error: "Pick how long it runs." };

  const rules = ent["giveaways.rules"];
  let requiredRoleId: string | null = null;
  if (raw.requiredRoleId) {
    if (typeof raw.requiredRoleId !== "string" || !SNOWFLAKE.test(raw.requiredRoleId))
      return { ok: false, error: "Pick the needed role from this server's list." };
    requiredRoleId = raw.requiredRoleId;
  }
  let minLevel: number | null = null;
  if (raw.minLevel !== null && raw.minLevel !== undefined && raw.minLevel !== "") {
    const n = Number(raw.minLevel);
    if (!Number.isInteger(n) || n < 1 || n > GIVEAWAY_LIMITS.minLevel)
      return { ok: false, error: `Levels go from 1 to ${GIVEAWAY_LIMITS.minLevel}.` };
    minLevel = n;
  }
  const bonusRoles: BonusRole[] = [];
  for (const b of Array.isArray(raw.bonusRoles) ? raw.bonusRoles : []) {
    const x = (b ?? {}) as Record<string, unknown>;
    if (!x.roleId) continue;
    const extra = Number(x.extra);
    if (typeof x.roleId !== "string" || !SNOWFLAKE.test(x.roleId))
      return { ok: false, error: "Pick bonus roles from this server's list." };
    if (!Number.isInteger(extra) || extra < 1 || extra > GIVEAWAY_LIMITS.extra)
      return { ok: false, error: `Bonus entries go from 1 to ${GIVEAWAY_LIMITS.extra}.` };
    if (bonusRoles.some((y) => y.roleId === x.roleId))
      return { ok: false, error: "Each bonus role can be listed once." };
    bonusRoles.push({ roleId: x.roleId, extra });
  }
  if (bonusRoles.length > GIVEAWAY_LIMITS.bonusRoles)
    return { ok: false, error: `Up to ${GIVEAWAY_LIMITS.bonusRoles} bonus roles.` };
  let accent: string | null = null;
  if (raw.accent) {
    const a = typeof raw.accent === "string" ? raw.accent.trim().toLowerCase() : "";
    if (!ACCENT.test(a)) return { ok: false, error: "Pick the color as #rrggbb." };
    accent = a === STANDARD_ACCENT ? null : a;
  }
  const repeat = raw.repeat === true || raw.repeat === "on";
  if (!rules && (requiredRoleId || minLevel || bonusRoles.length || accent || repeat))
    return {
      ok: false,
      error: "Entry rules, bonus entries, repeating and your own color are part of Garrison Pro.",
    };
  return {
    ok: true,
    value: {
      channelId: raw.channelId,
      prize,
      description,
      winners,
      durationMinutes,
      requiredRoleId,
      minLevel,
      bonusRoles,
      accent,
      repeat,
    },
  };
}

/** How many entries a member gets: one, plus each bonus role they hold. */
export function entryWeight(bonusRoles: BonusRole[], memberRoles: Iterable<string>) {
  const has = new Set(memberRoles);
  return 1 + bonusRoles.reduce((n, b) => n + (has.has(b.roleId) ? b.extra : 0), 0);
}

/**
 * Draw up to `count` different winners, each entry weighing as much as its
 * entries. `random` returns [0, 1); the bot passes a crypto-backed one.
 */
export function drawWinners(
  entries: { userId: string; weight: number }[],
  count: number,
  random: () => number,
  exclude: Iterable<string> = [],
): string[] {
  const skip = new Set(exclude);
  const pool = entries.filter((e) => e.weight > 0 && !skip.has(e.userId));
  const winners: string[] = [];
  while (winners.length < count && pool.length) {
    const total = pool.reduce((n, e) => n + e.weight, 0);
    let pick = random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      pick -= (pool[i] as { weight: number }).weight;
      if (pick < 0) break;
    }
    const [won] = pool.splice(i, 1);
    if (won) winners.push(won.userId);
  }
  return winners;
}
