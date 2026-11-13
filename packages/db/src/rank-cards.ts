/**
 * Rank cards: the image /rank shows. Every server gets Garrison's standard card;
 * Pro picks a background, an accent colour, and up to 4 detail fields members fill
 * in themselves (in-game name, main, realm...), plus the game accounts a member
 * shares with the server. Pure and shared (`@garrison/db/cards`), so the bot draws
 * and the dashboard previews exactly the same rules.
 */

import { ACCENT, STANDARD_ACCENT } from "./cards";
import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export interface RankCardField {
  /** Stable ID: members' answers are stored under it, so renaming keeps them. */
  id: string;
  label: string;
  /**
   * Where the value comes from. Null: the member types it (/rankcard or their Account
   * page). Otherwise read from a game account they share with the server.
   */
  from: RankDetailSource | null;
  /** For details members type: an example shown in the empty box, like "Holy Paladin". */
  hint: string | null;
}

/**
 * Details a rank card can read from a member's shared game accounts instead of asking
 * for them. Each reads the first shared account of that game; no account, no line.
 */
export const RANK_DETAIL_SOURCES = {
  "wow:class": { label: "WoW class", short: "Class", provider: "wow", sample: "Paladin" },
  "wow:character": {
    label: "WoW character name",
    short: "Character",
    provider: "wow",
    sample: "Lightbringer",
  },
  "wow:level": { label: "WoW character level", short: "Level", provider: "wow", sample: "80" },
  "osrs:name": { label: "OSRS name", short: "RSN", provider: "osrs", sample: "Zezima" },
  "osrs:total": { label: "OSRS total level", short: "Total", provider: "osrs", sample: "2277" },
  "osrs:combat": { label: "OSRS combat level", short: "Combat", provider: "osrs", sample: "126" },
  "rs3:total": { label: "RuneScape total level", short: "Total", provider: "rs3", sample: "2898" },
} as const;
export type RankDetailSource = keyof typeof RANK_DETAIL_SOURCES;

interface LinkFacts {
  provider: string;
  displayName: string;
  details: Record<string, unknown>;
}

function readSource(source: RankDetailSource, link: LinkFacts): string | null {
  const d = link.details;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === "number" ? String(v) : null);
  switch (source) {
    case "wow:class":
      return str(d.className);
    case "wow:character":
      return str(d.name) ?? link.displayName;
    case "wow:level":
      return num(d.level);
    case "osrs:name":
      return link.displayName;
    case "osrs:total":
    case "rs3:total":
      return num(d.totalLevel);
    case "osrs:combat":
      return num(d.combatLevel);
  }
}

/** The details members type themselves (the rest come from linked accounts). */
export const memberFields = (fields: RankCardField[]) => fields.filter((f) => !f.from);

/** The lines a member's card shows: typed answers, and values from their shared accounts. */
export function rankDetailLines(
  fields: RankCardField[],
  answers: Record<string, string>,
  links: LinkFacts[],
): { label: string; value: string }[] {
  return fields.flatMap((f) => {
    if (!f.from) return answers[f.id] ? [{ label: f.label, value: answers[f.id] as string }] : [];
    const source = f.from;
    const provider = RANK_DETAIL_SOURCES[source].provider;
    const link = links.find((l) => l.provider === provider);
    const value = link ? readSource(source, link) : null;
    return value ? [{ label: f.label, value: value.slice(0, RANK_CARD_LIMITS.value) }] : [];
  });
}

export interface RankCardStyle {
  /** A preset key from RANK_BACKGROUNDS, or a Discord-hosted image link. */
  background: string;
  /** Null: Garrison volt. */
  accent: string | null;
  fields: RankCardField[];
  /** Show the game accounts a member shares with this server (Barracks). */
  showLinked: boolean;
}

export const RANK_CARD_LIMITS = { fields: 4, label: 24, value: 40, hint: 40 } as const;

/** Gradient backgrounds, top-left to bottom-right. "garrison" is the standard look. */
export const RANK_BACKGROUNDS: Record<string, { label: string; from: string; to: string }> = {
  garrison: { label: "Garrison", from: "#0b0d10", to: "#1a2028" },
  ember: { label: "Ember", from: "#160c08", to: "#4a1d0e" },
  frost: { label: "Frost", from: "#08111c", to: "#173a5c" },
  forest: { label: "Forest", from: "#08130d", to: "#1a3f29" },
  dusk: { label: "Dusk", from: "#120a1d", to: "#3b2160" },
  steel: { label: "Steel", from: "#111418", to: "#3a4350" },
};

export const DEFAULT_RANK_CARD: RankCardStyle = {
  background: "garrison",
  accent: null,
  fields: [],
  showLinked: false,
};

const FIELD_ID = /^[a-z0-9]{6,16}$/;
const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** A background image must be on Discord's CDN: the bot fetches it, and nothing else. */
export function isRankImage(url: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "cdn.discordapp.com" || u.hostname === "media.discordapp.net")
    );
  } catch {
    return false;
  }
}

