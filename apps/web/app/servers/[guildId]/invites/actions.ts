"use server";

import {
  applySettingsChange,
  checkInviteLabels,
  entitlements,
  getGuildPlan,
  getInviteLabels,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { inviteServer, listGuildRoles, listInvites } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/**
 * Invite labels. Re-checks access and the plan; every code must open this server (one of its
 * invites, or asked of Discord for a link pasted from elsewhere), and a join role must be the
 * server's own, never a managed role or one with admin or moderation powers (anyone with the
 * invite would get it).
 */
export async function saveInviteLabels(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "editor", "invites");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/invites`, outcome);
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("labels") ?? "[]"));
  } catch {
    return back({ error: "The labels didn't arrive whole. Try again." });
  }
  const db = await getDb();
  const [before, plan, invites, roles] = await Promise.all([
    getInviteLabels(db, guild.id),
    getGuildPlan(db, guild.id),
    listInvites(guild.id),
    listGuildRoles(guild.id).catch(() => null),
  ]);
  if (!roles) return back({ error: "Discord didn't answer. Try again." });
  const checked = checkInviteLabels(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  // Codes already saved stay (an invite can expire); new ones must open this server.
  const known = new Set([...(invites ?? []).map((i) => i.code), ...before.map((l) => l.code)]);
  for (const l of checked.value) {
    if (known.has(l.code)) continue;
    if ((await inviteServer(l.code)) !== guild.id)
      return back({ error: `${l.code} isn't an invite to this server.` });
  }
  const byId = new Map(roles.map((r) => [r.id, r]));
  for (const l of checked.value) {
    if (!l.roleId) continue;
    const role = byId.get(l.roleId);
    if (!role) return back({ error: `${l.name}: pick the role from this server's list.` });
    if (role.managed || isDangerousRole(role.permissions))
      return back({
        error: `${l.name}: that role has admin or moderation powers, so an invite can't give it.`,
      });
  }
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "invites",
    patch: { labels: checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({ ok: "Saved the invite labels.", changeId: result.change.id });
}
