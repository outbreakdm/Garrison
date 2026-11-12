"use server";

import {
  APPEAL_MAX,
  APPEAL_MIN,
  appealBlock,
  appealsOpen,
  createAppeal,
  getActiveGuild,
  listAppealsForUser,
  listCasesForTarget,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { flashBack } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { getSession } from "@/lib/session";

/**
 * Send an appeal. Only the signed-in person, only for their own active case in
 * that server, one open appeal at a time and a week after a denial.
 */
export async function submitAppeal(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/");
  const session = await getSession();
  if (!session) redirect(`/login?next=/appeal/${guildId}`);
  const path = `/appeal/${guildId}`;
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  if (!guild || !(await appealsOpen(db, guild.id))) redirect("/");
  const [cases, past] = await Promise.all([
    listCasesForTarget(db, guild.id, session.userId, 25),
    listAppealsForUser(db, guild.id, session.userId),
  ]);
  const block = appealBlock(past);
  if (block) return flashBack(path, { error: "You can't send another appeal yet." });
  const n = Number(form.get("caseNumber"));
  const c = cases.find((x) => x.caseNumber === n && !x.revokedAt && x.action !== "purge");
  if (!c) return flashBack(path, { error: "Pick one of your active cases." });
  const body = String(form.get("body") ?? "").trim();
  if (body.length < APPEAL_MIN || body.length > APPEAL_MAX)
    return flashBack(path, {
      error: `Appeals are ${APPEAL_MIN} to ${APPEAL_MAX} characters.`,
    });
  await createAppeal(db, {
    guildId: guild.id,
    userId: session.userId,
    username: session.username,
    caseNumber: c.caseNumber,
    body,
  });
  return flashBack(path, { ok: "Sent. The staff will answer here." });
}
