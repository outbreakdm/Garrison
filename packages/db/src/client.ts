import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Any Drizzle Postgres database using Garrison's schema (postgres-js in prod, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /** Max pool size. Keep small when connecting through Supabase's pooler. */
  max?: number;
  /**
   * Ask Postgres for its array types when a connection opens (postgres-js's default). Off
   * saves a round trip on every new connection, which matters where each request opens its
   * own (the dashboard on Workers, behind Hyperdrive). Columns read through Drizzle parse
   * the same either way; only raw `sql` that returns an array would come back as text
   * ("{a,b}"), and nothing the dashboard runs does (checked 2026-11-18).
   */
  fetchTypes?: boolean;
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
    fetch_types: options.fetchTypes ?? true,
  });
  const db = drizzle(sql, { schema });
  return { db: db as unknown as Db, close: () => sql.end({ timeout: 5 }) };
}
