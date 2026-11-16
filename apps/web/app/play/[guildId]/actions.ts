"use server";

import {
  cleanRankDetails,
  entitlements,
  getActiveGuild,
  getEconomy,
  getGuildPlan,
  getLfgPost,
  getOpsEvent,
  getRanksSettings,
  memberFields,
  queueDashboardAction,
  rankCardForPlan,
  readRankCard,
  saveRankDetails,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { wakeBot } from "@/lib/bot";
import { getDb } from "@/lib/db";
import { isGuildMember } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { memberCheck } from "@/lib/member";
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
  wakeBot();
  if (!queued.ok) return flashBack(path, { error: "That's a lot at once. Try again in a minute." });
  return flashBack(path, { ok: "Sent to Garrison. Refresh in a few seconds to see it." });
}

/**
 * A member buys from the server's shop. Only with their own coins (the session's user; the
 * bot checks the item, the price and their balance again), only while the economy is on.
 */
export async function buyFromShop(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const path = isSnowflake(guildId) ? `/play/${guildId}/wallet` : "/servers";
  const ok = await memberCheck(guildId, "wallet");
  if (!ok) return flashBack(path, { error: "The shop isn't open right now." });
  const { session, guild, db } = ok;
  const itemId = String(form.get("itemId") ?? "");
  const config = await getEconomy(db, guild.id);
  if (!config.shop.some((i) => i.id === itemId))
    return flashBack(path, { error: "That item isn't in the shop anymore." });
  const queued = await queueDashboardAction(
    db,
    guild.id,
    { id: session.userId, name: session.username },
    { kind: "economy_buy", payload: { itemId } },
  );
  wakeBot();
  if (!queued.ok) return flashBack(path, { error: "That's a lot at once. Try again in a minute." });
  return flashBack(path, { ok: "Sent to Garrison. Refresh in a few seconds to see it." });
}

/**
 * A member saves the details on their own rank card in this server (what /rankcard does).
 * Only their own row (the session's user, never an ID from the form), only the fields the
 * server's card asks for, each cut to the card's limit. Needs the You page on and Leveling on.
 */
export async function saveMemberCard(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const path = isSnowflake(guildId) ? `/play/${guildId}/you` : "/servers";
  const ok = await memberCheck(guildId, "you");
  if (!ok) return flashBack(path, { error: "Your card can't be changed here right now." });
  const { session, guild, db } = ok;
  const [settings, plan] = await Promise.all([
    getRanksSettings(db, guild.id),
    getGuildPlan(db, guild.id),
  ]);
  const fields = memberFields(
    rankCardForPlan(readRankCard(settings.card), entitlements(plan)).fields,
  );
  if (!fields.length)
    return flashBack(path, { error: "This server's card doesn't ask for details." });
  const raw = Object.fromEntries(fields.map((f) => [f.id, form.get(`f_${f.id}`) ?? ""]));
  await saveRankDetails(db, guild.id, session.userId, cleanRankDetails(fields, raw));
  return flashBack(path, { ok: "Saved. /rank shows it on your card." });
}
