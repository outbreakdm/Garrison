import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import { FEATURES, type GuildPlan } from "../plans";
import type { Parsed } from "../rally";
import {
  CHARACTERS_PER_MEMBER,
  type CharacterFields,
  checkTeamName,
  isRosterGame,
  type RosterStatus,
  TEAM_MEMBERS_MAX,
} from "../roster";
import {
  opsEvents,
  opsSignups,
  type RosterCharacter,
  type RosterTeam,
  rosterCharacters,
  rosterMembers,
  rosterTeams,
} from "../schema";

type Who = { id: string; name: string };

// --- Teams ---------------------------------------------------------------------

export async function listRosterTeams(db: Db, guildId: string) {
  return db
    .select()
    .from(rosterTeams)
    .where(eq(rosterTeams.guildId, guildId))
    .orderBy(asc(rosterTeams.createdAt));
}

export async function getRosterTeam(db: Db, guildId: string, teamId: string) {
  const [team] = await db
    .select()
    .from(rosterTeams)
    .where(and(eq(rosterTeams.guildId, guildId), eq(rosterTeams.id, teamId)))
    .limit(1);
  return team ?? null;
}

/** The game whose presets check characters here: WoW when any team plays it, else any game. */
export async function rosterGame(db: Db, guildId: string) {
  const teams = await listRosterTeams(db, guildId);
  return teams.find((t) => isRosterGame(t.game))?.game ?? null;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A new team, within the plan's number of teams and with a name no other team has. */
export async function createRosterTeam(
  db: Db,
  guildId: string,
  plan: GuildPlan,
  input: { name: unknown; game: unknown },
): Promise<Parsed<RosterTeam>> {
  const name = checkTeamName(input.name);
  if (!name.ok) return name;
  const teams = await listRosterTeams(db, guildId);
  const limit = FEATURES["roster.teams"][plan];
  if (teams.length >= limit)
    return {
      ok: false,
      error:
        plan === "free"
          ? `Free servers have ${limit} roster team. Garrison Pro allows ${FEATURES["roster.teams"].pro}.`
          : `A server can have ${limit} roster teams.`,
    };
  if (teams.some((t) => sameName(t.name, name.value)))
    return { ok: false, error: `There's already a team called ${name.value}.` };
  const [team] = await db
    .insert(rosterTeams)
    .values({ guildId, name: name.value, game: isRosterGame(input.game) ? input.game : null })
    .returning();
  if (!team) return { ok: false, error: "Try again in a minute." };
  return { ok: true, value: team };
}

export async function updateRosterTeam(
  db: Db,
  guildId: string,
  teamId: string,
  input: { name: unknown; game: unknown },
): Promise<Parsed<RosterTeam>> {
  const name = checkTeamName(input.name);
  if (!name.ok) return name;
  const teams = await listRosterTeams(db, guildId);
  if (!teams.some((t) => t.id === teamId)) return { ok: false, error: "That team is gone." };
  if (teams.some((t) => t.id !== teamId && sameName(t.name, name.value)))
    return { ok: false, error: `There's already a team called ${name.value}.` };
  const [team] = await db
    .update(rosterTeams)
    .set({ name: name.value, game: isRosterGame(input.game) ? input.game : null })
    .where(and(eq(rosterTeams.guildId, guildId), eq(rosterTeams.id, teamId)))
    .returning();
  return team ? { ok: true, value: team } : { ok: false, error: "That team is gone." };
}

/** Deletes the team and its member list; members keep their characters. */
export async function deleteRosterTeam(db: Db, guildId: string, teamId: string) {
  const rows = await db
    .delete(rosterTeams)
    .where(and(eq(rosterTeams.guildId, guildId), eq(rosterTeams.id, teamId)))
    .returning({ id: rosterTeams.id });
  return rows.length > 0;
}

// --- Team members ----------------------------------------------------------------

export async function listRosterMembers(db: Db, guildId: string, teamIds?: string[]) {
  if (teamIds && !teamIds.length) return [];
  return db
    .select()
    .from(rosterMembers)
    .where(
      and(
        eq(rosterMembers.guildId, guildId),
        teamIds ? inArray(rosterMembers.teamId, teamIds) : undefined,
      ),
    )
    .orderBy(asc(rosterMembers.addedAt));
}

/** Which teams one member is on, for their own view. */
export async function listMemberTeams(db: Db, guildId: string, userId: string) {
  return db
    .select({ team: rosterTeams, status: rosterMembers.status })
    .from(rosterMembers)
    .innerJoin(rosterTeams, eq(rosterTeams.id, rosterMembers.teamId))
    .where(and(eq(rosterMembers.guildId, guildId), eq(rosterMembers.userId, userId)))
    .orderBy(asc(rosterTeams.createdAt));
}

export type AddMemberResult = "added" | "already" | "full" | "no_team";

export async function addRosterMember(
  db: Db,
  guildId: string,
  teamId: string,
  who: Who,
  status: RosterStatus = "core",
): Promise<AddMemberResult> {
  const team = await getRosterTeam(db, guildId, teamId);
  if (!team) return "no_team";
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rosterMembers)
    .where(eq(rosterMembers.teamId, teamId));
  if ((count?.n ?? 0) >= TEAM_MEMBERS_MAX) return "full";
  const rows = await db
    .insert(rosterMembers)
    .values({ teamId, guildId, userId: who.id, username: who.name.slice(0, 100), status })
    .onConflictDoNothing()
    .returning({ userId: rosterMembers.userId });
  return rows.length ? "added" : "already";
}

