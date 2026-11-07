import { sql } from "drizzle-orm";
import type { Db } from "./client";

export interface DbRoleCheck {
  user: string;
  superuser: boolean;
  bypassRls: boolean;
}

export async function describeDbRole(db: Db): Promise<DbRoleCheck> {
  const rows = (await db.execute(
    sql`SELECT current_user AS "user", r.rolsuper AS superuser, r.rolbypassrls AS "bypassRls"
        FROM pg_roles r WHERE r.rolname = current_user`,
  )) as unknown as DbRoleCheck[] | { rows: DbRoleCheck[] };
  const row = Array.isArray(rows) ? rows[0] : rows.rows[0];
  if (!row) throw new Error("Could not read the database role");
  return row;
}

/**
 * Garrison's security model rests on the bot connecting as garrison_bot:
 * column grants and row-level security stop a compromised bot from editing
 * history or anything outside its job. A superuser or BYPASSRLS login (like
 * Supabase's postgres) skips all of that, so the bot refuses to start with one.
 */
export function roleProblem(role: DbRoleCheck, expected: string): string | null {
  if (role.superuser || role.bypassRls)
    return `DATABASE_URL logs in as "${role.user}", which bypasses row-level security. Use the ${expected} role (see DEPLOY.md).`;
  if (role.user !== expected)
    return `DATABASE_URL logs in as "${role.user}", not ${expected}. Use the ${expected} role (see DEPLOY.md).`;
  return null;
}

/** Read one row from a table, to prove it exists and this role can see it. Table names are fixed in code. */
export async function probeTable(db: Db, table: string) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Bad table name");
  await db.execute(sql.raw(`SELECT 1 FROM public."${table}" LIMIT 1`));
}
