import { createDb, describeDbRole, roleProblem } from "@garrison/db";

/**
 * Fail closed: refuse to serve if WEB_DATABASE_URL logs in as anything but the
 * least-privilege garrison_web role, because the dashboard's write limits live
 * in that role's grants.
 */
export async function checkDatabaseRole(url: string) {
  const { db, close } = createDb(url, { max: 1 });
  try {
    const problem = roleProblem(await describeDbRole(db), "garrison_web");
    if (problem) {
      console.error(problem.replace("DATABASE_URL", "WEB_DATABASE_URL"));
      process.exit(1);
    }
  } finally {
    await close();
  }
}
