import "server-only";
import { createDb, type Db } from "@garrison/db";
import { env } from "./env";

let db: Db | undefined;

/** The dashboard's connection, as the read-only garrison_web role. */
export function getDb(): Db {
  if (!db) db = createDb(env().WEB_DATABASE_URL, { max: 5 }).db;
  return db;
}
