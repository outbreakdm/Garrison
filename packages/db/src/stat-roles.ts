/**
 * Roles that follow game stats (Pro): "OSRS total level 2000+ → @Maxed". A member
 * gets the role while an account they share with the server meets the rule, and
 * loses it when none does. Only shared accounts count, so turning sharing off
 * takes the roles away too. Shared by the bot and the dashboard.
 */

/** League of Legends ranked tiers, lowest first: a rule's "at least" is one of these (1 to 10). */
export const LOL_TIERS = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Emerald",
  "Diamond",
  "Master",
  "Grandmaster",
  "Challenger",
] as const;

/**
 * Each stat a rule can follow. Steam (level, games owned) and League (solo queue rank) come
 * from accounts linked through Discord's verified connections, looked up by the bot with
 * Garrison's own Steam and Riot keys (best bot item 8). `steps`: named values, shown as a list.
 */
export const STAT_SOURCES: Record<
  string,
  { label: string; max: number; steps?: readonly string[] }
> = {
  "osrs:totalLevel": { label: "OSRS total level", max: 2277 },
  "osrs:combatLevel": { label: "OSRS combat level", max: 126 },
  "rs3:totalLevel": { label: "RuneScape total level", max: 3000 },
  "wow:level": { label: "WoW character level", max: 90 },
  "steam:level": { label: "Steam level", max: 5000 },
  "steam:games": { label: "Steam games owned", max: 100_000 },
  "riotgames:lolTier": { label: "League solo queue rank", max: 10, steps: LOL_TIERS },
};
export type StatSource = string;

/** A rule's "at least", as people say it: "Gold" for League, the number otherwise. */
export const statValueLabel = (source: string, value: number) =>
  STAT_SOURCES[source]?.steps?.[value - 1] ?? value.toLocaleString("en-US");
export const STAT_ROLES_MAX = 10;

export interface StatRole {
  source: StatSource;
  min: number;
  roleId: string;
}

const SNOWFLAKE = /^\d{17,20}$/;

export type StatRolesCheck = { ok: true; value: StatRole[] } | { ok: false; error: string };

export function checkStatRoles(raw: unknown): StatRolesCheck {
  if (!Array.isArray(raw)) return { ok: false, error: "That list of rules wasn't valid." };
  if (raw.length > STAT_ROLES_MAX) return { ok: false, error: `Up to ${STAT_ROLES_MAX} rules.` };
  const out: StatRole[] = [];
  for (const r of raw) {
    const source = (r as StatRole)?.source;
    const roleId = (r as StatRole)?.roleId;
    const min = Number((r as StatRole)?.min);
    if (!Object.hasOwn(STAT_SOURCES, source)) return { ok: false, error: "Pick a game stat." };
    if (typeof roleId !== "string" || !SNOWFLAKE.test(roleId))
      return { ok: false, error: "Pick a role for each rule." };
    const spec = STAT_SOURCES[source as StatSource];
    if (!spec) return { ok: false, error: "Pick a game stat." };
    if (!Number.isInteger(min) || min < 1 || min > spec.max)
      return {
        ok: false,
        error: spec.steps
          ? `Pick the lowest ${spec.label.toLowerCase()} that gets the role.`
          : `${spec.label} goes from 1 to ${spec.max.toLocaleString("en-US")}.`,
      };
    out.push({ source: source as StatSource, min, roleId });
  }
  return { ok: true, value: out };
}

export function readStatRoles(raw: unknown): StatRole[] {
  const checked = checkStatRoles(raw ?? []);
  return checked.ok ? checked.value : [];
}

interface LinkStats {
  provider: string;
  details: Record<string, unknown>;
}

/** Does any of these (shared) accounts meet the rule? */
export function meetsStatRole(rule: StatRole, links: LinkStats[]) {
  const [provider, stat] = rule.source.split(":") as [string, string];
  return links.some((l) => {
    const v = l.details[stat];
    return l.provider === provider && typeof v === "number" && v >= rule.min;
  });
}

/**
 * Which roles to add and remove for one member. A role used by several rules is
 * kept when any of them is met.
 */
export function statRoleChanges(rules: StatRole[], links: LinkStats[], has: Set<string>) {
  const wanted = new Set<string>();
  const managed = new Set<string>();
  for (const r of rules) {
    managed.add(r.roleId);
    if (meetsStatRole(r, links)) wanted.add(r.roleId);
  }
  return {
    add: [...wanted].filter((id) => !has.has(id)),
    remove: [...managed].filter((id) => !wanted.has(id) && has.has(id)),
  };
}
