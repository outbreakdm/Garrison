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

import type { dashboardActionKind } from "./schema";

type DashboardActionKind = (typeof dashboardActionKind.enumValues)[number];

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
  "undo_cases",
  "mod_action",
  "purge",
  "backup_create",
  "backup_restore",
  "anti_nuke",
  "template_save",
  "template_apply",
  "qm_apply",
  "qm_edit",
  "undo_build",
  "season_start",
  // Approving verification answers gives a role.
  "verify_decide",
  // Money: giving, taking and deciding on purchases.
  "economy_adjust",
  "economy_purchase",
]);

// --- Access groups -------------------------------------------------------------------
// Managers make named groups ("Giveaway hosts", "Raid officers") that give their people and
// roles None, View or Edit per dashboard area, and optionally switches for the manager-only
// requests above. Viewer and Editor grants stay as they are: Viewer is View on every area,
// Editor is Edit on every area. Who has access, member pages, the public page, the plan and
// billing are never an area: they stay with managers.

/** Dashboard areas, by the section's folder under /servers/<id>/. */
export const ACCESS_AREAS = {
  watch: "Moderation",
  gatehouse: "Security",
  ledger: "Logs",
  invites: "Invites",
  herald: "Welcome",
  insignia: "Role menus",
  dispatch: "Messages",
  parley: "Tickets",
  applications: "Applications",
  beacon: "Stream alerts",
  spoils: "Giveaways",
  honors: "Starboard",
  suggestions: "Suggestions",
  economy: "Economy",
  rally: "Groups and raids",
  voice: "Voice rooms",
  ranks: "Leveling",
  barracks: "Game accounts",
  quartermaster: "AI assistant",
  insights: "Insights",
  stats: "Server stats",
  fun: "Fun",
  utilities: "Utilities",
  settings: "Settings",
} as const;
export type AccessArea = keyof typeof ACCESS_AREAS;
export const isAccessArea = (v: unknown): v is AccessArea =>
  typeof v === "string" && Object.hasOwn(ACCESS_AREAS, v);

/** The manager-only requests a group can be trusted with, by family. */
export const ACCESS_SWITCHES = {
  moderate: {
    label: "Moderate members",
    about: "Warn, time out, kick and ban, purge messages, undo cases, release quarantine",
    kinds: ["mod_action", "purge", "undo_case", "undo_cases", "release_quarantine"],
  },
  lockdown: {
    label: "Lock down the server",
    about: "Start and end a lockdown, and the anti-nuke response",
    kinds: ["lockdown_start", "lockdown_end", "anti_nuke"],
  },
  backups: {
    label: "Backups and templates",
    about: "Make and restore backups, save and apply server templates",
    kinds: ["backup_create", "backup_restore", "template_save", "template_apply"],
  },
  coins: {
    label: "Coins and purchases",
    about: "Give or take coins, and decide on shop purchases",
    kinds: ["economy_adjust", "economy_purchase"],
  },
  verify: {
    label: "Verification decisions",
    about: "Approve or deny verification answers (gives the verified role)",
    kinds: ["verify_decide"],
  },
  ai_build: {
    label: "Apply AI builds",
    about: "Apply or edit what the AI assistant drafted, and undo a build",
    kinds: ["qm_apply", "qm_edit", "undo_build"],
  },
  season: {
    label: "Start a new season",
    about: "Reset Leveling into a new season",
    kinds: ["season_start"],
  },
} as const;
export type AccessSwitch = keyof typeof ACCESS_SWITCHES;
export const isAccessSwitch = (v: unknown): v is AccessSwitch =>
  typeof v === "string" && Object.hasOwn(ACCESS_SWITCHES, v);

/** The switch a manager-only request needs, or null for a request any editor of its area makes. */
export function switchFor(kind: string): AccessSwitch | null {
  for (const [key, s] of Object.entries(ACCESS_SWITCHES))
    if ((s.kinds as readonly string[]).includes(kind)) return key as AccessSwitch;
  return null;
}

export type AreaLevel = "view" | "edit";

export interface AccessGroupMember {
  kind: "user" | "role";
  id: string;
  /** Their name when added, for the list only. Never used to decide access. */
  name: string;
}

export interface AccessGroup {
  id: string;
  name: string;
  areas: Partial<Record<AccessArea, AreaLevel>>;
  switches: AccessSwitch[];
  members: AccessGroupMember[];
}

