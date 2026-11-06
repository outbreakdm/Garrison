import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.js";
import * as schema from "./schema.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** An in-memory Postgres (PGlite) with Garrison's real migrations applied. For tests only. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return {
    db: db as unknown as Db,
    /** Run raw SQL on the same session, e.g. `SET ROLE garrison_bot`. */
    exec: (sql: string) => client.exec(sql),
    close: () => client.close(),
  };
}
