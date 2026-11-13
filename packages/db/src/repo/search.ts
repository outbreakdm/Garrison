import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { memberXp, modCases } from "../schema";

/** Longest query we search for. Longer input is cut, not rejected. */
export const SEARCH_MAX = 64;

/** Escape LIKE wildcards so a search for "100%" or "a_b" matches literally. */
export function likeEscape(text: string) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Normalize a search box value: trimmed, bounded, and null when empty. */
export function cleanQuery(raw: unknown) {
  if (typeof raw !== "string") return null;
  const q = raw.trim().slice(0, SEARCH_MAX);
  return q || null;
}

/**
 * Cases matching "#123" / "123" by number, or a member's tag, ID or reason.
 * Parameterised throughout; the pattern only ever reaches ILIKE escaped.
 */
export async function searchCases(db: Db, guildId: string, q: string, limit = 25) {
  const number = /^#?(\d{1,9})$/.exec(q)?.[1];
  const pattern = `%${likeEscape(q)}%`;
  const match = number
    ? eq(modCases.caseNumber, Number(number))
    : or(
        ilike(modCases.targetTag, pattern),
        ilike(modCases.reason, pattern),
        /^\d{17,20}$/.test(q) ? eq(modCases.targetId, q) : sql`false`,
      );
  return db
    .select()
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), match))
    .orderBy(desc(modCases.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/** Members Garrison knows by name in this server: anyone with XP, plus anyone with a case. */
export async function searchMembers(db: Db, guildId: string, q: string, limit = 10) {
  const pattern = `%${likeEscape(q)}%`;
  const byId = /^\d{17,20}$/.test(q);
  const [xp, cased] = await Promise.all([
    db
      .select({ userId: memberXp.userId, name: memberXp.username, level: memberXp.level })
      .from(memberXp)
      .where(
        and(
          eq(memberXp.guildId, guildId),
          byId ? eq(memberXp.userId, q) : ilike(memberXp.username, pattern),
        ),
      )
      .orderBy(desc(memberXp.xp))
      .limit(limit),
    db
      .selectDistinctOn([modCases.targetId], {
        userId: modCases.targetId,
        name: modCases.targetTag,
      })
      .from(modCases)
      .where(
        and(
          eq(modCases.guildId, guildId),
          isNotNull(modCases.targetId),
          byId ? eq(modCases.targetId, q) : ilike(modCases.targetTag, pattern),
        ),
      )
      .orderBy(modCases.targetId, desc(modCases.createdAt))
      .limit(limit),
  ]);
  const out = new Map<string, { userId: string; name: string; level: number | null }>();
  for (const m of xp) out.set(m.userId, { ...m, name: m.name || m.userId });
  for (const m of cased) {
    if (!m.userId || out.has(m.userId)) continue;
    out.set(m.userId, { userId: m.userId, name: m.name ?? m.userId, level: null });
  }
  return [...out.values()].slice(0, limit);
}

/** Names Garrison has seen for these members (from Ranks), keyed by user ID. Unknown IDs are left out. */
export async function memberNames(db: Db, guildId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const rows = await db
    .select({ userId: memberXp.userId, name: memberXp.username })
    .from(memberXp)
    .where(and(eq(memberXp.guildId, guildId), inArray(memberXp.userId, userIds.slice(0, 500))));
  return new Map(rows.filter((r) => r.name).map((r) => [r.userId, r.name]));
}
