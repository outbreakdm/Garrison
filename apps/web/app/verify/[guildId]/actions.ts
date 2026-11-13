"use server";

import { getActiveGuild, queueDashboardAction, webVerifySettings } from "@garrison/db";
import { redirect } from "next/navigation";
import { wakeBot } from "@/lib/bot";
import { getDb } from "@/lib/db";
import { isGuildMember } from "@/lib/discord";
import { env } from "@/lib/env";
import { flashBack } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { getSession } from "@/lib/session";

/** Cloudflare Turnstile's answer for this token. True when no keys are set (Discord sign-in only). */
async function passedCaptcha(token: string) {
  const secret = env().TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { success?: boolean } | null;
  return body?.success === true;
}

/** Ask Garrison to verify the signed-in member. The bot checks everything again. */
export async function submitVerify(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/");
  const session = await getSession();
  if (!session) redirect(`/login?next=/verify/${guildId}`);
  const path = `/verify/${guildId}`;
  const db = await getDb();
  const [guild, settings] = await Promise.all([
    getActiveGuild(db, guildId),
    webVerifySettings(db, guildId),
  ]);
  if (!guild || !settings) redirect("/");
  if (!(await isGuildMember(guild.id, session.userId)))
    return flashBack(path, { error: "Join the server in Discord first." });
  if (!(await passedCaptcha(String(form.get("cf-turnstile-response") ?? ""))))
    return flashBack(path, { error: "The check didn't pass. Try again." });
  const queued = await queueDashboardAction(
    db,
    guild.id,
    { id: session.userId, name: session.username },
    { kind: "web_verify", payload: {} },
  );
  wakeBot();
  if (!queued.ok)
    return flashBack(path, { error: "Lots of people are verifying. Try again in a minute." });
  return flashBack(path, { ok: "Done. Garrison is giving you the role; head back to Discord." });
}
