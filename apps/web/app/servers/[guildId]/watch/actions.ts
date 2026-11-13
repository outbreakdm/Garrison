"use server";

import {
  addMemberNote,
  applySettingsChange,
  checkAutomod,
  decideAppeal,
  entitlements,
  getAppeal,
  getAutomod,
  getCase,
  getGuildPlan,
  NOTE_MAX,
  queueDashboardAction,
  removeMemberNote,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { wakeBot } from "@/lib/bot";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Notes and appeals on the dashboard. Each re-checks access for the server in the
 * form; everything is scoped to that server's ID.
 */

async function access(form: FormData) {
  const a = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!a) redirect("/servers");
  return a;
}

export async function addNote(form: FormData) {
  const { guild, session } = await access(form);
  const userId = String(form.get("userId") ?? "");
  const path = `/servers/${guild.id}/watch/member/${userId}`;
  if (!/^\d{17,20}$/.test(userId)) redirect(`/servers/${guild.id}/watch`);
  const body = String(form.get("body") ?? "").trim();
  if (!body) return flashBack(path, { error: "Write the note first." }, "#notes");
  if (body.length > NOTE_MAX)
    return flashBack(path, { error: `Notes can be ${NOTE_MAX} characters.` }, "#notes");
  await addMemberNote(await getDb(), {
    guildId: guild.id,
    userId,
    authorId: session.userId,
    authorName: session.username,
    body,
  });
  return flashBack(path, { ok: "Note added. Only staff see it." }, "#notes");
}

export async function removeNote(form: FormData) {
  const { guild, session } = await access(form);
  const userId = String(form.get("userId") ?? "");
  const id = Number(form.get("noteId"));
  const path = `/servers/${guild.id}/watch/member/${userId}`;
  if (!/^\d{17,20}$/.test(userId) || !Number.isInteger(id)) redirect(`/servers/${guild.id}/watch`);
  const ok = await removeMemberNote(await getDb(), guild.id, id, session.userId);
  return flashBack(
    path,
    ok ? { ok: "Note removed." } : { error: "That note was already removed." },
    "#notes",
  );
}

/** Accept or deny an appeal, with a reply the member sees on the appeal page. */
export async function decide(form: FormData) {
  const { guild, session } = await access(form);
  const back = (o: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/watch`, o, "#appeals");
  const id = String(form.get("appealId") ?? "");
  const status = form.get("decision") === "accept" ? "accepted" : "denied";
  const response =
    String(form.get("response") ?? "")
      .trim()
      .slice(0, 1000) || null;
  const db = await getDb();
  const appeal = /^[0-9a-f-]{36}$/.test(id) ? await getAppeal(db, guild.id, id) : null;
  if (!appeal) return back({ error: "That appeal was removed." });
  const done = await decideAppeal(db, {
    guildId: guild.id,
    id,
    status,
    response,
    reviewer: { id: session.userId, name: session.username },
  });
  if (!done) return back({ error: "Someone already decided that appeal." });
  // Accepting can also undo the case it was about (a request Garrison checks again).
  let undo = "";
  if (status === "accepted" && form.get("undo") === "on" && appeal.caseNumber) {
    const c = await getCase(db, guild.id, appeal.caseNumber);
    if (c && !c.revokedAt) {
      const queued = await queueDashboardAction(
        db,
        guild.id,
        { id: session.userId, name: session.username },
        { kind: "undo_case", payload: { caseNumber: c.caseNumber } },
      );
      wakeBot();
      undo = queued.ok
        ? ` Case #${c.caseNumber} is being undone.`
        : " Undo the case from Requests.";
    }
  }
  return back({
    ok: `${status === "accepted" ? "Accepted" : "Denied"} ${appeal.username}'s appeal. They see it on the appeal page.${undo}`,
  });
}

/** Automod rules. Roles and channels must be this server's; the plan is checked like the bot does. */
export async function saveAutomod(form: FormData) {
  const { guild, session } = await access(form);
  const back = (o: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/watch`, o, "?edit=automod#automod");
  const db = await getDb();
  const [before, plan, roles, channels] = await Promise.all([
    getAutomod(db, guild.id),
    getGuildPlan(db, guild.id),
    listGuildRoles(guild.id).catch(() => null),
    listTextChannels(guild.id).catch(() => null),
  ]);
  if (!roles || !channels) return back({ error: "Discord didn't answer. Try again." });
  const raw = {
    enabled: form.get("enabled") === "on",
    invites: form.get("invites") === "on",
    mentionLimit: Number(form.get("mentionLimit")),
    spamCount: Number(form.get("spamCount")),
    spamSeconds: Number(form.get("spamSeconds")),
    // One box per word; an older one-per-line value still splits the same way.
    words: form.getAll("words").map(String),
    action: String(form.get("action") ?? ""),
    timeoutMinutes: Number(form.get("timeoutMinutes")),
    exemptRoleIds: form.getAll("exemptRoleIds").map(String),
    exemptChannelIds: form.getAll("exemptChannelIds").map(String),
    aiEnabled: form.get("aiEnabled") === "on",
    aiCategories: form.getAll("aiCategories").map(String),
    aiStrictness: String(form.get("aiStrictness") ?? "medium"),
  };
  const roleIds = new Set(roles.map((r) => r.id));
  const channelIds = new Set(channels.map((c) => c.id));
  if (
    !raw.exemptRoleIds.every((id) => roleIds.has(id)) ||
    !raw.exemptChannelIds.every((id) => channelIds.has(id))
  )
    return back({ error: "Pick roles and channels from this server's lists." });
  const checked = checkAutomod(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "automod",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back({
      error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute.",
    });
  return back({ ok: checked.value.enabled ? "Saved. Automod is on." : "Saved. Automod is off." });
}