export const isPresetBackground = (bg: string) => Object.hasOwn(RANK_BACKGROUNDS, bg);

export function parseRankCard(raw: unknown): Parsed<RankCardStyle> {
  if (raw === null || raw === undefined) return { ok: true, value: { ...DEFAULT_RANK_CARD } };
  if (typeof raw !== "object") return { ok: false, error: "That rank card isn't valid." };
  const r = raw as Record<string, unknown>;
  const background = line(r.background) || "garrison";
  if (!isPresetBackground(background) && !isRankImage(background))
    return {
      ok: false,
      error:
        "Pick a background, or paste a link to an image uploaded to Discord (cdn.discordapp.com).",
    };
  let accent: string | null = null;
  if (r.accent) {
    const a = typeof r.accent === "string" ? r.accent.trim().toLowerCase() : "";
    if (!ACCENT.test(a)) return { ok: false, error: "Pick the accent colour as #rrggbb." };
    accent = a === STANDARD_ACCENT ? null : a;
  }
  const rawFields = Array.isArray(r.fields) ? r.fields : [];
  if (rawFields.length > RANK_CARD_LIMITS.fields)
    return { ok: false, error: `A rank card can have ${RANK_CARD_LIMITS.fields} details.` };
  const fields: RankCardField[] = [];
  for (const f of rawFields) {
    const x = (f ?? {}) as Record<string, unknown>;
    if (typeof x.id !== "string" || !FIELD_ID.test(x.id))
      return { ok: false, error: "A detail has no valid ID. Refresh and try again." };
    const label = line(x.label);
    if (!label) return { ok: false, error: "Each detail needs a label, like Main or Realm." };
    if (label.length > RANK_CARD_LIMITS.label)
      return { ok: false, error: `Labels can be ${RANK_CARD_LIMITS.label} characters.` };
    if (fields.some((y) => y.id === x.id || y.label.toLowerCase() === label.toLowerCase()))
      return { ok: false, error: `Two details are called ${label}.` };
    const from =
      typeof x.from === "string" && Object.hasOwn(RANK_DETAIL_SOURCES, x.from)
        ? (x.from as RankDetailSource)
        : null;
    if (x.from && !from) return { ok: false, error: "Pick where each detail comes from." };
    const hint = from ? null : line(x.hint).slice(0, RANK_CARD_LIMITS.hint) || null;
    fields.push({ id: x.id, label, from, hint });
  }
  return { ok: true, value: { background, accent, fields, showLinked: r.showLinked === true } };
}

/** Stored style, read leniently: anything broken falls back to the standard card. */
export function readRankCard(raw: unknown): RankCardStyle {
  const parsed = parseRankCard(raw);
  return parsed.ok ? parsed.value : { ...DEFAULT_RANK_CARD };
}

/** What's Pro in this style, as labels. `before` is what's saved: unchanged values pass. */
export function lockedRankCard(
  style: RankCardStyle,
  ent: Entitlements,
  before: RankCardStyle = DEFAULT_RANK_CARD,
): string[] {
  if (ent["ranks.cards"]) return [];
  const out: string[] = [];
  if (style.background !== "garrison" && style.background !== before.background)
    out.push("Background");
  if (style.accent && style.accent !== before.accent) out.push("Accent colour");
  if (style.fields.length && JSON.stringify(style.fields) !== JSON.stringify(before.fields))
    out.push("Details on the card");
  if (style.showLinked && !before.showLinked) out.push("Linked game accounts");
  return out;
}

export function checkRankCard(
  raw: unknown,
  ent: Entitlements,
  before: RankCardStyle,
): Parsed<RankCardStyle> {
  const parsed = parseRankCard(raw);
  if (!parsed.ok) return parsed;
  const locked = lockedRankCard(parsed.value, ent, before);
  if (locked.length)
    return {
      ok: false,
      error: `${locked.join(", ")}: these parts of the rank card are Garrison Pro.`,
    };
  return parsed;
}

/** The style the bot draws on this plan: Pro values saved earlier pause on Free. */
export function rankCardForPlan(style: RankCardStyle, ent: Entitlements): RankCardStyle {
  return ent["ranks.cards"] ? style : { ...DEFAULT_RANK_CARD };
}

export const rankAccent = (style: RankCardStyle) => style.accent ?? STANDARD_ACCENT;

/** A member's answers, kept only for the server's current fields and capped. */
export function cleanRankDetails(
  fields: RankCardField[],
  raw: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = line(raw[f.id]).slice(0, RANK_CARD_LIMITS.value);
    if (v) out[f.id] = v;
  }
  return out;
}

/** XP progress as a share of the bar, 0 to 1. */
export const progressShare = (into: number, needed: number) =>
  needed > 0 ? Math.min(1, Math.max(0, into / needed)) : 0;
