/** Runs once when the dashboard server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.WEB_DATABASE_URL) return;
  const { checkDatabaseRole } = await import("./instrumentation-node");
  await checkDatabaseRole(process.env.WEB_DATABASE_URL);
}
