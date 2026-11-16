import "server-only";
import {
  getOpsTimezone,
  listRoleMenuPosts,
  nextOccurrence,
  readMessages,
  readSettings,
  type SettingsModule,
} from "@garrison/db";
import { cache } from "react";
import { getDb } from "./db";
import { botPermissions, channelNames } from "./discord";

/**
 * Whether each module is working, read from its saved settings and checked against the
 * server as it is now. Three states, so a green never lies:
 * - on: running.
 * - blocked: switched on (or set up) but it can't work, with the reason and where to fix it.
 * - off: not running, by choice or because nothing is set up yet.
 * The menu's dots, the Overview's "Needs attention" and the page heads all read this.
 */
export type ModuleState = "on" | "blocked" | "off";

export interface ModuleStatus {
  name: string;
  /** The page, as its path under the server ("/voice"). */
  href: string;
  state: ModuleState;
  /** For blocked: what's wrong, in a sentence. */
  reason?: string;
}

/** What the checks know about the server right now; null where Discord didn't answer. */
export interface ServerFacts {
  channels: Set<string> | null;
  perms: bigint | null;
  postedMenus: boolean;
  /** The server's time zone, for when scheduled messages next post. */
  tz: string;
}

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Move Members (or Administrator): needed to move someone into the room they made. */
const MOVE_MEMBERS = 1n << 24n;
const ADMINISTRATOR = 1n << 3n;

/** A saved channel that's been deleted. Unknown (Discord silent) never counts as gone. */
const gone = (facts: ServerFacts, id: string | null) =>
  Boolean(id && facts.channels && !facts.channels.has(id));

type Check = (
  v: Record<string, unknown>,
  facts: ServerFacts,
) => Omit<ModuleStatus, "name" | "href">;

const switchWithChannel =
  (flag: string, channel: string, what: string): Check =>
  (v, facts) => {
    if (v[flag] !== true) return { state: "off" };
    const id = str(v[channel]);
    if (!id) return { state: "blocked", reason: `On, but no ${what} channel is picked.` };
    if (gone(facts, id)) return { state: "blocked", reason: `Its ${what} channel was deleted.` };
    return { state: "on" };
  };

