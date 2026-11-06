import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/** Any Drizzle Postgres database using Garrison's schema (postgres-js in prod, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /** Max pool size. Keep small when connecting through Supabase's pooler. */
  max?: number;
}

/**
 * Connect to Postgres. With Supabase, use the pooled connection string
 * (Supavisor, port 6543): prepared statements are off so transaction mode works.
 */
export function createDb(url: string, options: CreateDbOptions = {}) {
  const sql = postgres(url, { max: options.max ?? 5, prepare: false });
  const db = drizzle(sql, { schema });
  return { db: db as unknown as Db, close: () => sql.end({ timeout: 5 }) };
}
