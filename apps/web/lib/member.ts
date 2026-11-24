import "server-only";
import { getActiveGuild, getEconomy, getMemberPages, getRanksSettings } from "@garrison/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { isGuildMember } from "./discord";
import { isSnowflake } from "./security";
import { getSession, requireSession } from "./session";

/**
 * A member's own space in a server (docs/MEMBER_PAGES.md): anyone who's in the server now,
 * asked of Discord live. It shows a member only themselves and what's open to everyone (groups,
 * raids, the leaderboard): never settings, logs, or anyone else's cases. Managers count as
 * members here too. Read once per request: the layout and the page share it.
 */
export const memberSpace = cache(async (guildId: string) => {
  if (!isSnowflake(guildId)) notFound();
  const session = await requireSession(`/play/${guildId}`);
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  if (!guild || !(await isGuildMember(guild.id, session.userId))) notFound();
  const [pages, ranks, economy] = await Promise.all([
    getMemberPages(db, guild.id),
    getRanksSettings(db, guild.id),
    getEconomy(db, guild.id),
  ]);
  return {
    session,
    guild,
    /**
     * Which tabs show: You needs Leveling on; Your record is the owner's call; the Wallet
     * shows while the economy is on.
     */
    show: {
      you: pages.showYou && ranks.enabled,
      record: pages.showRecord,
      wallet: economy.enabled,
    },
    manager: session.manageableGuildIds.includes(guild.id),
  };
});

/**
 * The same check for a Server Action, which is a public endpoint: the session, the server,
 * membership now, and that the page it changes is on. Null on any failure; never trusts an ID
 * from the form for whose data it touches (that is always the session's own user).
 */
export async function memberCheck(guildId: string, page: "you" | "record" | "wallet" | "groups") {
  if (!isSnowflake(guildId)) return null;
  const session = await getSession();
  if (!session) return null;
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  if (!guild) return null;
  const [pages, ranks, economy, inServer] = await Promise.all([
    getMemberPages(db, guild.id),
    getRanksSettings(db, guild.id),
    getEconomy(db, guild.id),
    isGuildMember(guild.id, session.userId),
  ]);
  if (!inServer) return null;
  // Groups and raids (with the member's own roster characters) is always open to members.
  const on =
    page === "groups"
      ? true
      : page === "you"
        ? pages.showYou && ranks.enabled
        : page === "wallet"
          ? economy.enabled
          : pages.showRecord;
  return on ? { session, guild, db } : null;
}
