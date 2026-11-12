"use server";

import { isStaff, setComp } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { checkGuildAccess } from "@/lib/session";

/**
 * Staff only: give this server Pro for free, or take a free Pro away. The page
 * hides the form from everyone else, but this is a public POST endpoint, so it
 * re-checks access and staff here, and the database checks staff once more.
 */
export async function setCompAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId);
  if (!access) redirect("/servers");
  const db = await getDb();
  const back = `/servers/${access.guild.id}/plan`;
  if (!(await isStaff(db, access.session.userId))) redirect(back);
  const comp = form.get("comp") === "on";
  const note = String(form.get("note") ?? "").slice(0, 200) || null;
  const result = await setComp(db, access.session.userId, access.guild.id, comp, note);
  redirect(`${back}?done=${result}`);
}
