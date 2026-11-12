/**
 * Rally templates: per-server LFG presets whose wording and defaults adapt
 * Rally to any game. Pure and shared, so the bot and the dashboard validate
 * templates with exactly the same rules.
 */

import { FEATURES, type GuildPlan } from "./plans";

export interface LfgSlotGroupLike {
  name: string;
  count: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_GROUPS = 4;
export const MAX_SLOTS = 40;

const SLOT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} +'-]{0,19}$/u;

/**
 * Parse slot groups: "Tank 1, Healer 1, DPS 3", "Tank, Healer, 3 DPS".
 * Without `roles`, `size` numbered slots. Totals include the host.
 */
export function parseSlots(roles: string | null, size: number | null): Parsed<LfgSlotGroupLike[]> {
  if (!roles) {
    const count = size ?? 5;
    if (!Number.isInteger(count) || count < 2 || count > MAX_SLOTS)
      return { ok: false, error: `Groups hold 2 to ${MAX_SLOTS} players.` };
    return { ok: true, value: [{ name: "", count }] };
  }
  const groups: LfgSlotGroupLike[] = [];
  for (const raw of roles
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = raw.match(/^(\d+)\s*x?\s+(.+)$/i) ?? raw.match(/^(.+?)\s+x?(\d+)$/i);
    const [name, count] = m ? (/^\d/.test(raw) ? [m[2], m[1]] : [m[1], m[2]]) : [raw, "1"];
    const clean = (name ?? "").trim();
    if (!SLOT_NAME.test(clean)) {
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

// --- Wording -----------------------------------------------------------------

/**
 * Every player-facing phrase on an LFG card. Placeholders: {role}, {group},
 * {Group} (capitalised) and {title}.
 */
export interface RallyWording {
  /** What a group is called: "group", "squad", "party", "fireteam", "team". */
  group: string;
  /** Join button when the post has roles. */
  join: string;
  /** Join button for a post without roles. */
  joinAny: string;
  leave: string;
  close: string;
  /** Posted, with the members' pings, when every slot is filled. */
  full: string;
  /** Shown before the note, like "Item level" or "Rank". Null shows the note on its own. */
  requirement: string | null;
}

export const DEFAULT_WORDING: RallyWording = {
  group: "squad",
  join: "Join as {role}",
  joinAny: "Join",
  leave: "Leave",
  close: "Close {group}",
  full: "{Group}'s full.",
  requirement: null,
};

/** Each wording field's limit. Button labels stay well inside Discord's 80. */
export const WORDING_LIMITS: Record<keyof RallyWording, number> = {
  group: 20,
  join: 40,
  joinAny: 40,
  leave: 40,
  close: 40,
  full: 120,
  requirement: 24,
};

/** Human names for wording fields, for messages. */
export const WORDING_LABELS: Record<keyof RallyWording, string> = {
  group: "group word",
  join: "join button",
  joinAny: "join button (no roles)",
  leave: "leave button",
  close: "close button",
  full: "full message",
  requirement: "requirement label",
};

/**
 * Wording is plain text: no mentions, links, markdown, or line breaks, so a
 * template can't ping anyone or dress a card up as something else.
 */
const PLAIN = /^[^<>@`*_~|\\[\]()#\n\r\t/]*$/u;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fill placeholders. The result is still passed through Discord-safe escaping where it's sent. */
export function renderWording(
  text: string,
  w: Pick<RallyWording, "group">,
  vars: { role?: string; title?: string } = {},
) {
  return text
    .replaceAll("{role}", vars.role ?? "")
    .replaceAll("{group}", w.group)
    .replaceAll("{Group}", cap(w.group))
    .replaceAll("{title}", vars.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Templates ---------------------------------------------------------------

export interface RallyTemplate {
  /** Stable ID, so posts and history can refer to a template after it's renamed. */
  id: string;
  /** What players pick in /lfg create, e.g. "Mythic+". */
  name: string;
  /** The game it's for, for filters and the card. */
  game: string | null;
  /** Default roles, like "Tank 1, Healer 1, DPS 3". Null uses `size`. */
  roles: string | null;
  size: number | null;
  wording: RallyWording;
  /** Hours a post stays open after it starts. */
  lifetimeHours: number;
  /** Open a members-only voice channel when the group fills. */
  voice: boolean;
  /** Channels it can be posted in. Empty means any channel. */
  channelIds: string[];
  /** Pro: a role to notify when a post goes up. */
  notifyRoleId: string | null;
  /** Used when /lfg create names no template. */
  isDefault: boolean;
}

/** Rally's view of the plan list in plans.ts; kept so existing callers don't change. */
export const TEMPLATE_HARD_MAX = FEATURES["rally.templates"].pro;
export const PLAN_LIMITS: Record<GuildPlan, { templates: number; notifyRole: boolean }> = {
  free: {
    templates: FEATURES["rally.templates"].free,
    notifyRole: FEATURES["rally.notifyRole"].free,
  },
  pro: { templates: TEMPLATE_HARD_MAX, notifyRole: FEATURES["rally.notifyRole"].pro },
};

/** A role notification goes out at most this often per template. */
export const NOTIFY_COOLDOWN_MS = 15 * 60_000;

const TEMPLATE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} +'.-]{0,31}$/u;
const SNOWFLAKE = /^\d{17,20}$/;
const TEMPLATE_ID = /^[a-z0-9]{6,16}$/;

function str(v: unknown, max: number, label: string, nullable: true): Parsed<string | null>;
function str(v: unknown, max: number, label: string, nullable: false): Parsed<string>;
function str(v: unknown, max: number, label: string, nullable: boolean): Parsed<string | null> {
  if (v === null || v === undefined || v === "") {
    return nullable ? { ok: true, value: null } : { ok: false, error: `${label} can't be empty.` };
  }
  if (typeof v !== "string") return { ok: false, error: `${label} must be text.` };
  const t = v.trim().replace(/\s+/g, " ");
  if (!t)
    return nullable ? { ok: true, value: null } : { ok: false, error: `${label} can't be empty.` };
  if (t.length > max) return { ok: false, error: `${label} can be ${max} characters at most.` };
  if (!PLAIN.test(t))
    return {
      ok: false,
      error: `${label} can't use mentions, links, markdown or symbols like @ < > #.`,
    };
  return { ok: true, value: t };
}

/**
 * Check a server's whole template list. Everything that comes in (from the
 * dashboard form or the database) goes through here before it's used.
 */
export function checkTemplates(raw: unknown, plan: GuildPlan): Parsed<RallyTemplate[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Templates must be a list." };
  const limit = PLAN_LIMITS[plan];
  if (raw.length > limit.templates)
    return {
      ok: false,
      error:
        plan === "free"
          ? `Free servers can have ${limit.templates} templates. Garrison Pro allows ${TEMPLATE_HARD_MAX}.`
          : `A server can have ${limit.templates} templates at most.`,
    };
  const out: RallyTemplate[] = [];
  for (const [i, t] of raw.entries()) {
    const where = `Template ${i + 1}`;
    if (!t || typeof t !== "object") return { ok: false, error: `${where} isn't valid.` };
    const r = t as Record<string, unknown>;
    if (typeof r.id !== "string" || !TEMPLATE_ID.test(r.id))
      return { ok: false, error: `${where} has no valid ID.` };
    if (typeof r.name !== "string" || !TEMPLATE_NAME.test(r.name.trim()))
      return {
        ok: false,
        error: `${where}: names use letters, numbers, spaces and + ' . -, up to 32 characters.`,
      };
    const name = r.name.trim();
    const game = str(r.game, 40, `${name}: game`, true);
    if (!game.ok) return game;
    const roles = str(r.roles, 120, `${name}: roles`, true);
    if (!roles.ok) return roles;
    const size = r.size === null || r.size === undefined || r.size === "" ? null : Number(r.size);
    const slots = parseSlots(roles.value, size);
    if (!slots.ok) return { ok: false, error: `${name}: ${slots.error}` };

    const w = (r.wording ?? {}) as Record<string, unknown>;
    const wording = { ...DEFAULT_WORDING };
    for (const key of Object.keys(DEFAULT_WORDING) as (keyof RallyWording)[]) {
      const nullable = key === "requirement";
      const v = str(
        w[key] ?? (nullable ? null : DEFAULT_WORDING[key]),
        WORDING_LIMITS[key],
        `${name}: ${WORDING_LABELS[key]}`,
        nullable as true,
      );
      if (!v.ok) return v;
      (wording as Record<string, string | null>)[key] =
        v.value ?? (nullable ? null : DEFAULT_WORDING[key]);
    }
    if (!wording.join.includes("{role}") && slots.value.length > 1)
      return {
        ok: false,
        error: `${name}: the join button needs {role} when there are several roles.`,
      };

    const lifetimeHours = Number(r.lifetimeHours ?? 3);
    if (!Number.isInteger(lifetimeHours) || lifetimeHours < 1 || lifetimeHours > 12)
      return { ok: false, error: `${name}: posts stay open 1 to 12 hours after they start.` };
    const channelIds = Array.isArray(r.channelIds) ? r.channelIds : [];
    if (
      channelIds.length > 10 ||
      !channelIds.every((c) => typeof c === "string" && SNOWFLAKE.test(c))
    )
      return { ok: false, error: `${name}: pick up to 10 channels.` };
    const notifyRoleId = r.notifyRoleId ? String(r.notifyRoleId) : null;
    if (notifyRoleId && !SNOWFLAKE.test(notifyRoleId))
      return { ok: false, error: `${name}: pick a role to notify from the list.` };
    if (notifyRoleId && !limit.notifyRole)
      return { ok: false, error: `${name}: role notifications are part of Garrison Pro.` };

    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase()))
      return { ok: false, error: `Two templates are called "${name}".` };
    if (out.some((o) => o.id === r.id)) return { ok: false, error: `${where} repeats an ID.` };
    out.push({
      id: r.id,
      name,
      game: game.value,
      roles: roles.value,
      size: roles.value ? null : size,
      wording,
      lifetimeHours,
      voice: r.voice !== false,
      channelIds: [...new Set(channelIds as string[])],
      notifyRoleId,
      isDefault: r.isDefault === true,
    });
  }
  if (out.filter((t) => t.isDefault).length > 1)
    return { ok: false, error: "Only one template can be the default." };
  return { ok: true, value: out };
}