export async function setRosterMember(
  db: Db,
  guildId: string,
  teamId: string,
  userId: string,
  patch: { status?: RosterStatus; note?: string | null },
) {
  if (patch.status === undefined && patch.note === undefined) return false;
  const rows = await db
    .update(rosterMembers)
    .set(patch)
    .where(
      and(
        eq(rosterMembers.guildId, guildId),
        eq(rosterMembers.teamId, teamId),
        eq(rosterMembers.userId, userId),
      ),
    )
    .returning({ userId: rosterMembers.userId });
  return rows.length > 0;
}

export async function removeRosterMember(db: Db, guildId: string, teamId: string, userId: string) {
  const rows = await db
    .delete(rosterMembers)
    .where(
      and(
        eq(rosterMembers.guildId, guildId),
        eq(rosterMembers.teamId, teamId),
        eq(rosterMembers.userId, userId),
      ),
    )
    .returning({ userId: rosterMembers.userId });
  return rows.length > 0;
}

// --- Characters ----------------------------------------------------------------

/** Characters of these members (or everyone's), each member's main first. */
export async function listRosterCharacters(db: Db, guildId: string, userIds?: string[]) {
  if (userIds && !userIds.length) return [];
  return db
    .select()
    .from(rosterCharacters)
    .where(
      and(
        eq(rosterCharacters.guildId, guildId),
        userIds ? inArray(rosterCharacters.userId, userIds.slice(0, 500)) : undefined,
      ),
    )
    .orderBy(
      asc(rosterCharacters.userId),
      desc(rosterCharacters.main),
      asc(rosterCharacters.createdAt),
    );
}

export async function getRosterCharacter(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(rosterCharacters)
    .where(and(eq(rosterCharacters.guildId, guildId), eq(rosterCharacters.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Adds a character for a member. Their first one is their main; `main` makes this one the main
 * instead. Names are unique per member (any case), up to CHARACTERS_PER_MEMBER each.
 */
export async function addRosterCharacter(
  db: Db,
  guildId: string,
  who: Who,
  fields: CharacterFields,
  main = false,
): Promise<Parsed<RosterCharacter>> {
  return db.transaction(async (tx) => {
    const mine = await tx
      .select({ id: rosterCharacters.id, name: rosterCharacters.name, main: rosterCharacters.main })
      .from(rosterCharacters)
      .where(and(eq(rosterCharacters.guildId, guildId), eq(rosterCharacters.userId, who.id)));
    if (mine.length >= CHARACTERS_PER_MEMBER)
      return {
        ok: false as const,
        error: `Each member can keep ${CHARACTERS_PER_MEMBER} characters here. Remove one first.`,
      };
    if (mine.some((c) => sameName(c.name, fields.name)))
      return { ok: false as const, error: `${fields.name} is already on the roster.` };
    const asMain = main || !mine.some((c) => c.main);
    if (asMain)
      await tx
        .update(rosterCharacters)
        .set({ main: false })
        .where(
          and(
            eq(rosterCharacters.guildId, guildId),
            eq(rosterCharacters.userId, who.id),
            eq(rosterCharacters.main, true),
          ),
        );
    const [row] = await tx
      .insert(rosterCharacters)
      .values({
        guildId,
        userId: who.id,
        username: who.name.slice(0, 100),
        ...fields,
        main: asMain,
      })
      .returning();
    if (!row) return { ok: false as const, error: "Try again in a minute." };
    // The member's latest name on every character, so the roster reads right after a rename.
    await tx
      .update(rosterCharacters)
      .set({ username: who.name.slice(0, 100) })
      .where(
        and(
          eq(rosterCharacters.guildId, guildId),
          eq(rosterCharacters.userId, who.id),
          ne(rosterCharacters.username, who.name.slice(0, 100)),
        ),
      );
    return { ok: true as const, value: row };
  });
}

/** Edits a character's fields. `userId` limits it to that member's own characters. */
export async function updateRosterCharacter(
  db: Db,
  guildId: string,
  id: string,
  fields: CharacterFields,
  userId?: string,
): Promise<Parsed<RosterCharacter>> {
  const current = await getRosterCharacter(db, guildId, id);
  if (!current || (userId && current.userId !== userId))
    return { ok: false, error: "That character is gone." };
  const others = await db
    .select({ name: rosterCharacters.name })
    .from(rosterCharacters)
    .where(
      and(
        eq(rosterCharacters.guildId, guildId),
        eq(rosterCharacters.userId, current.userId),
        ne(rosterCharacters.id, id),
      ),
    );
  if (others.some((c) => sameName(c.name, fields.name)))
    return { ok: false, error: `${fields.name} is already on the roster.` };
  const [row] = await db
    .update(rosterCharacters)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(rosterCharacters.guildId, guildId), eq(rosterCharacters.id, id)))
    .returning();
  return row ? { ok: true, value: row } : { ok: false, error: "That character is gone." };
}

/** Makes this character its member's main. `userId` limits it to that member's own. */
export async function setMainCharacter(db: Db, guildId: string, id: string, userId?: string) {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(rosterCharacters)
      .where(and(eq(rosterCharacters.guildId, guildId), eq(rosterCharacters.id, id)))
      .limit(1);
    if (!c || (userId && c.userId !== userId)) return false;
    await tx
      .update(rosterCharacters)
      .set({ main: false })
      .where(
        and(
          eq(rosterCharacters.guildId, guildId),
          eq(rosterCharacters.userId, c.userId),
          eq(rosterCharacters.main, true),
        ),
      );
    await tx.update(rosterCharacters).set({ main: true }).where(eq(rosterCharacters.id, id));
    return true;
  });
}

