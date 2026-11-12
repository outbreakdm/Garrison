/**
 * Role menus: a card with buttons or a dropdown that members use to give
 * themselves roles. Pure and shared, so the dashboard and the bot check menus
 * with exactly the same rules. Browser-safe (`@garrison/db/cards`).
 *
 * Free: 3 menus, buttons or a dropdown, any number of picks or just one.
 * Pro: 25 menus, "up to N" picks, a role needed to use the menu, and the
 * card's Pro look. Over the limit after a downgrade, the extra menus pause:
 * nothing is deleted, they just stop working until the server re-subscribes.
 */

import { blankCard, type CustomCard, lockedCardFields, parseCard } from "./cards";
import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";

export interface RoleMenuOption {
  roleId: string;
  /** The button or dropdown label. */
  label: string;
  /** One standard emoji, or none. */
  emoji: string | null;
  /** Dropdowns only: a short line under the label. */
  description: string | null;
}

export type RoleMenuStyle = "buttons" | "dropdown";

export interface RoleMenu {
  /** Stable ID, used in the buttons' custom IDs so posted menus keep working after edits. */
  id: string;
  /** What the dashboard calls it. Members never see it. */
  name: string;
  card: CustomCard;
  style: RoleMenuStyle;
  options: RoleMenuOption[];
  /** Null: any number. 1: just one (picking another swaps). 2 and up: Pro. */
  maxPicks: number | null;
  /** Pro: only members with this role can use the menu. */
  requiredRoleId: string | null;
  /** Dropdowns only: the grey text before anything is picked. */
  placeholder: string | null;
}

export const ROLE_MENU_LIMITS = {
  name: 40,
  label: 80,
  description: 100,
  placeholder: 100,
  /** Three rows of five, which leaves room in Discord's 40-component budget. */
  buttons: 15,
  /** Discord's own limit for one dropdown. */
  dropdown: 25,
} as const;

export const MENU_HARD_MAX = FEATURES["roles.menus"].pro;
export const DEFAULT_PLACEHOLDER = "Pick your roles";

const MENU_ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;
/** Characters an emoji is built from: pictographs, flags, keycaps, joiners, skin tones. */
const EMOJI_PARTS =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|⃣|[#*0-9])+$/u;
const EMOJI_CORE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** One standard emoji (a single character as people see it), like 🎮, 🇬🇧 or 1️⃣. */
export function isOneEmoji(text: string) {
  if (text.length > 16 || !EMOJI_PARTS.test(text) || !EMOJI_CORE.test(text)) return false;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  return graphemes.length === 1;
}

/** How many menus this plan runs. Menus past it are paused, in list order. */
export const menuLimit = (ent: Entitlements) => ent["roles.menus"];
export const isPaused = (index: number, ent: Entitlements) => index >= menuLimit(ent);

/** The most options a menu of this style can hold. */
export const optionLimit = (style: RoleMenuStyle) =>
  style === "buttons" ? ROLE_MENU_LIMITS.buttons : ROLE_MENU_LIMITS.dropdown;

/** Starting points for a new menu. Every word can be changed after. */
export const ROLE_MENU_PRESETS: Record<
  string,
  { name: string; card: CustomCard; style: RoleMenuStyle; maxPicks: number | null }
> = {
  pings: {
    name: "Notifications",
    style: "buttons",
    maxPicks: null,
    card: {
      ...blankCard("Pick your pings"),
      blocks: [
        {
          kind: "text",
          text: "Choose what you want to hear about. Press a button again to drop it.",
        },
      ],
    },
  },
  games: {
    name: "Games",
    style: "dropdown",
    maxPicks: null,
    card: {
      ...blankCard("What do you play?"),
      blocks: [
        {
          kind: "text",
          text: "Pick your games to see their channels and find a group faster.",
        },
      ],
    },
  },
  colours: {
    name: "Name colour",
    style: "buttons",
    maxPicks: 1,
    card: {
      ...blankCard("Pick a name colour"),
      blocks: [{ kind: "text", text: "One colour at a time: picking another swaps it." }],
    },
  },
  blank: {
    name: "Role menu",
    style: "buttons",
    maxPicks: null,
    card: blankCard("Pick your roles"),
  },
};

const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

function parseOption(raw: unknown, where: string): Parsed<RoleMenuOption> {
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.roleId !== "string" || !SNOWFLAKE.test(r.roleId))
    return { ok: false, error: `${where} needs a role.` };
  const label = line(r.label);
  if (!label) return { ok: false, error: `${where} needs a label.` };
  if (label.length > ROLE_MENU_LIMITS.label)
    return { ok: false, error: `Labels can be ${ROLE_MENU_LIMITS.label} characters at most.` };
  const emoji = line(r.emoji) || null;
  if (emoji && !isOneEmoji(emoji))
    return { ok: false, error: `${label}: the emoji must be one standard emoji, like 🎮.` };
  const description = line(r.description) || null;
  if (description && description.length > ROLE_MENU_LIMITS.description)
    return {
      ok: false,
      error: `Descriptions can be ${ROLE_MENU_LIMITS.description} characters at most.`,
    };
  return { ok: true, value: { roleId: r.roleId, label, emoji, description } };
}

