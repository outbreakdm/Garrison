import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { type Suggestion, suggestionSettings, suggestions, suggestionVotes } from "../schema";
import { readSuggestions, type SuggestionStatus, type SuggestionsConfig } from "../suggestions";

export async function getSuggestionSettings(db: Db, guildId: string): Promise<SuggestionsConfig> {
  const [row] = await db
    .select()
    .from(suggestionSettings)
    .where(eq(suggestionSettings.guildId, guildId));
  return readSuggestions(row ?? null);
}

/** Number and store a new suggestion. Retries once if two land on the same number. */
export async function createSuggestion(
  db: Db,
  input: {
    guildId: string;
    authorId: string;
    authorName: string;
    text: string;
    anonymous: boolean;
  },
): Promise<Suggestion> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await db
        .insert(suggestions)
        .values({
          ...input,
          number: sql`(SELECT coalesce(max(number), 0) + 1 FROM suggestions WHERE guild_id = ${input.guildId})`,
        })
        .returning();
      if (!row) throw new Error("Suggestion insert returned no row");
      return row;
    } catch (error) {
      if (attempt >= 2) throw error;
    }
  }
}

export async function setSuggestionMessage(
  db: Db,
  id: string,
  channelId: string,
  messageId: string,
) {
  await db.update(suggestions).set({ channelId, messageId }).where(eq(suggestions.id, id));
}

export async function getSuggestion(
  db: Db,
  guildId: string,
  id: string,
): Promise<Suggestion | null> {
  const [row] = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.guildId, guildId), eq(suggestions.id, id)));
  return row ?? null;
}

/** A member's current vote: +1, -1 or 0. */
export async function getVote(db: Db, suggestionId: string, userId: string): Promise<-1 | 0 | 1> {
  const [row] = await db
    .select({ value: suggestionVotes.value })
    .from(suggestionVotes)
    .where(and(eq(suggestionVotes.suggestionId, suggestionId), eq(suggestionVotes.userId, userId)));
  return (row?.value as -1 | 1 | undefined) ?? 0;
}

/** Set a member's vote (0 removes it) and return the suggestion with fresh counts. */
export async function castVote(
  db: Db,
  suggestionId: string,
  userId: string,
  value: -1 | 0 | 1,
): Promise<Suggestion | null> {
  return db.transaction(async (tx) => {
    if (value === 0)
      await tx
        .delete(suggestionVotes)
        .where(
          and(eq(suggestionVotes.suggestionId, suggestionId), eq(suggestionVotes.userId, userId)),
        );
    else
      await tx
        .insert(suggestionVotes)
        .values({ suggestionId, userId, value })
        .onConflictDoUpdate({
          target: [suggestionVotes.suggestionId, suggestionVotes.userId],
          set: { value },
        });
    const tally = await tx
      .select({ value: suggestionVotes.value, n: count() })
      .from(suggestionVotes)
      .where(eq(suggestionVotes.suggestionId, suggestionId))
      .groupBy(suggestionVotes.value);
    const up = tally.find((t) => t.value === 1)?.n ?? 0;
    const down = tally.find((t) => t.value === -1)?.n ?? 0;
    const [row] = await tx
      .update(suggestions)
      .set({ up, down, updatedAt: new Date() })
      .where(eq(suggestions.id, suggestionId))
      .returning();
    return row ?? null;
  });
}

/** Staff decide: a status and an optional note, with who decided. */
export async function setSuggestionStatus(
  db: Db,
  guildId: string,
  id: string,
  status: SuggestionStatus,
  note: string | null,
  decidedBy: string,
): Promise<Suggestion | null> {
  const [row] = await db
    .update(suggestions)
    .set({ status, staffNote: note, decidedBy, updatedAt: new Date() })
    .where(and(eq(suggestions.guildId, guildId), eq(suggestions.id, id)))
    .returning();
  return row ?? null;
}

/** For the dashboard: newest first, optionally one status. */
export async function listSuggestions(
  db: Db,
  guildId: string,
  status: SuggestionStatus | null,
  limit = 50,
): Promise<Suggestion[]> {
  return db
    .select()
    .from(suggestions)
    .where(
      status
        ? and(eq(suggestions.guildId, guildId), eq(suggestions.status, status))
        : eq(suggestions.guildId, guildId),
    )
    .orderBy(desc(suggestions.createdAt))
    .limit(limit);
}

/** How many suggestions are in each status, for the dashboard's filter tabs. */
export async function countSuggestions(db: Db, guildId: string) {
  const rows = await db
    .select({ status: suggestions.status, n: count() })
    .from(suggestions)
    .where(eq(suggestions.guildId, guildId))
    .groupBy(suggestions.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<
    Record<SuggestionStatus, number>
  >;
}
