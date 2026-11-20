import { and, asc, eq, or } from "drizzle-orm";
import type { Db } from "../client";
import { birthdays, funSettings, funState } from "../schema";

/** Fun extras (best bot item 12). */

export async function getFunSettings(db: Db, guildId: string) {
  const [row] = await db.select().from(funSettings).where(eq(funSettings.guildId, guildId));
  return {
    birthdaysEnabled: row?.birthdaysEnabled ?? false,
    birthdayChannelId: row?.birthdayChannelId ?? null,
    birthdayRoleId: row?.birthdayRoleId ?? null,
    countingEnabled: row?.countingEnabled ?? false,
    countingChannelId: row?.countingChannelId ?? null,
  };
}

/** Servers with birthdays on, for the bot's sweep. */
export async function listBirthdayGuilds(db: Db) {
  return db.select().from(funSettings).where(eq(funSettings.birthdaysEnabled, true));
}

export async function setBirthday(
  db: Db,
  input: { guildId: string; userId: string; month: number; day: number },
) {
  await db
    .insert(birthdays)
    .values(input)
    .onConflictDoUpdate({
      target: [birthdays.guildId, birthdays.userId],
      set: { month: input.month, day: input.day },
    });
}

export async function removeBirthday(db: Db, guildId: string, userId: string) {
  const gone = await db
    .delete(birthdays)
    .where(and(eq(birthdays.guildId, guildId), eq(birthdays.userId, userId)))
    .returning({ userId: birthdays.userId });
  return gone.length > 0;
}

export async function getBirthday(db: Db, guildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(birthdays)
    .where(and(eq(birthdays.guildId, guildId), eq(birthdays.userId, userId)));
  return row ?? null;
}

/** Everyone whose birthday is one of these month-days. */
export async function birthdaysFor(
  db: Db,
  guildId: string,
  days: { month: number; day: number }[],
) {
  if (!days.length) return [];
  return db
    .select()
    .from(birthdays)
    .where(
      and(
        eq(birthdays.guildId, guildId),
        or(...days.map((d) => and(eq(birthdays.month, d.month), eq(birthdays.day, d.day)))),
      ),
    );
}

/** A server's birthdays in calendar order, for the dashboard and /birthday list. */
export async function listBirthdays(db: Db, guildId: string, limit = 500) {
  return db
    .select()
    .from(birthdays)
    .where(eq(birthdays.guildId, guildId))
    .orderBy(asc(birthdays.month), asc(birthdays.day))
    .limit(limit);
}

export async function getFunState(db: Db, guildId: string) {
  const [row] = await db.select().from(funState).where(eq(funState.guildId, guildId));
  return (
    row ?? { guildId, count: 0, lastUserId: null, best: 0, birthdayDate: null, birthdayHolders: [] }
  );
}

/**
 * Move the count on, only if it's still what the bot read (two messages at once can't both
 * count). Returns whether it moved.
 */
export async function advanceCount(
  db: Db,
  guildId: string,
  from: number,
  to: number,
  userId: string,
) {
  await db.insert(funState).values({ guildId }).onConflictDoNothing();
  const moved = await db
    .update(funState)
    .set({ count: to, lastUserId: userId })
    .where(and(eq(funState.guildId, guildId), eq(funState.count, from)))
    .returning({ best: funState.best });
  if (!moved[0]) return false;
  if (to > moved[0].best)
    await db.update(funState).set({ best: to }).where(eq(funState.guildId, guildId));
  return true;
}

export async function resetCount(db: Db, guildId: string) {
  await db.insert(funState).values({ guildId }).onConflictDoNothing();
  await db
    .update(funState)
    .set({ count: 0, lastUserId: null })
    .where(eq(funState.guildId, guildId));
}

/** Claim a day's birthdays: only one run per server per local date gets true. */
export async function claimBirthdayDate(db: Db, guildId: string, date: string) {
  await db.insert(funState).values({ guildId }).onConflictDoNothing();
  const [prev] = await db.select().from(funState).where(eq(funState.guildId, guildId));
  if (prev?.birthdayDate === date) return null;
  const claimed = await db
    .update(funState)
    .set({ birthdayDate: date })
    .where(
      and(
        eq(funState.guildId, guildId),
        prev?.birthdayDate
          ? eq(funState.birthdayDate, prev.birthdayDate)
          : eq(funState.guildId, guildId),
      ),
    )
    .returning({ guildId: funState.guildId });
  return claimed[0] ? { holders: prev?.birthdayHolders ?? [] } : null;
}

export async function setBirthdayHolders(db: Db, guildId: string, holders: string[]) {
  await db.update(funState).set({ birthdayHolders: holders }).where(eq(funState.guildId, guildId));
}
