/**
 * Server stats: voice channels nobody can join whose names show a live count, like
 * "Members: 372". Garrison makes the channels (or renames ones the owner picks) and keeps
 * the numbers current. Discord lets a channel be renamed twice in ten minutes, so the bot
 * updates each channel at most once every ten minutes, and only when its number changed.
 * Pure and shared by the dashboard and the bot.
 *
 * Free: three counters. Pro: up to ten. ("Online" would need Discord's privileged Presence
 * intent, which Garrison doesn't ask for.)
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export const STAT_KINDS = {
  members: { label: "Members", template: "Members: {count}", about: "Everyone in the server" },
  humans: { label: "People", template: "People: {count}", about: "Members who aren't bots" },
  bots: { label: "Bots", template: "Bots: {count}", about: "Bot accounts" },
  role: {
    label: "Members with a role",
    template: "{role}: {count}",
    about: "Members who have one role, like Staff",
  },
  boosts: { label: "Boosts", template: "Boosts: {count}", about: "Server boosts" },
  channels: {
    label: "Channels",
    template: "Channels: {count}",
    about: "Text, voice, forum and stage channels",
  },
  roles: { label: "Roles", template: "Roles: {count}", about: "Roles, not counting @everyone" },
} as const;

export type StatKind = keyof typeof STAT_KINDS;
export const STAT_KIND_LIST = Object.keys(STAT_KINDS) as StatKind[];

export interface StatCounter {
  /** Stable across edits, so the bot keeps renaming the same channel. */
  key: string;
  kind: StatKind;
  /** For "role": whose members are counted. */
  roleId: string | null;
  /** The channel's name, with {count} (and {role} for a role). */
  template: string;
  /** A voice channel the owner picked; null: Garrison makes one. */
  channelId: string | null;
}

export interface ServerStatsConfig {
  enabled: boolean;
  counters: StatCounter[];
  /** Where Garrison's channels go. Null: a "Server stats" category Garrison makes at the top. */
  categoryId: string | null;
}

export const DEFAULT_SERVER_STATS: ServerStatsConfig = {
  enabled: false,
  counters: [],
  categoryId: null,
};

export const STATS_LIMITS = { template: 60, counters: 10 } as const;
/** Discord allows two renames per channel in ten minutes; one every ten keeps well clear. */
export const STATS_RENAME_MS = 10 * 60_000;
export const STATS_CATEGORY_NAME = "Server stats";
const SNOWFLAKE = /^\d{17,20}$/;
const KEY = /^[a-z0-9]{6,16}$/;

const isKind = (v: unknown): v is StatKind => typeof v === "string" && v in STAT_KINDS;

function readCounter(raw: unknown): StatCounter | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.key !== "string" || !KEY.test(c.key) || !isKind(c.kind)) return null;
  const roleId = typeof c.roleId === "string" && SNOWFLAKE.test(c.roleId) ? c.roleId : null;
  if (c.kind === "role" && !roleId) return null;
  const template =
    typeof c.template === "string" && c.template.trim()
      ? c.template.trim().slice(0, STATS_LIMITS.template)
      : STAT_KINDS[c.kind].template;
  return {
    key: c.key,
    kind: c.kind,
    roleId: c.kind === "role" ? roleId : null,
    template,
    channelId: typeof c.channelId === "string" && SNOWFLAKE.test(c.channelId) ? c.channelId : null,
  };
}

/** A stored row, read leniently: a counter that doesn't make sense is left out. */
export function readServerStats(
  raw: Partial<Record<keyof ServerStatsConfig, unknown>> | null,
): ServerStatsConfig {
  if (!raw) return { ...DEFAULT_SERVER_STATS, counters: [] };
  const counters = Array.isArray(raw.counters)
    ? raw.counters
        .map(readCounter)
        .filter((c): c is StatCounter => c !== null)
        .slice(0, STATS_LIMITS.counters)
    : [];
  return {
    enabled: raw.enabled === true,
    counters,
    categoryId:
      typeof raw.categoryId === "string" && SNOWFLAKE.test(raw.categoryId) ? raw.categoryId : null,
  };
}

/** A new counter's key: short, random, lowercase. */
export function newStatKey(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * Check a change from the dashboard. `before` is what's saved: on Free, counters already
 * saved under Pro stay, but nothing past the Free limit is added.
 */
export function checkServerStats(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: ServerStatsConfig,
): Parsed<ServerStatsConfig> {
  const list = Array.isArray(raw.counters) ? raw.counters : [];
  const counters: StatCounter[] = [];
  const keys = new Set<string>();
  const channels = new Set<string>();
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    if (!isKind(c.kind)) return { ok: false, error: "Pick what each counter counts." };
    if (c.kind === "role" && !(typeof c.roleId === "string" && SNOWFLAKE.test(c.roleId)))
      return { ok: false, error: "Pick the role for each “Members with a role” counter." };
    const template = typeof c.template === "string" ? c.template.trim() : "";
    if (template.length > STATS_LIMITS.template)
      return { ok: false, error: `Channel names hold ${STATS_LIMITS.template} characters.` };
    if (template && !template.includes("{count}"))
      return { ok: false, error: "Each name needs {count}, where the number goes." };
    const channelId = typeof c.channelId === "string" && c.channelId ? c.channelId : null;
    if (channelId && !SNOWFLAKE.test(channelId))
      return { ok: false, error: "Pick channels from this server's list." };
    if (channelId && channels.has(channelId))
      return { ok: false, error: "Each counter needs its own channel." };
    if (channelId) channels.add(channelId);
    let key = typeof c.key === "string" && KEY.test(c.key) ? c.key : newStatKey();
    while (keys.has(key)) key = newStatKey();
    keys.add(key);
    counters.push({
      key,
      kind: c.kind,
      roleId: c.kind === "role" ? (c.roleId as string) : null,
      template: template || STAT_KINDS[c.kind].template,
      channelId,
    });
  }
  const max = ent["stats.counters"];
  if (counters.length > STATS_LIMITS.counters)
    return { ok: false, error: `Up to ${STATS_LIMITS.counters} counters.` };
  if (counters.length > max && counters.length > before.counters.length)
    return {
      ok: false,
      error: `${max} counters on Free. Up to ${STATS_LIMITS.counters} are part of Garrison Pro.`,
    };
  const enabled = raw.enabled === true;
  if (enabled && !counters.length) return { ok: false, error: "Add a counter to turn it on." };
  const categoryId = typeof raw.categoryId === "string" && raw.categoryId ? raw.categoryId : null;
  if (categoryId && !SNOWFLAKE.test(categoryId))
    return { ok: false, error: "Pick the category from this server's list." };
  return { ok: true, value: { enabled, counters, categoryId } };
}

/** 1234 → "1,234": the same in every server, whatever its language. */
export const statNumber = (n: number) =>
  String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** A channel's name: the template filled in, within Discord's 100 characters. */
export function statName(template: string, count: number | null, roleName?: string | null) {
  const name = template
    .replaceAll("{count}", count === null ? "…" : statNumber(count))
    .replaceAll("{role}", roleName ?? "Role")
    .replace(/\s+/g, " ")
    .trim();
  return (name || "Stats").slice(0, 100);
}

/** Which counters need Garrison to know every member (humans, bots, a role's members). */
export const needsMemberList = (counters: StatCounter[]) =>
  counters.some((c) => c.kind === "humans" || c.kind === "bots" || c.kind === "role");
