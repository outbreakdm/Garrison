import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, listDownRatedReplies } from "@garrison/db";

/**
 * Replies admins rated thumbs down, with the message each answered and what they said was
 * wrong, written to apps/bot/eval-results/candidates-<date>.json for review. Good ones become
 * cases in cases.ts (with the server they need, a check, and a reference answer), so what
 * real admins ask keeps testing the assistant. Read-only.
 *
 *   pnpm --filter @garrison/bot eval:collect            # the last 30 days
 *   pnpm --filter @garrison/bot eval:collect --days 7
 *
 * Needs DATABASE_URL (the repo's .env is read).
 */

const i = process.argv.indexOf("--days");
const days = Math.max(1, Number(i >= 0 ? process.argv[i + 1] : 30) || 30);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (in the repo's .env) to read the ratings.");
  process.exit(1);
}
const { db, close } = createDb(url);
try {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await listDownRatedReplies(db, since);
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "../../eval-results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `candidates-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(
    `${rows.length} thumbs-down ${rows.length === 1 ? "reply" : "replies"} since ${since.toISOString().slice(0, 10)}, saved to ${file}`,
  );
} finally {
  await close();
}