export const GROUP_LIMITS = { name: 32, members: 25 } as const;

/** The stored groups, read defensively: anything malformed is dropped, never trusted. */
export function readAccessGroups(raw: unknown): AccessGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    if (!g || typeof g !== "object") return [];
    const r = g as Record<string, unknown>;
    if (typeof r.id !== "string" || !/^[a-z0-9]{6,16}$/.test(r.id)) return [];
    if (typeof r.name !== "string" || !r.name.trim()) return [];
    const areas: AccessGroup["areas"] = {};
    if (r.areas && typeof r.areas === "object")
      for (const [area, level] of Object.entries(r.areas as Record<string, unknown>))
        if (isAccessArea(area) && (level === "view" || level === "edit")) areas[area] = level;
    const switches = Array.isArray(r.switches)
      ? [...new Set(r.switches.filter(isAccessSwitch))]
      : [];
    const members = Array.isArray(r.members)
      ? r.members.flatMap((m): AccessGroupMember[] => {
          if (!m || typeof m !== "object") return [];
          const { kind, id, name } = m as Record<string, unknown>;
          if ((kind !== "user" && kind !== "role") || typeof id !== "string" || !SNOWFLAKE.test(id))
            return [];
          return [{ kind, id, name: typeof name === "string" ? name : "" }];
        })
      : [];
    return [
      { id: r.id, name: r.name.trim().slice(0, GROUP_LIMITS.name), areas, switches, members },
    ];
  });
}

/** Groups the dashboard wants to save, checked whole against the plan's number of groups. */
export function checkAccessGroups(
  raw: unknown,
  limit: number,
): { ok: true; value: AccessGroup[] } | { ok: false; error: string } {
  if (!Array.isArray(raw))
    return { ok: false, error: "That list wasn't valid. Refresh and try again." };
  const value = readAccessGroups(raw);
  if (value.length !== raw.length)
    return { ok: false, error: "A group needs a name; pick people and roles from this server." };
  if (value.length > limit)
    return {
      ok: false,
      error: `This server's plan allows ${limit} access ${limit === 1 ? "group" : "groups"}.`,
    };
  const names = new Set<string>();
  for (const g of value) {
    const key = g.name.toLowerCase();
    if (names.has(key)) return { ok: false, error: `There's already a group called ${g.name}.` };
    names.add(key);
    if (g.members.length > GROUP_LIMITS.members)
      return { ok: false, error: `${g.name}: up to ${GROUP_LIMITS.members} people and roles.` };
    const seen = new Set<string>();
    for (const m of g.members) {
      if (seen.has(`${m.kind}:${m.id}`))
        return { ok: false, error: `${g.name}: each person or role can be listed once.` };
      seen.add(`${m.kind}:${m.id}`);
    }
  }
  return { ok: true, value };
}

/** What a member may do here, short of a manager. */
export interface ResolvedAccess {
  areas: Partial<Record<AccessArea, AreaLevel>>;
  switches: AccessSwitch[];
  /** Viewer or Editor from the plain grants, for what still asks for a level. */
  level: AccessLevel | null;
  /** The groups that gave them access, by name. */
  groups: string[];
}

const AREA_KEYS = Object.keys(ACCESS_AREAS) as AccessArea[];

/**
 * A member's access: the highest of their grants (Viewer: View on every area; Editor: Edit on
 * every area) and every group they or one of their roles is in. Null when nothing gives access.
 */
export function resolveAccess(
  grants: readonly AccessGrant[],
  groups: readonly AccessGroup[],
  userId: string,
  roleIds: readonly string[],
): ResolvedAccess | null {
  const roles = new Set(roleIds);
  const level = grantedLevel(grants, userId, roleIds);
  const areas: ResolvedAccess["areas"] = {};
  if (level) for (const a of AREA_KEYS) areas[a] = level === "editor" ? "edit" : "view";
  const switches = new Set<AccessSwitch>();
  const named: string[] = [];
  for (const g of groups) {
    const inIt = g.members.some((m) => (m.kind === "user" ? m.id === userId : roles.has(m.id)));
    if (!inIt) continue;
    named.push(g.name);
    for (const [area, lvl] of Object.entries(g.areas) as [AccessArea, AreaLevel][])
      if (lvl === "edit" || !areas[area]) areas[area] = lvl;
    for (const s of g.switches) switches.add(s);
  }
  if (!level && !named.length) return null;
  return { areas, switches: [...switches], level, groups: named };
}