const MODULES: { name: string; href: string; module: SettingsModule; check: Check }[] = [
  {
    name: "Moderation log",
    href: "/watch",
    module: "watch",
    check: (v, f) => {
      const id = str(v.logChannelId);
      if (!id) return { state: "off" };
      return gone(f, id)
        ? { state: "blocked", reason: "The moderation log's channel was deleted." }
        : { state: "on" };
    },
  },
  {
    name: "Automod",
    href: "/watch",
    module: "automod",
    check: (v) => ({ state: v.enabled === true ? "on" : "off" }),
  },
  {
    name: "Anti-raid",
    href: "/gatehouse",
    module: "gatehouse",
    check: (v) => ({ state: v.antiRaidEnabled === true ? "on" : "off" }),
  },
  {
    name: "Verification",
    href: "/gatehouse",
    module: "gatehouse",
    check: (v) => ({ state: has(v.verifyRoleId) ? "on" : "off" }),
  },
  {
    // Events are always kept on the dashboard; a channel only adds posting them.
    name: "Logs",
    href: "/ledger",
    module: "ledger",
    check: (v, f) =>
      gone(f, str(v.channelId))
        ? { state: "blocked", reason: "Its log channel was deleted, so nothing is posted." }
        : { state: "on" },
  },
  {
    name: "Welcome",
    href: "/herald",
    module: "welcome",
    check: switchWithChannel("joinEnabled", "joinChannelId", "welcome"),
  },
  {
    // A menu works once it's posted in Discord.
    name: "Role menus",
    href: "/insignia",
    module: "roles",
    check: (_v, f) => ({ state: f.postedMenus ? "on" : "off" }),
  },
  {
    name: "Tickets",
    href: "/parley",
    module: "tickets",
    check: (v) => ({ state: has(v.panels) ? "on" : "off" }),
  },
  {
    name: "Leveling",
    href: "/ranks",
    module: "ranks",
    check: (v) => ({ state: v.enabled === true ? "on" : "off" }),
  },
  {
    name: "Starboard",
    href: "/honors",
    module: "starboard",
    check: switchWithChannel("enabled", "channelId", "starboard"),
  },
  {
    name: "Suggestions",
    href: "/suggestions",
    module: "suggestions",
    check: switchWithChannel("enabled", "channelId", "suggestions"),
  },
  {
    name: "Stream alerts",
    href: "/beacon",
    module: "alerts",
    check: (v) => ({ state: has(v.feeds) ? "on" : "off" }),
  },
  {
    // Running means something is on a schedule; saved drafts alone don't post anything.
    name: "Messages",
    href: "/dispatch",
    module: "messages",
    check: (v, f) => ({
      state: readMessages(v.messages).some((m) => m.schedule && nextOccurrence(m.schedule, f.tz))
        ? "on"
        : "off",
    }),
  },
  {
    name: "Voice rooms",
    href: "/voice",
    module: "voice",
    check: (v, f) => {
      if (v.enabled !== true) return { state: "off" };
      if (!has(v.creatorChannelIds))
        return { state: "blocked", reason: "On, but no “New room” channel is picked." };
      if (f.perms !== null && (f.perms & (MOVE_MEMBERS | ADMINISTRATOR)) === 0n)
        return { state: "blocked", reason: "Garrison can't move members: it needs Move Members." };
      return { state: "on" };
    },
  },
  {
    name: "Game roles",
    href: "/barracks",
    module: "barracks",
    check: (v) => ({ state: has(v.statRoles) ? "on" : "off" }),
  },
];

/** Every module's state. Read once per request: the layout and the page share it. */
export const moduleStates = cache(async (guildId: string): Promise<ModuleStatus[]> => {
  const db = await getDb();
  const wanted = [...new Set(MODULES.map((m) => m.module))];
  const [entries, postedMenus, names, perms, tz] = await Promise.all([
    Promise.all(
      wanted.map(async (m) => [m, await readSettings(db, guildId, m).catch(() => null)] as const),
    ),
    listRoleMenuPosts(db, guildId)
      .then((posts) => posts.length > 0)
      .catch(() => false),
    // Both cached 30 s and shared with the page. Unknown never blocks anything.
    channelNames(guildId).catch(() => null),
    botPermissions(guildId).catch(() => null),
    getOpsTimezone(db, guildId).catch(() => "UTC"),
  ]);
  const values = new Map(entries);
  const facts: ServerFacts = {
    channels: names ? new Set(names.keys()) : null,
    perms,
    postedMenus,
    tz,
  };
  return MODULES.map((m) => ({
    name: m.name,
    href: m.href,
    ...m.check(values.get(m.module) ?? {}, facts),
  }));
});

/** One page's state for its head: the worst of its modules, with the first reason. */
export async function pageStatus(
  guildId: string,
  href: string,
): Promise<{ state: ModuleState; reason?: string }> {
  const mods = (await moduleStates(guildId).catch(() => [])).filter((m) => m.href === href);
  const blocked = mods.find((m) => m.state === "blocked");
  if (blocked) return { state: "blocked", reason: blocked.reason };
  return { state: mods.some((m) => m.state === "on") ? "on" : "off" };
}

/** One state per page: blocked if anything on it is, else on if anything is, else off. */
export function pageStates(mods: ModuleStatus[]): Record<string, ModuleState> {
  const out: Record<string, ModuleState> = {};
  const rank = { off: 0, on: 1, blocked: 2 } as const;
  for (const m of mods) {
    const was = out[m.href];
    if (!was || rank[m.state] > rank[was]) out[m.href] = m.state;
  }
  return out;
}
