/**
 * Dashboard access for people without Manage Server. A server's managers (Manage Server or
 * owner, checked live with Discord) give a person or a role one of two levels:
 *
 * - viewer: sees every page of this server's dashboard, changes nothing.
 * - editor: changes settings and posts (cards, messages, giveaways, tickets, raids, drafts
 *   with the AI assistant). Never the plan or billing, never who has access, and never what
 *   acts on members or the server's structure through the bot (moderation, purge, lockdown,
 *   backups, templates, applying an AI build, ending a season): those stay with managers.
 *
 * Grants live in one list per server and change through applySettingsChange, so every grant
 * and removal is in Settings history and can be undone. Access is re-checked on every request.
 */

export const ACCESS_LEVELS = ["viewer", "editor"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
/** What someone can do on a server's dashboard, highest last. */
export type DashboardRole = AccessLevel | "manager";

export interface AccessGrant {
  kind: "user" | "role";
  /** A Discord user or role ID. */
  id: string;
  level: AccessLevel;
  /** Their name when the grant was made, for the list only. Never used to decide access. */
  name: string;
}

export const ACCESS_LIMITS = { grants: 25, name: 100 } as const;

const RANK: Record<DashboardRole, number> = { viewer: 1, editor: 2, manager: 3 };

/** Does `role` include what `need` allows? */
export const atLeast = (role: DashboardRole, need: DashboardRole) => RANK[role] >= RANK[need];

const SNOWFLAKE = /^\d{17,20}$/;

/** The stored list, read defensively: anything malformed is dropped, never trusted. */
export function readAccessGrants(raw: unknown): AccessGrant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    if (!g || typeof g !== "object") return [];
    const { kind, id, level, name } = g as Record<string, unknown>;
    if ((kind !== "user" && kind !== "role") || typeof id !== "string" || !SNOWFLAKE.test(id))
      return [];
    if (level !== "viewer" && level !== "editor") return [];
    return [{ kind, id, level, name: typeof name === "string" ? name : "" }];
  });
}

/** A list the dashboard wants to save, checked whole. */
export function checkAccessGrants(
  raw: unknown,
): { ok: true; value: AccessGrant[] } | { ok: false; error: string } {
  if (!Array.isArray(raw))
    return { ok: false, error: "That list wasn't valid. Refresh and try again." };
  if (raw.length > ACCESS_LIMITS.grants)
    return { ok: false, error: `Up to ${ACCESS_LIMITS.grants} people and roles.` };
  const value = readAccessGrants(raw);
  if (value.length !== raw.length)
    return { ok: false, error: "Pick each person or role from this server, and a level." };
  const seen = new Set<string>();
  for (const g of value) {
    const key = `${g.kind}:${g.id}`;
    if (seen.has(key)) return { ok: false, error: "Each person or role can be listed once." };
    seen.add(key);
  }
  return {
    ok: true,
    value: value.map((g) => ({ ...g, name: g.name.trim().slice(0, ACCESS_LIMITS.name) })),
  };
}

/**
 * The level a member gets from the grants: the highest of their own and their roles'.
 * Null when nothing grants them access. `roleIds` are the member's roles as Discord reports
 * them right now.
 */
export function grantedLevel(
  grants: readonly AccessGrant[],
  userId: string,
  roleIds: readonly string[],
): AccessLevel | null {
  const roles = new Set(roleIds);
  let best: AccessLevel | null = null;
  for (const g of grants) {
    const applies = g.kind === "user" ? g.id === userId : roles.has(g.id);
    if (!applies) continue;
    if (g.level === "editor") return "editor";
    best = "viewer";
  }
  return best;
}

/**
 * Dashboard requests only managers may make: they act on members or the server's structure
 * through the bot, which holds powers an editor may not have in Discord.
 */
export const MANAGER_REQUEST_KINDS: ReadonlySet<string> = new Set([
  "lockdown_start",
  "lockdown_end",
  "release_quarantine",
  "undo_case",
  "mod_action",
  "purge",
  "backup_create",
  "backup_restore",
  "anti_nuke",
  "template_save",
  "template_apply",
  "qm_apply",
  "undo_build",
  "season_start",
  // Approving verification answers gives a role.
  "verify_decide",
  // Money: giving, taking and deciding on purchases.
  "economy_adjust",
  "economy_purchase",
]);
