import "server-only";
import { type Db, readSettings, type SettingsModule } from "@garrison/db";

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

/**
 * The modules the Overview lists, and what "on" means for each: a switch that's on, or the
 * thing it needs (a channel, a saved item) in place. Read from the saved settings.
 */
const MODULES: {
  name: string;
  href: string;
  module: SettingsModule;
  on: (v: Record<string, unknown>) => boolean;
}[] = [
  { name: "Moderation log", href: "/watch", module: "watch", on: (v) => has(v.logChannelId) },
  { name: "Automod", href: "/watch", module: "automod", on: (v) => v.enabled === true },
  {
    name: "Anti-raid",
    href: "/gatehouse",
    module: "gatehouse",
    on: (v) => v.antiRaidEnabled === true,
  },
  { name: "Verification", href: "/gatehouse", module: "gatehouse", on: (v) => has(v.verifyRoleId) },
  { name: "Logs", href: "/ledger", module: "ledger", on: (v) => has(v.channelId) },
  { name: "Welcome", href: "/herald", module: "welcome", on: (v) => v.joinEnabled === true },
  { name: "Role menus", href: "/insignia", module: "roles", on: (v) => has(v.menus) },
  { name: "Tickets", href: "/parley", module: "tickets", on: (v) => has(v.panels) },
  { name: "Leveling", href: "/ranks", module: "ranks", on: (v) => v.enabled === true },
  { name: "Starboard", href: "/honors", module: "starboard", on: (v) => v.enabled === true },
  {
    name: "Suggestions",
    href: "/suggestions",
    module: "suggestions",
    on: (v) => v.enabled === true,
  },
  { name: "Stream alerts", href: "/beacon", module: "alerts", on: (v) => has(v.feeds) },
  { name: "Messages", href: "/dispatch", module: "messages", on: (v) => has(v.messages) },
  { name: "Voice rooms", href: "/voice", module: "voice", on: (v) => v.enabled === true },
  { name: "Game roles", href: "/barracks", module: "barracks", on: (v) => has(v.statRoles) },
];

export async function moduleStates(db: Db, guildId: string) {
  const wanted = [...new Set(MODULES.map((m) => m.module))];
  const values = new Map(
    await Promise.all(
      wanted.map(async (m) => [m, await readSettings(db, guildId, m).catch(() => null)] as const),
    ),
  );
  return MODULES.map((m) => {
    const v = values.get(m.module);
    return { name: m.name, href: m.href, on: v ? m.on(v) : false };
  });
}
