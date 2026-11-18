import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Any Drizzle Postgres database using Garrison's schema (postgres-js in prod, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /** Max pool size. Keep small when connecting through Supabase's pooler. */
  max?: number;
}

/** Give up on opening a connection after this long, instead of postgres-js's 30 s. */
export const DB_CONNECT_TIMEOUT_S = 10;
/**
 * Close a connection after it has sat unused this long. A pooler or the network can drop
 * an idle connection without telling the client, and the next query written to it then
 * waits on a socket nobody reads. Reconnecting costs a few milliseconds.
 */
export const DB_IDLE_TIMEOUT_S = 60;

/**
 * Connect to Postgres. With Supabase, use the pooled connection string
 * (Supavisor, port 6543): prepared statements are off so transaction mode works.
 */
export function createDb(url: string, options: CreateDbOptions = {}) {
  const sql = postgres(url, {
    max: options.max ?? 5,
    prepare: false,
    connect_timeout: DB_CONNECT_TIMEOUT_S,
    idle_timeout: DB_IDLE_TIMEOUT_S,
  });
  const db = drizzle(sql, { schema });
  return { db: db as unknown as Db, close: () => sql.end({ timeout: 5 }) };
}
