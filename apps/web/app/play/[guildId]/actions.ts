"use server";

import { getActiveGuild, getLfgPost, getOpsEvent, queueDashboardAction } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isGuildMember } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { getSession } from "@/lib/session";

/**
 * A member joins or leaves a group, or signs up for or leaves a raid, from the
 * website. Only for themselves, only as a member of that server; Garrison checks
 * the group or raid again before acting.
 */
export async function playRequest(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/");
  const session = await getSession();
  if (!session) redirect(`/login?next=/play/${guildId}`);
  const path = `/play/${guildId}`;
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  if (!guild) redirect("/");
  if (!(await isGuildMember(guild.id, session.userId)))
    return flashBack(path, { error: "Join the server in Discord first." });
  const kind = String(form.get("kind") ?? "");
  const id = String(form.get("id") ?? "");
  const role = String(form.get("role") ?? "");
  const uuid = /^[0-9a-f-]{36}$/.test(id);
  let input: Parameters<typeof queueDashboardAction>[3] | null = null;
  if ((kind === "lfg_join" || kind === "lfg_leave") && uuid) {
    const p = await getLfgPost(db, guild.id, id);
    if (p && (p.status === "open" || p.status === "full")) {
      if (kind === "lfg_leave") input = { kind, payload: { id: p.id } };
      else if (p.slots.some((g) => g.name === role)) input = { kind, payload: { id: p.id, role } };
    }
  }
  if ((kind === "raid_signup" || kind === "raid_withdraw") && uuid) {
    const e = await getOpsEvent(db, guild.id, id);
    if (e?.status === "scheduled") {
      if (kind === "raid_withdraw") input = { kind, payload: { eventId: e.id } };
      else if (e.slots.some((g) => g.name === role))
        input = {
          kind,
          payload: {
            eventId: e.id,
            role,
            spec: String(form.get("spec") ?? "").slice(0, 20) || null,
          },
        };
    }
  }
  if (!input) return flashBack(path, { error: "That has changed. Refresh and try again." });
  const queued = await queueDashboardAction(
    db,
    guild.id,
    { id: session.userId, name: session.username },
    input,
  );
  if (!queued.ok) return flashBack(path, { error: "That's a lot at once. Try again in a minute." });
  return flashBack(path, { ok: "Sent to Garrison. Refresh in a few seconds to see it." });
}
