import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { type WatchdogOptions, type WatchedClient, watchClient } from "./watchdog";

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
  /**
   * Seconds before a connection is replaced (when it's free; a transaction always finishes
   * first). postgres-js's default is 30 to 60 minutes. A function is asked once per connection,
   * so connections renew at different times.
   */
  maxLifetimeSeconds?: number | (() => number);
  /**
   * Replace the pool when a query hangs this long (watchdog.ts). For a long-running process
   * whose role has a statement timeout well under this; off by default.
   */
  watchdog?: Omit<WatchdogOptions, "now">;
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
 * Drizzle tells postgres-js to send dates as they come, since its own columns hand over text.
 * A JavaScript Date written straight into raw sql`` (`created_at >= ${cutoff}`) then reached
 * the socket as an object, and postgres-js threw before sending anything: on 2026-11-18 that
 * stopped the bot claiming any dashboard request, so the AI assistant never answered. PGlite,
 * which the tests use, accepts a Date, so they didn't see it. Here a Date becomes ISO text;
 * everything else still passes through untouched.
 */
const DATE_TYPES = ["1082", "1083", "1114", "1184"];
export function datesAsText(serializers: Record<string, unknown>) {
  for (const type of DATE_TYPES) {
    const next = serializers[type];
    serializers[type] = (v: unknown) =>
      v instanceof Date ? v.toISOString() : typeof next === "function" ? next(v) : v;
  }
}

/**
 * Connect to Postgres. With Supabase, use the pooled connection string
 * (Supavisor, port 6543): prepared statements are off so transaction mode works.
 */
export function createDb(url: string, options: CreateDbOptions = {}) {
  const open = () =>
    postgres(url, {
      max: options.max ?? 5,
      prepare: false,
      connect_timeout: DB_CONNECT_TIMEOUT_S,
      idle_timeout: DB_IDLE_TIMEOUT_S,
      fetch_types: options.fetchTypes ?? true,
      // postgres-js's types say a number, but it calls a function once per connection (its own
      // default is one: postgres/src/connection.js timer()).
      ...(options.maxLifetimeSeconds !== undefined
        ? { max_lifetime: options.maxLifetimeSeconds as unknown as number }
        : {}),
    });
  if (options.watchdog) {
    const dog = watchClient(open as unknown as () => WatchedClient, options.watchdog);
    const db = drizzle(dog.client as unknown as ReturnType<typeof open>, { schema });
    datesAsText(dog.client.options.serializers);
    return { db: db as unknown as Db, close: () => dog.close(5) };
  }
  const sql = open();
  const db = drizzle(sql, { schema });
  datesAsText(sql.options.serializers);
  return { db: db as unknown as Db, close: () => sql.end({ timeout: 5 }) };
}
