import { and, inArray, sql } from "drizzle-orm";
import { type AccessGrant, readAccessGrants } from "../access";
import type { Db } from "../client";
import { dashboardAccess } from "../schema";

/** Who else may use this server's dashboard. Empty when nobody was ever given access. */
export async function getAccessGrants(db: Db, guildId: string): Promise<AccessGrant[]> {
  const [row] = await db
    .select({ grants: dashboardAccess.grants })
    .from(dashboardAccess)
    .where(sql`${dashboardAccess.guildId} = ${guildId}`);
  return readAccessGrants(row?.grants);
}

/** Servers whose list names this user directly, for their server list. Access is checked live. */
export async function listGuildIdsGrantedTo(db: Db, userId: string): Promise<string[]> {
  if (!/^\d{17,20}$/.test(userId)) return [];
  const rows = await db
    .select({ guildId: dashboardAccess.guildId })
    .from(dashboardAccess)
    .where(
      sql`${dashboardAccess.grants} @> ${JSON.stringify([{ kind: "user", id: userId }])}::jsonb`,
    );
  return rows.map((r) => r.guildId);
}

/** Of these servers, the ones that give access by role (each then needs a live role check). */
export async function listGuildIdsWithRoleGrants(db: Db, guildIds: string[]): Promise<string[]> {
  const ids = guildIds.filter((id) => /^\d{17,20}$/.test(id)).slice(0, 200);
  if (!ids.length) return [];
  const rows = await db
    .select({ guildId: dashboardAccess.guildId })
    .from(dashboardAccess)
    .where(
      and(
        inArray(dashboardAccess.guildId, ids),
        sql`${dashboardAccess.grants} @> ${JSON.stringify([{ kind: "role" }])}::jsonb`,
      ),
    );
  return rows.map((r) => r.guildId);
}