/** Check one menu's shape and limits. Plan rules are in `checkRoleMenus`. */
export function parseRoleMenu(raw: unknown, index = 0): Parsed<RoleMenu> {
  const where = `Menu ${index + 1}`;
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !MENU_ID.test(r.id))
    return { ok: false, error: `${where} has no valid ID.` };
  const name = line(r.name);
  if (!name) return { ok: false, error: `${where} needs a name.` };
  if (name.length > ROLE_MENU_LIMITS.name)
    return { ok: false, error: `Menu names can be ${ROLE_MENU_LIMITS.name} characters at most.` };
  const card = parseCard(r.card, name);
  if (!card.ok) return card;
  const style: RoleMenuStyle = r.style === "dropdown" ? "dropdown" : "buttons";
  if (r.style !== "dropdown" && r.style !== "buttons")
    return { ok: false, error: `${name}: pick buttons or a dropdown.` };

  if (!Array.isArray(r.options)) return { ok: false, error: `${where} isn't valid.` };
  const max = optionLimit(style);
  if (r.options.length > max)
    return {
      ok: false,
      error:
        style === "buttons"
          ? `${name}: a menu can have ${max} buttons. Switch to a dropdown for up to ${ROLE_MENU_LIMITS.dropdown}.`
          : `${name}: a dropdown can have ${max} roles at most.`,
    };
  const options: RoleMenuOption[] = [];
  for (const [i, o] of r.options.entries()) {
    const option = parseOption(o, `${name}, role ${i + 1}`);
    if (!option.ok) return option;
    if (options.some((x) => x.roleId === option.value.roleId))
      return { ok: false, error: `${name}: each role can be in the menu once.` };
    // Descriptions only show in dropdowns; buttons keep them for a switch back.
    options.push(option.value);
  }

  let maxPicks: number | null = null;
  if (r.maxPicks !== null && r.maxPicks !== undefined && r.maxPicks !== "") {
    const n = Number(r.maxPicks);
    if (!Number.isInteger(n) || n < 1 || n > ROLE_MENU_LIMITS.dropdown)
      return { ok: false, error: `${name}: picks go from 1 to ${ROLE_MENU_LIMITS.dropdown}.` };
    maxPicks = n;
  }

  let requiredRoleId: string | null = null;
  if (r.requiredRoleId) {
    if (typeof r.requiredRoleId !== "string" || !SNOWFLAKE.test(r.requiredRoleId))
      return { ok: false, error: `${name}: pick the needed role from this server's list.` };
    if (options.some((o) => o.roleId === r.requiredRoleId))
      return { ok: false, error: `${name}: the needed role can't also be in the menu.` };
    requiredRoleId = r.requiredRoleId;
  }

  const placeholder = line(r.placeholder) || null;
  if (placeholder && placeholder.length > ROLE_MENU_LIMITS.placeholder)
    return {
      ok: false,
      error: `${name}: the dropdown text can be ${ROLE_MENU_LIMITS.placeholder} characters at most.`,
    };

  return {
    ok: true,
    value: {
      id: r.id,
      name,
      card: card.value,
      style,
      options,
      maxPicks,
      requiredRoleId,
      placeholder,
    },
  };
}

