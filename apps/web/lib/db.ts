import "server-only";
import { createDb, type Db, describeDbRole, roleProblem } from "@garrison/db";
import { cache } from "react";

/**
 * The dashboard's connection, as the least-privilege garrison_web role.
 *
 * - On Cloudflare Workers it comes from the Hyperdrive binding, and a new
 *   client is made per request: Workers can't reuse a connection across
 *   requests, and Hyperdrive does the pooling.
 * - Elsewhere (Docker, `next start`) one pooled client from WEB_DATABASE_URL is
 *   shared by the whole process.
 */

const onWorkers = () =>
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

let shared: Db | undefined;

async function hyperdriveUrl(): Promise<string | undefined> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const env = getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } };
  return env.HYPERDRIVE?.connectionString;
}

const perRequest = cache(async (): Promise<Db> => {
  const url = (await hyperdriveUrl()) ?? process.env.WEB_DATABASE_URL;
  if (!url) throw new Error("No database: bind HYPERDRIVE or set WEB_DATABASE_URL.");
  return createDb(url, { max: 1 }).db;
});

let roleChecked: Promise<void> | undefined;

/**
 * Fail closed, once per process or Worker isolate: refuse to serve if the
 * login isn't garrison_web, because the dashboard's write limits live in that
 * role's grants. A failed check is retried on the next request.
 */
function checkRoleOnce(db: Db) {
  roleChecked ??= describeDbRole(db).then((role) => {
    const problem = roleProblem(role, "garrison_web");
    if (problem) throw new Error(problem.replace("DATABASE_URL", "The dashboard's database login"));
  });
  roleChecked.catch(() => {
    roleChecked = undefined;
  });
  return roleChecked;
}

export async function getDb(): Promise<Db> {
  let db: Db;
  if (onWorkers()) db = await perRequest();
  else {
    const url = process.env.WEB_DATABASE_URL;
    if (!url) throw new Error("WEB_DATABASE_URL isn't set.");
    shared ??= createDb(url, { max: 5 }).db;
    db = shared;
  }
  await checkRoleOnce(db);
  return db;
}
