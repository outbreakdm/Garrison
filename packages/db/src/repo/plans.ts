import { asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import type { GuildPlan } from "../plans";
import { guildPlans, guilds, platformStaff } from "../schema";

export type PlanSource = "stripe" | "comp";

export interface PlanDetails {
  plan: GuildPlan;
  /** Null on Free (no row). */
  source: PlanSource | null;
  grantedBy: string | null;
  note: string | null;
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
      updatedAt: guildPlans.updatedAt,
    })
    .from(guildPlans)
    .where(eq(guildPlans.guildId, guildId));
  return row ?? { plan: "free", source: null, grantedBy: null, note: null, updatedAt: null };
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
  const result = await db.execute<{ result: CompResult }>(
    sql`SELECT public.plan_set_comp(${actorId}, ${guildId}, ${comp}, ${note}) AS result`,
  );
  const rows = (
    Array.isArray(result) ? result : (result as { rows: { result: CompResult }[] }).rows
  ) as { result: CompResult }[];
  return rows[0]?.result ?? "free";
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