/** Starting points for a new template. Each is just wording and defaults: any game works. */
export const TEMPLATE_PRESETS: Record<
  string,
  Omit<RallyTemplate, "id" | "channelIds" | "notifyRoleId" | "isDefault">
> = {
  dungeon: {
    name: "Mythic+",
    game: "World of Warcraft",
    roles: "Tank 1, Healer 1, DPS 3",
    size: null,
    wording: {
      ...DEFAULT_WORDING,
      group: "group",
      full: "{Group} is ready. Good luck in the key.",
      requirement: "Item level",
    },
    lifetimeHours: 3,
    voice: true,
  },
  raid: {
    name: "Raid",
    game: null,
    roles: "Tank 2, Healer 4, DPS 14",
    size: null,
    wording: {
      ...DEFAULT_WORDING,
      group: "raid",
      join: "Sign up as {role}",
      close: "Close signups",
      full: "The {group} is full.",
      requirement: "Requirements",
    },
    lifetimeHours: 4,
    voice: true,
  },
  ranked: {
    name: "Ranked",
    game: null,
    roles: null,
    size: 5,
    wording: {
      ...DEFAULT_WORDING,
      group: "stack",
      joinAny: "Queue up",
      close: "Disband",
      full: "{Group}'s full. Queue up.",
      requirement: "Rank",
    },
    lifetimeHours: 2,
    voice: true,
  },
  fireteam: {
    name: "Fireteam",
    game: "Destiny 2",
    roles: null,
    size: 6,
    wording: {
      ...DEFAULT_WORDING,
      group: "fireteam",
      joinAny: "Join fireteam",
      close: "Disband",
      full: "Fireteam ready.",
      requirement: "Power",
    },
    lifetimeHours: 3,
    voice: true,
  },
  bossing: {
    name: "Bossing",
    game: "Old School RuneScape",
    roles: null,
    size: 5,
    wording: {
      ...DEFAULT_WORDING,
      group: "team",
      joinAny: "Join team",
      close: "Close team",
      full: "Team's full. See you at the boss.",
      requirement: "Gear",
    },
    lifetimeHours: 3,
    voice: false,
  },
  casual: {
    name: "Casual",
    game: null,
    roles: null,
    size: 4,
    wording: {
      ...DEFAULT_WORDING,
      group: "party",
      joinAny: "Hop in",
      close: "Close party",
      full: "{Group}'s full. Have fun.",
    },
    lifetimeHours: 3,
    voice: true,
  },
};

/** Up to 16 lowercase letters and digits, for template IDs. */
export function newTemplateId(random: () => number = Math.random) {
  let id = "";
  for (let i = 0; i < 10; i++)
    id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}