/** Pro rules one menu breaks on this plan, as plain sentences. `before` is the same menu as saved. */
export function menuPlanProblems(
  menu: RoleMenu,
  ent: Entitlements,
  before?: RoleMenu | null,
): string[] {
  const out = lockedCardFields(menu.card, ent, before?.card).map(
    (f) => `${f.label} is part of Garrison Pro.`,
  );
  if (!ent["roles.limits"]) {
    if (menu.maxPicks !== null && menu.maxPicks > 1 && menu.maxPicks !== before?.maxPicks)
      out.push(
        `"Up to ${menu.maxPicks}" picks is part of Garrison Pro. Free menus allow any number or just one.`,
      );
    if (menu.requiredRoleId && menu.requiredRoleId !== before?.requiredRoleId)
      out.push("Needing a role to use a menu is part of Garrison Pro.");
  }
  return out;
}

/**
 * Check a server's whole menu list against its plan. `before` is the list as
 * saved: values and menus already saved are let through, so a server that went
 * back to Free keeps editing what it has (extra menus pause, nothing is lost).
 */
export function checkRoleMenus(
  raw: unknown,
  ent: Entitlements,
  before: RoleMenu[] = [],
): Parsed<RoleMenu[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Menus must be a list." };
  const limit = menuLimit(ent);
  if (raw.length > MENU_HARD_MAX)
    return { ok: false, error: `A server can have ${MENU_HARD_MAX} role menus at most.` };
  if (raw.length > limit && raw.length > before.length)
    return {
      ok: false,
      error: `Free servers can have ${limit} role menus. Garrison Pro allows ${MENU_HARD_MAX}.`,
    };
  const out: RoleMenu[] = [];
  for (const [i, m] of raw.entries()) {
    const menu = parseRoleMenu(m, i);
    if (!menu.ok) return menu;
    if (out.some((x) => x.id === menu.value.id))
      return { ok: false, error: "Two menus share an ID. Refresh and try again." };
    const problems = menuPlanProblems(
      menu.value,
      ent,
      before.find((b) => b.id === menu.value.id),
    );
    if (problems[0]) return { ok: false, error: `${menu.value.name}: ${problems[0]}` };
    out.push(menu.value);
  }
  return { ok: true, value: out };
}

/** Stored menus, read leniently: anything that no longer parses is skipped, never thrown. */
export function readRoleMenus(raw: unknown): RoleMenu[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m, i) => {
    const menu = parseRoleMenu(m, i);
    return menu.ok ? [menu.value] : [];
  });
}

/**
 * What a member's pick should change. `current` is the roles the member has
 * from this menu. Buttons toggle one role; a dropdown replaces the whole set.
 */
export function resolvePick(
  menu: Pick<RoleMenu, "options" | "maxPicks">,
  current: string[],
  pick: { toggle: string } | { set: string[] },
):
  | { ok: true; add: string[]; remove: string[] }
  | { ok: false; reason: "not_in_menu" | "too_many" } {
  const inMenu = new Set(menu.options.map((o) => o.roleId));
  const have = current.filter((id) => inMenu.has(id));
  if ("toggle" in pick) {
    if (!inMenu.has(pick.toggle)) return { ok: false, reason: "not_in_menu" };
    if (have.includes(pick.toggle)) return { ok: true, add: [], remove: [pick.toggle] };
    if (menu.maxPicks === 1) return { ok: true, add: [pick.toggle], remove: have };
    if (menu.maxPicks !== null && have.length >= menu.maxPicks)
      return { ok: false, reason: "too_many" };
    return { ok: true, add: [pick.toggle], remove: [] };
  }
  const want = [...new Set(pick.set)];
  if (!want.every((id) => inMenu.has(id))) return { ok: false, reason: "not_in_menu" };
  if (menu.maxPicks !== null && want.length > menu.maxPicks)
    return { ok: false, reason: "too_many" };
  return {
    ok: true,
    add: want.filter((id) => !have.includes(id)),
    remove: have.filter((id) => !want.includes(id)),
  };
}
