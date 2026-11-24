/**
 * Raid signup styles. Simple: first come, first served by role, a full role benches you.
 * Organized: members answer whether they're coming and with which character, and officers
 * pick the lineup. Pure and shared by the bot, the dashboard and the player page.
 */

export const RAID_STYLES = ["simple", "organized"] as const;
export type RaidStyle = (typeof RAID_STYLES)[number];
export const isRaidStyle = (v: unknown): v is RaidStyle =>
  typeof v === "string" && (RAID_STYLES as readonly string[]).includes(v);

export const AVAILABILITY = ["coming", "tentative", "late", "cant"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const isAvailability = (v: unknown): v is Availability =>
  typeof v === "string" && (AVAILABILITY as readonly string[]).includes(v);

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  coming: "Coming",
  tentative: "Tentative",
  late: "Late",
  cant: "Can't",
};

/** The raid role a character's role fills ("healer" → "Healer"), or null when the raid has none. */
export function slotFor<T extends { name: string }>(slots: T[], role: string | null | undefined) {
  if (!role) return null;
  const want = role.trim().toLowerCase();
  return slots.find((s) => s.name.toLowerCase() === want)?.name ?? null;
}

// --- Lineups (organized raids) -----------------------------------------------------

/** How many groups a raid splits into, and how many fit in each. */
export interface LineupGroups {
  count: number;
  size: number;
}
export const LINEUP_LIMITS = { groups: 10, size: 10, layouts: 10 } as const;

/** Where a member goes: a group (1 is the first), the bench, or not placed yet. */
export type Placement = number | "bench" | null;

/** A raid's groups until officers change them: WoW's 5-player groups, else groups of 5. */
export function defaultGroups(slots: { count: number }[], game: string | null): LineupGroups {
  const capacity = slots.reduce((t, g) => t + g.count, 0);
  const count = Math.max(1, Math.ceil(capacity / 5));
  return { count: Math.min(game === "wow" ? 8 : LINEUP_LIMITS.groups, count), size: 5 };
}

export function checkGroups(raw: { count: unknown; size: unknown }): LineupGroups | null {
  const count = Number(raw.count);
  const size = Number(raw.size);
  if (!Number.isInteger(count) || count < 1 || count > LINEUP_LIMITS.groups) return null;
  if (!Number.isInteger(size) || size < 1 || size > LINEUP_LIMITS.size) return null;
  return { count, size };
}

interface Answer {
  userId: string;
  role: string;
  availability: string | null;
}

const PRIORITY: Record<string, number> = { coming: 0, late: 1, tentative: 2 };

/**
 * Fill by role: up to each role's count, Coming first, then Late, then Tentative (each in the
 * order they answered), spread across the groups role by role, in the raid's role order, so
 * the first role (usually tanks) lands in different groups. Everyone else who answered goes to
 * the bench; Can't isn't placed.
 */
export function fillByRole(
  answers: Answer[],
  slots: { name: string; count: number }[],
  groups: LineupGroups,
): Map<string, Placement> {
  const pool = answers
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.availability && a.availability !== "cant")
    .sort(
      (x, y) =>
        (PRIORITY[x.a.availability ?? ""] ?? 3) - (PRIORITY[y.a.availability ?? ""] ?? 3) ||
        x.i - y.i,
    )
    .map(({ a }) => a);
  const sizes = Array.from({ length: groups.count }, () => 0);
  const out = new Map<string, Placement>();
  for (const slot of slots) {
    for (const a of pool.filter((p) => p.role === slot.name).slice(0, slot.count)) {
      let best = -1;
      for (let i = 0; i < sizes.length; i++)
        if ((sizes[i] ?? 0) < groups.size && (best < 0 || (sizes[i] ?? 0) < (sizes[best] ?? 0)))
          best = i;
      if (best < 0) break;
      sizes[best] = (sizes[best] ?? 0) + 1;
      out.set(a.userId, best + 1);
    }
  }
  for (const a of pool) if (!out.has(a.userId)) out.set(a.userId, "bench");
  return out;
}

/**
 * A lineup as officers sent it, checked: only members who answered (not Can't), each group
 * within its size. Returns the reason it can't be saved, or null.
 */
export function lineupProblem(
  answers: Answer[],
  groups: LineupGroups,
  places: Map<string, Placement>,
): string | null {
  const known = new Map(answers.map((a) => [a.userId, a]));
  const counts = new Map<number, number>();
  for (const [userId, place] of places) {
    const a = known.get(userId);
    if (!a) return "Someone in the lineup didn't answer this raid.";
    if (place === null) continue;
    if (a.availability === "cant") return "Someone who can't come is in the lineup.";
    if (place === "bench") continue;
    if (!Number.isInteger(place) || place < 1 || place > groups.count)
      return `There are only ${groups.count} groups.`;
    counts.set(place, (counts.get(place) ?? 0) + 1);
    if ((counts.get(place) ?? 0) > groups.size)
      return `Group ${place} has more than ${groups.size} players.`;
  }
  return null;
}
