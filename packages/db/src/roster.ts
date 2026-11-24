/**
 * The raid roster: teams, where each member stands on them, and members' characters. Pure and
 * shared, so the bot, the dashboard and the member pages check a character the same way.
 * Any game works with plain fields; a team's `game` adds presets (WoW: classes, specs, roles).
 */

import type { Parsed } from "./rally";

export const ROSTER_STATUSES = ["core", "trial", "bench", "social"] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  core: "Core",
  trial: "Trial",
  bench: "Bench",
  social: "Social",
};

/** Characters a member can keep in one server, main and alts together. */
export const CHARACTERS_PER_MEMBER = 10;
/** People on one team. */
export const TEAM_MEMBERS_MAX = 150;
export const ROSTER_NOTE_MAX = 300;
/** The roles a character can play when its game has no preset. Any other word works too. */
export const STANDARD_ROLES = ["Tank", "Healer", "DPS"] as const;

type Role = (typeof STANDARD_ROLES)[number];

/** World of Warcraft (retail): each class's specs and the role each spec plays. */
export const WOW_CLASSES: Record<string, Record<string, Role>> = {
  "Death Knight": { Blood: "Tank", Frost: "DPS", Unholy: "DPS" },
  "Demon Hunter": { Havoc: "DPS", Vengeance: "Tank", Devourer: "DPS" },
  Druid: { Balance: "DPS", Feral: "DPS", Guardian: "Tank", Restoration: "Healer" },
  Evoker: { Devastation: "DPS", Preservation: "Healer", Augmentation: "DPS" },
  Hunter: { "Beast Mastery": "DPS", Marksmanship: "DPS", Survival: "DPS" },
  Mage: { Arcane: "DPS", Fire: "DPS", Frost: "DPS" },
  Monk: { Brewmaster: "Tank", Mistweaver: "Healer", Windwalker: "DPS" },
  Paladin: { Holy: "Healer", Protection: "Tank", Retribution: "DPS" },
  Priest: { Discipline: "Healer", Holy: "Healer", Shadow: "DPS" },
  Rogue: { Assassination: "DPS", Outlaw: "DPS", Subtlety: "DPS" },
  Shaman: { Elemental: "DPS", Enhancement: "DPS", Restoration: "Healer" },
  Warlock: { Affliction: "DPS", Demonology: "DPS", Destruction: "DPS" },
  Warrior: { Arms: "DPS", Fury: "DPS", Protection: "Tank" },
};

/** Games with presets. A team without one takes any class, spec and role. */
export const ROSTER_GAMES = {
  wow: { label: "World of Warcraft", classes: WOW_CLASSES, groups: { count: 8, size: 5 } },
} as const;
export type RosterGame = keyof typeof ROSTER_GAMES;

export const isRosterGame = (game: unknown): game is RosterGame =>
  typeof game === "string" && Object.hasOwn(ROSTER_GAMES, game);

export const isRosterStatus = (status: unknown): status is RosterStatus =>
  typeof status === "string" && (ROSTER_STATUSES as readonly string[]).includes(status);

// Letters in any script, numbers, spaces and - ' . (names like "Zul'jin" or "Mr. Tank").
const NAME = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '.-]{0,31}$/u;
const FIELD = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '.+&/-]*$/u;

const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** The same word with its standard spelling, when it is one ("dps" → "DPS"). */
function standardRole(role: string) {
  return STANDARD_ROLES.find((r) => r.toLowerCase() === role.toLowerCase()) ?? role;
}

function caseOf<T extends string>(list: readonly T[] | T[], value: string) {
  return list.find((k) => k.toLowerCase() === value.toLowerCase()) ?? null;
}

export interface CharacterFields {
  name: string;
  className: string | null;
  spec: string | null;
  role: string | null;
}

/**
 * A character as typed, cleaned. With a game preset the class and spec must be that game's
 * (any case), and the spec decides the role when none is given.
 */
export function checkCharacter(
  raw: Record<string, unknown>,
  game: string | null,
): Parsed<CharacterFields> {
  const name = clean(raw.name);
  if (!NAME.test(name))
    return {
      ok: false,
      error: "A character's name uses letters, numbers, spaces and ' . -, up to 32 characters.",
    };
  let className = clean(raw.className) || null;
  let spec = clean(raw.spec) || null;
  let role = clean(raw.role) || null;
  for (const [label, value, max] of [
    ["class", className, 24],
    ["spec", spec, 24],
    ["role", role, 20],
  ] as const)
    if (value && (value.length > max || !FIELD.test(value)))
      return {
        ok: false,
        error: `The ${label} uses letters and numbers, up to ${max} characters.`,
      };

  if (isRosterGame(game)) {
    const classes = ROSTER_GAMES[game].classes;
    if (className) {
      const known = caseOf(Object.keys(classes), className);
      if (!known)
        return { ok: false, error: `${className} isn't a class in ${ROSTER_GAMES[game].label}.` };
      className = known;
      if (spec) {
        const specs = classes[known] ?? {};
        const knownSpec = caseOf(Object.keys(specs), spec);
        if (!knownSpec) return { ok: false, error: `${spec} isn't a ${known} spec.` };
        spec = knownSpec;
        role ??= specs[knownSpec] ?? null;
      }
    } else if (spec) return { ok: false, error: "Pick the class before the spec." };
  }
  return { ok: true, value: { name, className, spec, role: role ? standardRole(role) : null } };
}

export function checkTeamName(raw: unknown): Parsed<string> {
  const name = clean(raw);
  if (!name || name.length > 32 || !FIELD.test(name))
    return { ok: false, error: "A team's name uses letters and numbers, up to 32 characters." };
  return { ok: true, value: name };
}

export function checkRosterNote(raw: unknown): Parsed<string | null> {
  const note = typeof raw === "string" ? raw.trim() : "";
  if (note.length > ROSTER_NOTE_MAX)
    return { ok: false, error: `Keep the note to ${ROSTER_NOTE_MAX} characters.` };
  return { ok: true, value: note || null };
}

/** "Thrall · Restoration Shaman · Healer", the way rosters and signups show a character. */
export function describeCharacter(c: CharacterFields) {
  const kind = [c.spec, c.className].filter(Boolean).join(" ");
  return [c.name, kind || null, c.role].filter(Boolean).join(" · ");
}
