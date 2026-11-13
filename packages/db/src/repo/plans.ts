import { asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import type { GuildPlan } from "../plans";
import { guildPlans, guilds, planBundles, platformStaff } from "../schema";

export type PlanSource = "stripe" | "comp" | "bundle";

export interface PlanDetails {
  plan: GuildPlan;
  /** Null on Free (no row). */
  source: PlanSource | null;
  grantedBy: string | null;
  note: string | null;
  /** The Agency plan whose seat this server takes, when source is `bundle`. */
  bundleId: string | null;
  updatedAt: Date | null;
}

/** A server's plan with where it came from, for the Plan page. No row means Free. */
export async function getPlanDetails(db: Db, guildId: string): Promise<PlanDetails> {
  const [row] = await db
    .select({
      plan: guildPlans.plan,
      source: guildPlans.source,
      grantedBy: guildPlans.grantedBy,
      note: guildPlans.note,
      bundleId: guildPlans.bundleId,
      updatedAt: guildPlans.updatedAt,
    })
    .from(guildPlans)
    .where(eq(guildPlans.guildId, guildId));
  return (
    row ?? {
      plan: "free",
      source: null,
      grantedBy: null,
      note: null,
      bundleId: null,
      updatedAt: null,
    }
  );
}

/** True when this Discord user is Garrison staff (the owner bypass). */
export async function isStaff(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: platformStaff.userId })
    .from(platformStaff)
    .where(eq(platformStaff.userId, userId));
  return Boolean(row);
}

export type CompResult = "comp" | "paid" | "free";

/**
 * Give (comp = true) or remove complimentary Pro. The database checks that
 * `actorId` is staff and never changes a plan paid through Stripe ("paid").
 */
export async function setComp(
  db: Db,
  actorId: string,
  guildId: string,
  comp: boolean,
  note: string | null = null,
): Promise<CompResult> {
  return (
    (await one<CompResult>(
      db,
      sql`SELECT public.plan_set_comp(${actorId}, ${guildId}, ${comp}, ${note}) AS result`,
    )) ?? "free"
  );
}

export interface ServerPlanRow {
  guildId: string;
  name: string;
  joinedAt: Date;
  plan: GuildPlan;
  source: PlanSource | null;
  note: string | null;
}

/** Every server Garrison is in, with its plan, for the staff page. */
export async function listServerPlans(db: Db): Promise<ServerPlanRow[]> {
  const rows = await db
    .select({
      guildId: guilds.id,
      name: guilds.name,
      joinedAt: guilds.joinedAt,
      plan: guildPlans.plan,
      source: guildPlans.source,
      note: guildPlans.note,
    })
    .from(guilds)
    .leftJoin(guildPlans, eq(guildPlans.guildId, guilds.id))
    .where(isNull(guilds.leftAt))
    .orderBy(asc(guilds.name));
  return rows.map((r) => ({ ...r, plan: r.plan ?? "free" }));
}

/** First column of the first row: pglite and postgres-js shape results differently. */
async function one<T>(db: Db, query: ReturnType<typeof sql>): Promise<T | undefined> {
  const result = await db.execute<{ result: T }>(query);
  const rows = (Array.isArray(result) ? result : (result as { rows: { result: T }[] }).rows) as {
    result: T;
  }[];
  return rows[0]?.result;
}

// --- Agency plans: one subscription, Pro on up to `seats` servers ---------------------

export interface AgencyPlan {
  id: string;
  ownerId: string;
  seats: number;
  source: "stripe" | "comp";
  note: string | null;
  /** The servers in its seats, oldest first. */
  servers: { guildId: string; name: string }[];
}

/** The Agency plans this Discord user owns (usually one), with the servers in their seats. */
export async function listAgencyPlans(db: Db, ownerId: string): Promise<AgencyPlan[]> {
  const bundles = await db
    .select({
      id: planBundles.id,
      ownerId: planBundles.ownerId,
      seats: planBundles.seats,
      source: planBundles.source,
      note: planBundles.note,
    })
    .from(planBundles)
    .where(eq(planBundles.ownerId, ownerId))
    .orderBy(asc(planBundles.createdAt));
  if (!bundles.length) return [];
  const seats = await db
    .select({ bundleId: guildPlans.bundleId, guildId: guildPlans.guildId, name: guilds.name })
    .from(guildPlans)
    .innerJoin(guilds, eq(guilds.id, guildPlans.guildId))
    .where(
      inArray(
        guildPlans.bundleId,
        bundles.map((b) => b.id),
      ),
    )
    .orderBy(asc(guildPlans.updatedAt));
  return bundles.map((b) => ({
    ...b,
    source: b.source === "comp" ? "comp" : "stripe",
    servers: seats
      .filter((s) => s.bundleId === b.id)
      .map((s) => ({ guildId: s.guildId, name: s.name })),
  }));
}

export type SeatResult = "assigned" | "full" | "paid" | "taken" | "not_owner";

/**
 * Put a server in a seat of the owner's Agency plan. The caller must already have checked
 * that `actorId` manages the server; the database checks ownership and the seat count.
 */
export async function assignSeat(
  db: Db,
  actorId: string,
  bundleId: string,
  guildId: string,
): Promise<SeatResult> {
  return (
    (await one<SeatResult>(
      db,
      sql`SELECT public.plan_bundle_assign(${actorId}, ${bundleId}::uuid, ${guildId}) AS result`,
    )) ?? "not_owner"
  );
}

/** Free the seat a server takes in the actor's Agency plan; the server drops to Free. */
export async function releaseSeat(
  db: Db,
  actorId: string,
  guildId: string,
): Promise<"free" | "not_owner"> {
  return (
    (await one<"free" | "not_owner">(
      db,
      sql`SELECT public.plan_bundle_release(${actorId}, ${guildId}) AS result`,
    )) ?? "not_owner"
  );
}

/** Staff give (or resize) a complimentary Agency plan for a Discord user. Returns its id. */
export async function setAgencyComp(
  db: Db,
  actorId: string,
  ownerId: string,
  seats: number,
  note: string | null = null,
): Promise<string> {
  return (await one<string>(
    db,
    sql`SELECT public.plan_bundle_set_comp(${actorId}, ${ownerId}, ${seats}::int, ${note}) AS result`,
  )) as string;
}

/** Staff remove a complimentary Agency plan; its servers drop to Free. */
export async function removeAgencyComp(
  db: Db,
  actorId: string,
  bundleId: string,
): Promise<boolean> {
  return Boolean(
    await one<boolean>(
      db,
      sql`SELECT public.plan_bundle_remove_comp(${actorId}, ${bundleId}::uuid) AS result`,
    ),
  );
}

/** Every Agency plan, for the staff page. */
export async function listAllAgencyPlans(db: Db) {
  return db
    .select({
      id: planBundles.id,
      ownerId: planBundles.ownerId,
      seats: planBundles.seats,
      source: planBundles.source,
      note: planBundles.note,
      used: sql<number>`(SELECT count(*)::int FROM guild_plans p WHERE p.bundle_id = ${planBundles.id})`,
    })
    .from(planBundles)
    .orderBy(asc(planBundles.createdAt));
}
