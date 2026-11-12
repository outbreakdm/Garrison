import { and, asc, count, desc, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import { memberXp, type RanksSettings, rankProfiles, rankRewards, ranksSettings } from "../schema";

/** XP needed to go from `level` to `level + 1`. A common, gently rising curve. */
export const xpForNextLevel = (level: number) => 5 * level * level + 50 * level + 100;

/** Level reached with `xp` total XP. */
export function levelForXp(xp: number) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  return { level, intoLevel: remaining, needed: xpForNextLevel(level) };
}

export async function getRanksSettings(db: Db, guildId: string): Promise<RanksSettings> {
  const [row] = await db.select().from(ranksSettings).where(eq(ranksSettings.guildId, guildId));
  return (
    row ?? {
      guildId,
      enabled: false,
      announce: "same_channel",
      announceChannelId: null,
      card: null,
      voiceXp: false,
      boosts: [],
      updatedAt: new Date(0),
    }
  );
}

export type RanksSettingsPatch = Partial<
  Pick<RanksSettings, "enabled" | "announce" | "announceChannelId">
>;

export async function updateRanksSettings(db: Db, guildId: string, patch: RanksSettingsPatch) {
  const [row] = await db
    .insert(ranksSettings)
    .values({ guildId, ...patch })
    .onConflictDoUpdate({ target: ranksSettings.guildId, set: { ...patch, updatedAt: new Date() } })
    .returning();
  if (!row) throw new Error("Ranks settings upsert returned no row");
  return row;
}

export type AwardResult =
  | { awarded: false }
  | { awarded: true; xp: number; level: number; leveledUpTo: number | null };

/**
 * Give `gain` XP unless the member got XP within `cooldownMs`. The cooldown is
 * part of the same statement, so it holds across bot processes and restarts.
 * A level-up is claimed with a conditional update, so it's announced once.
 */
export async function awardXp(
  db: Db,
  guildId: string,
  user: { id: string; username: string },
  gain: number,
  cooldownMs: number,
  now = new Date(),
  source: "message" | "voice" = "message",
): Promise<AwardResult> {
  const userId = user.id;
  const cutoff = new Date(now.getTime() - cooldownMs);
  const voice = source === "voice" ? 1 : 0;
  const [row] = await db
    .insert(memberXp)
    .values({
      guildId,
      userId,
      username: user.username,
      xp: gain,
      messages: 1 - voice,
      voiceMinutes: voice,
      lastXpAt: now,
    })
    .onConflictDoUpdate({
      target: [memberXp.guildId, memberXp.userId],
      set: {
        xp: sql`${memberXp.xp} + ${gain}`,
        messages: sql`${memberXp.messages} + ${1 - voice}`,
        voiceMinutes: sql`${memberXp.voiceMinutes} + ${voice}`,
        lastXpAt: now,
      },
      setWhere: lt(memberXp.lastXpAt, cutoff),
    })
    .returning();
  if (!row) return { awarded: false };

  const { level } = levelForXp(row.xp);
  let leveledUpTo: number | null = null;
  if (level > row.level) {
    const [claimed] = await db
      .update(memberXp)
      .set({ level })
      .where(
        and(eq(memberXp.guildId, guildId), eq(memberXp.userId, userId), lt(memberXp.level, level)),
      )
      .returning({ level: memberXp.level });
    leveledUpTo = claimed ? claimed.level : null;
  }
  return { awarded: true, xp: row.xp, level, leveledUpTo };
}

export async function getMemberRank(db: Db, guildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(memberXp)
    .where(and(eq(memberXp.guildId, guildId), eq(memberXp.userId, userId)));
  if (!row) return null;
  const [ahead] = await db
    .select({ n: count() })
    .from(memberXp)
    .where(and(eq(memberXp.guildId, guildId), gt(memberXp.xp, row.xp)));
  return { ...row, position: (ahead?.n ?? 0) + 1 };
}

export async function getLeaderboard(db: Db, guildId: string, limit = 10) {
  return db
    .select()
    .from(memberXp)
    .where(eq(memberXp.guildId, guildId))
    .orderBy(desc(memberXp.xp), asc(memberXp.userId))
    .limit(limit);
}

export async function setRankReward(db: Db, guildId: string, level: number, roleId: string | null) {
  await db
    .insert(rankRewards)
    .values({ guildId, level, roleId })
    .onConflictDoUpdate({
      target: [rankRewards.guildId, rankRewards.level],
      set: { roleId, updatedAt: new Date() },
    });
}

export async function listRankRewards(db: Db, guildId: string) {
  return db
    .select()
    .from(rankRewards)
    .where(and(eq(rankRewards.guildId, guildId), isNotNull(rankRewards.roleId)))
    .orderBy(asc(rankRewards.level));
}

/** What a member wrote on their rank card in this server. */
export async function getRankDetails(
  db: Db,
  guildId: string,
  userId: string,
): Promise<Record<string, string>> {
  const [row] = await db
    .select({ details: rankProfiles.details })
    .from(rankProfiles)
    .where(and(eq(rankProfiles.guildId, guildId), eq(rankProfiles.userId, userId)));
  return row?.details && typeof row.details === "object" ? row.details : {};
}

/** Servers where this member has earned XP: where a rank card can show their details. */
export async function listRankGuildsForUser(db: Db, userId: string) {
  return db
    .select({ guildId: memberXp.guildId, level: memberXp.level })
    .from(memberXp)
    .where(eq(memberXp.userId, userId));
}

/** Save a member's answers (already cleaned with cleanRankDetails). The bot and the dashboard both may. */
export async function saveRankDetails(
  db: Db,
  guildId: string,
  userId: string,
  details: Record<string, string>,
) {
  await db
    .insert(rankProfiles)
    .values({ guildId, userId, details })
    .onConflictDoUpdate({
      target: [rankProfiles.guildId, rankProfiles.userId],
      set: { details, updatedAt: new Date() },
    });
}