/** Removes a character. When it was the main, the member's oldest other one becomes the main. */
export async function removeRosterCharacter(db: Db, guildId: string, id: string, userId?: string) {
  return db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(rosterCharacters)
      .where(
        and(
          eq(rosterCharacters.guildId, guildId),
          eq(rosterCharacters.id, id),
          userId ? eq(rosterCharacters.userId, userId) : undefined,
        ),
      )
      .returning();
    if (!gone) return false;
    if (gone.main) {
      const [next] = await tx
        .select({ id: rosterCharacters.id })
        .from(rosterCharacters)
        .where(and(eq(rosterCharacters.guildId, guildId), eq(rosterCharacters.userId, gone.userId)))
        .orderBy(asc(rosterCharacters.createdAt))
        .limit(1);
      if (next)
        await tx
          .update(rosterCharacters)
          .set({ main: true })
          .where(eq(rosterCharacters.id, next.id));
    }
    return true;
  });
}

// --- Who can be added, and how often they show up ------------------------------------

/**
 * People an officer can put on a team: everyone with a character here, and everyone who signed up
 * for a raid in the last 90 days. Names are their last-known ones.
 */
export async function rosterCandidates(db: Db, guildId: string, now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const [characters, raiders] = await Promise.all([
    db
      .selectDistinct({ userId: rosterCharacters.userId, name: rosterCharacters.username })
      .from(rosterCharacters)
      .where(eq(rosterCharacters.guildId, guildId)),
    db
      .selectDistinct({ userId: opsSignups.userId })
      .from(opsSignups)
      .innerJoin(opsEvents, eq(opsEvents.id, opsSignups.eventId))
      .where(and(eq(opsEvents.guildId, guildId), gte(opsEvents.startsAt, since)))
      .limit(500),
  ]);
  const out = new Map<string, string>();
  for (const c of characters) out.set(c.userId, c.name);
  for (const r of raiders) if (!out.has(r.userId)) out.set(r.userId, "");
  return out;
}

/**
 * Raids each member was seated for and showed up to since `since` (decided ones only: Garrison
 * marks them when attendance tracking is on).
 */
export async function rosterAttendance(db: Db, guildId: string, userIds: string[], since: Date) {
  const out = new Map<string, { shown: number; total: number }>();
  if (!userIds.length) return out;
  const rows = await db
    .select({
      userId: opsSignups.userId,
      shown: sql<number>`count(*) filter (where ${opsSignups.attended})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(opsSignups)
    .innerJoin(opsEvents, eq(opsEvents.id, opsSignups.eventId))
    .where(
      and(
        eq(opsEvents.guildId, guildId),
        gte(opsEvents.startsAt, since),
        inArray(opsSignups.userId, userIds.slice(0, 500)),
        isNotNull(opsSignups.attended),
        eq(opsSignups.bench, false),
        isNull(opsSignups.leftAt),
      ),
    )
    .groupBy(opsSignups.userId);
  for (const r of rows) out.set(r.userId, { shown: r.shown, total: r.total });
  return out;
}
