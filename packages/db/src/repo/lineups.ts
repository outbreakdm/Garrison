import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { LINEUP_LIMITS, type LineupGroups, lineupProblem, type Placement } from "../raids";
import type { Parsed } from "../rally";
import { opsEvents, opsLineups, opsSignups } from "../schema";

/**
 * An organized raid's lineup: officers put members who answered into groups or on the bench
 * (the dashboard), then post it (the bot). Placing is free; nothing here needs Pro.
 */

const activeSignups = (db: Db, eventId: string) =>
  db
    .select()
    .from(opsSignups)
    .where(and(eq(opsSignups.eventId, eventId), isNull(opsSignups.leftAt)))
    .orderBy(asc(opsSignups.signedUpAt));

/** Saves the groups and where each member goes. Members left out keep their place. */
export async function saveLineup(
  db: Db,
  guildId: string,
  eventId: string,
  groups: LineupGroups,
  places: Map<string, Placement>,
): Promise<Parsed<null>> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(opsEvents)
      .where(and(eq(opsEvents.guildId, guildId), eq(opsEvents.id, eventId)))
      .for("update");
    if (!event) return { ok: false, error: "That raid is gone." };
    if (event.status !== "scheduled")
      return { ok: false, error: "That raid isn't scheduled anymore." };
    if (event.style !== "organized")
      return { ok: false, error: "Only organized raids have a lineup." };
    const signups = await tx
      .select()
      .from(opsSignups)
      .where(and(eq(opsSignups.eventId, eventId), isNull(opsSignups.leftAt)));
    // The places sent, over the places already saved, checked together.
    const merged = new Map<string, Placement>(
      signups.map((s) => [
        s.userId,
        s.availability === "cant"
          ? null
          : s.groupNo && s.groupNo <= groups.count
            ? s.groupNo
            : s.bench
              ? "bench"
              : null,
      ]),
    );
    for (const [userId, place] of places) merged.set(userId, place);
    const problem = lineupProblem(signups, groups, merged);
    if (problem) return { ok: false, error: problem };
    await tx.update(opsEvents).set({ groups }).where(eq(opsEvents.id, eventId));
    for (const s of signups) {
      if (s.availability === "cant") continue;
      const place = merged.get(s.userId) ?? null;
      const groupNo = typeof place === "number" ? place : null;
      const bench = place === "bench";
      if (groupNo === s.groupNo && bench === s.bench) continue;
      await tx
        .update(opsSignups)
        .set({ groupNo, bench })
        .where(and(eq(opsSignups.eventId, eventId), eq(opsSignups.userId, s.userId)));
    }
    return { ok: true, value: null };
  });
}

/**
 * Posts the lineup: from now on the card shows the groups. Anyone who answered but wasn't put
 * in a group sits on the bench, so reminders and attendance follow the lineup.
 */
export async function postLineup(db: Db, guildId: string, eventId: string) {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .update(opsEvents)
      .set({ lineupPostedAt: new Date() })
      .where(
        and(
          eq(opsEvents.guildId, guildId),
          eq(opsEvents.id, eventId),
          eq(opsEvents.status, "scheduled"),
          eq(opsEvents.style, "organized"),
        ),
      )
      .returning();
    if (!event) return null;
    await tx
      .update(opsSignups)
      .set({ bench: true })
      .where(
        and(
          eq(opsSignups.eventId, eventId),
          isNull(opsSignups.groupNo),
          isNull(opsSignups.leftAt),
          eq(opsSignups.bench, false),
        ),
      );
    return { event, signups: await activeSignups(tx as unknown as Db, eventId) };
  });
}

// --- Saved lineups ---------------------------------------------------------------

export async function listLineupLayouts(db: Db, guildId: string) {
  return db
    .select()
    .from(opsLineups)
    .where(eq(opsLineups.guildId, guildId))
    .orderBy(asc(opsLineups.createdAt));
}

/** Saves a raid's current lineup to reuse (its groups and who went where, by member). */
export async function saveLineupLayout(
  db: Db,
  guildId: string,
  eventId: string,
  rawName: unknown,
): Promise<Parsed<string>> {
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 40)
    return { ok: false, error: "Name the lineup, up to 40 characters." };
  const [event] = await db
    .select()
    .from(opsEvents)
    .where(and(eq(opsEvents.guildId, guildId), eq(opsEvents.id, eventId)));
  if (!event?.groups) return { ok: false, error: "Save this raid's lineup first." };
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opsLineups)
    .where(eq(opsLineups.guildId, guildId));
  if ((count?.n ?? 0) >= LINEUP_LIMITS.layouts)
    return {
      ok: false,
      error: `A server can keep ${LINEUP_LIMITS.layouts} lineups. Delete one first.`,
    };
  const signups = await activeSignups(db, eventId);
  const places = signups
    .filter((s) => s.availability !== "cant" && (s.groupNo || s.bench))
    .map((s) => ({ userId: s.userId, group: s.groupNo ?? 0 }));
  const [row] = await db
    .insert(opsLineups)
    .values({ guildId, name, groups: event.groups, places })
    .returning({ id: opsLineups.id });
  return row ? { ok: true, value: name } : { ok: false, error: "Try again in a minute." };
}

export async function getLineupLayout(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(opsLineups)
    .where(and(eq(opsLineups.guildId, guildId), eq(opsLineups.id, id)));
  return row ?? null;
}

export async function deleteLineupLayout(db: Db, guildId: string, id: string) {
  const rows = await db
    .delete(opsLineups)
    .where(and(eq(opsLineups.guildId, guildId), eq(opsLineups.id, id)))
    .returning({ id: opsLineups.id });
  return rows.length > 0;
}
