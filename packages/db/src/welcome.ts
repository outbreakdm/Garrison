/**
 * Welcome (module "Herald"): a card when someone joins, a card when someone
 * leaves, a welcome DM, and roles on join. Pure and browser-safe, so the
 * dashboard and the bot use the same defaults, placeholders and plan rules.
 *
 * Free: join and leave cards in a channel, 1 role on join. Pro: the welcome DM
 * and up to 5 roles on join (and the card's Pro look). Nothing is posted or
 * given while a raid is detected or the server is locked down.
 */

import { blankCard, type CustomCard, lockedCardFields, parseCard } from "./cards";
import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";

export interface WelcomeConfig {
  joinEnabled: boolean;
  joinChannelId: string | null;
  joinCard: CustomCard;
  leaveEnabled: boolean;
  leaveChannelId: string | null;
  leaveCard: CustomCard;
  dmEnabled: boolean;
  dmCard: CustomCard;
  joinRoleIds: string[];
}

/** Words in a card that become the member's details when it's sent. */
export const WELCOME_PLACEHOLDERS = [
  { token: "{user}", about: "mentions them" },
  { token: "{name}", about: "their name" },
  { token: "{server}", about: "this server's name" },
  { token: "{count}", about: "how many members there are now" },
] as const;

export const JOIN_ROLES_MAX = FEATURES["welcome.roles"].pro;

export const DEFAULT_WELCOME: WelcomeConfig = {
  joinEnabled: false,
  joinChannelId: null,
  joinCard: {
    ...blankCard("Welcome to {server}"),
    blocks: [{ kind: "text", text: "Glad you're here, {user}. You're member {count}." }],
  },
  leaveEnabled: false,
  leaveChannelId: null,
  leaveCard: {
    ...blankCard("{name} left"),
    blocks: [{ kind: "text", text: "{server} is down to {count} members." }],
  },
  dmEnabled: false,
  dmCard: {
    ...blankCard("Welcome to {server}"),
    blocks: [{ kind: "text", text: "Hi {name}. Read the rules channel first, then say hello." }],
  },
  joinRoleIds: [],
};

export interface WelcomeVars {
  userId: string;
  name: string;
  server: string;
  count: number;
}

const fill = (text: string, v: WelcomeVars, mention: boolean) =>
  text
    .replaceAll("{user}", mention ? `<@${v.userId}>` : v.name)
    .replaceAll("{name}", v.name)
    .replaceAll("{server}", v.server)
    .replaceAll("{count}", v.count.toLocaleString("en-US"));

/**
 * The card with its placeholders filled in. Names are used as they are: the
 * card's mentions never ping (only the new member can be pinged by {user}).
 * With `mention: false` (someone who left), {user} becomes their name.
 */
export function fillWelcome(
  card: CustomCard,
  vars: WelcomeVars,
  { mention = true }: { mention?: boolean } = {},
): CustomCard {
  return {
    ...card,
    title: fill(card.title, vars, mention).slice(0, 256),
    blocks: card.blocks.map((b) =>
      b.kind === "text" ? { kind: "text", text: fill(b.text, vars, mention) } : b,
    ),
    footer: card.footer === null ? null : fill(card.footer, vars, mention),
  };
}

const SNOWFLAKE = /^\d{17,20}$/;

function channel(v: unknown, label: string): Parsed<string | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  return typeof v === "string" && SNOWFLAKE.test(v)
    ? { ok: true, value: v }
    : { ok: false, error: `Pick the ${label} channel from this server's list.` };
}

/** A stored config, read leniently: anything that no longer parses falls back to the default. */
export function readWelcome(
  raw: Partial<Record<keyof WelcomeConfig, unknown>> | null,
): WelcomeConfig {
  const out = { ...DEFAULT_WELCOME };
  if (!raw) return out;
  for (const key of ["joinCard", "leaveCard", "dmCard"] as const) {
    const card = parseCard(raw[key]);
    if (card.ok) out[key] = card.value;
  }
  for (const key of ["joinEnabled", "leaveEnabled", "dmEnabled"] as const)
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  for (const key of ["joinChannelId", "leaveChannelId"] as const) {
    const c = channel(raw[key], "");
    if (c.ok) out[key] = c.value;
  }
  if (Array.isArray(raw.joinRoleIds))
    out.joinRoleIds = raw.joinRoleIds.filter(
      (id): id is string => typeof id === "string" && SNOWFLAKE.test(id),
    );
  return out;
}

/**
 * Check a change to the welcome settings against the plan. `before` is what's
 * saved: Pro values already saved are let through, so a server back on Free
 * keeps editing (the DM and extra roles pause until it re-subscribes).
 */
export function checkWelcome(
  patch: Partial<Record<keyof WelcomeConfig, unknown>>,
  ent: Entitlements,
  before: WelcomeConfig,
): Parsed<Partial<WelcomeConfig>> {
  const out: Partial<WelcomeConfig> = {};
  for (const key of ["joinEnabled", "leaveEnabled", "dmEnabled"] as const)
    if (key in patch) out[key] = patch[key] === true;
  for (const [key, label] of [
    ["joinChannelId", "welcome"],
    ["leaveChannelId", "leave"],
  ] as const) {
    if (!(key in patch)) continue;
    const c = channel(patch[key], label);
    if (!c.ok) return c;
    out[key] = c.value;
  }
  for (const [key, where] of [
    ["joinCard", "The welcome card"],
    ["leaveCard", "The leave card"],
    ["dmCard", "The welcome DM"],
  ] as const) {
    if (!(key in patch)) continue;
    const card = parseCard(patch[key], where);
    if (!card.ok) return card;
    const locked = lockedCardFields(card.value, ent, before[key]);
    if (locked[0])
      return { ok: false, error: `${where}: ${locked[0].label} is part of Garrison Pro.` };
    out[key] = card.value;
  }
  if ("joinRoleIds" in patch) {
    const ids = Array.isArray(patch.joinRoleIds) ? patch.joinRoleIds : [];
    if (!ids.every((id) => typeof id === "string" && SNOWFLAKE.test(id)))
      return { ok: false, error: "Pick roles from this server's list." };
    const unique = [...new Set(ids as string[])];
    const limit = ent["welcome.roles"];
    if (unique.length > JOIN_ROLES_MAX)
      return { ok: false, error: `Up to ${JOIN_ROLES_MAX} roles on join.` };
    if (unique.length > limit && unique.length > before.joinRoleIds.length)
      return {
        ok: false,
        error: `Free servers give ${limit} role on join. Garrison Pro gives up to ${JOIN_ROLES_MAX}.`,
      };
    out.joinRoleIds = unique;
  }
  const next = { ...before, ...out };
  if (next.joinEnabled && !next.joinChannelId)
    return { ok: false, error: "Pick a channel for the welcome card, or turn it off." };
  if (next.leaveEnabled && !next.leaveChannelId)
    return { ok: false, error: "Pick a channel for the leave card, or turn it off." };
  if (out.dmEnabled && !before.dmEnabled && !ent["welcome.dm"])
    return { ok: false, error: "The welcome DM is part of Garrison Pro." };
  return { ok: true, value: out };
}
