import "server-only";
import {
  type AccessLevel,
  listActiveGuilds,
  listGuildIdsGrantedTo,
  listGuildIdsWithRoleGrants,
} from "@garrison/db";
import { getDb } from "./db";
import { dashboardRole } from "./session";

type Session = { userId: string; manageableGuildIds: string[]; memberGuildIds: string[] };

/**
 * Servers someone shared with this user (by name or by one of their roles), for the server
 * list and switcher. Each is confirmed live, membership included, the same way every page
 * checks access: a grant that no longer applies simply doesn't show.
 */
export async function listSharedGuilds(session: Session) {
  const db = await getDb();
  const manageable = new Set(session.manageableGuildIds);
  const [direct, byRole] = await Promise.all([
    listGuildIdsGrantedTo(db, session.userId),
    listGuildIdsWithRoleGrants(db, session.memberGuildIds),
  ]);
  const candidates = [...new Set([...direct, ...byRole])]
    .filter((id) => !manageable.has(id))
    .slice(0, 25);
  if (!candidates.length) return [];
  const guilds = await listActiveGuilds(db, candidates);
  // One server Discord can't answer for right now is left out, not the whole list.
  const roles = await Promise.all(
    guilds.map((g) => dashboardRole(g.id, session.userId).catch(() => null)),
  );
  return guilds.flatMap((g, i) => {
    const role = roles[i];
    return role && role !== "manager" ? [{ ...g, level: role as AccessLevel }] : [];
  });
}