/** May this access do `need` on `area`? View is enough to look; changing needs Edit. */
export const allows = (access: ResolvedAccess, area: AccessArea, need: AreaLevel) =>
  need === "view" ? !!access.areas[area] : access.areas[area] === "edit";

/** Requests that only change the requester's own place (a group, a raid, their own coins). */
export const SELF_REQUESTS: ReadonlySet<string> = new Set([
  "lfg_join",
  "lfg_leave",
  "raid_signup",
  "raid_withdraw",
  "raid_answer",
  "economy_buy",
  "web_verify",
]);

/**
 * The area each dashboard request belongs to: making it needs Edit there (self-service requests
 * need View), and a manager-only one also needs its switch. Null: no group can make it.
 */
export const REQUEST_AREAS: Record<DashboardActionKind, AccessArea | null> = {
  create_raid: "rally",
  move_signup: "rally",
  call_signups: "rally",
  cancel_raid: "rally",
  close_lfg: "rally",
  create_lfg: "rally",
  lfg_join: "rally",
  lfg_leave: "rally",
  raid_signup: "rally",
  raid_withdraw: "rally",
  raid_answer: "rally",
  post_lineup: "rally",
  post_lfg_panel: "rally",
  lockdown_start: "gatehouse",
  lockdown_end: "gatehouse",
  release_quarantine: "gatehouse",
  anti_nuke: "gatehouse",
  post_verify_panel: "gatehouse",
  verify_decide: "gatehouse",
  backup_create: "gatehouse",
  backup_restore: "gatehouse",
  undo_case: "watch",
  undo_cases: "watch",
  mod_action: "watch",
  purge: "watch",
  qm_plan: "quartermaster",
  qm_apply: "quartermaster",
  qm_cancel: "quartermaster",
  qm_chat: "quartermaster",
  qm_remove: "quartermaster",
  qm_edit: "quartermaster",
  undo_build: "quartermaster",
  template_save: "quartermaster",
  template_apply: "quartermaster",
  run_health: "settings",
  bot_profile: "settings",
  post_role_menu: "insignia",
  post_message: "dispatch",
  post_ticket_panel: "parley",
  ticket_action: "parley",
  ticket_bulk: "parley",
  start_giveaway: "spoils",
  giveaway_action: "spoils",
  test_alert: "beacon",
  post_stream_panel: "beacon",
  stream_request_decide: "beacon",
  season_start: "ranks",
  suggestion_status: "suggestions",
  post_suggestion_panel: "suggestions",
  economy_adjust: "economy",
  economy_purchase: "economy",
  post_shop_panel: "economy",
  economy_buy: null,
  web_verify: null,
  post_application_panel: "applications",
  application_decide: "applications",
};

/**
 * May this access make this request? Managers aside: Edit on its area (View for self-service),
 * and for a manager-only request, the switch for it too.
 */
export function mayRequest(access: ResolvedAccess, kind: string): boolean {
  const area = (REQUEST_AREAS as Record<string, AccessArea | null>)[kind];
  if (!area) return false;
  if (!allows(access, area, SELF_REQUESTS.has(kind) ? "view" : "edit")) return false;
  if (!MANAGER_REQUEST_KINDS.has(kind)) return true;
  const needs = switchFor(kind);
  return !!needs && access.switches.includes(needs);
}

/**
 * The area each settings module is changed (and undone) from. Null: managers only (who has
 * access, member pages and the public page).
 */
export const SETTINGS_AREAS: Record<string, AccessArea | null> = {
  watch: "watch",
  escalation: "watch",
  automod: "watch",
  gatehouse: "gatehouse",
  ledger: "ledger",
  ops: "rally",
  rally: "rally",
  ranks: "ranks",
  rewards: "ranks",
  roles: "insignia",
  welcome: "herald",
  messages: "dispatch",
  tickets: "parley",
  alerts: "beacon",
  starboard: "honors",
  barracks: "barracks",
  voice: "voice",
  suggestions: "suggestions",
  stats: "stats",
  invites: "invites",
  economy: "economy",
  applications: "applications",
  utilities: "utilities",
  fun: "fun",
  access: null,
  members: null,
};
