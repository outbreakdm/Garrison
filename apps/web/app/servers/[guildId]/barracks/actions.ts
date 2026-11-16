"use server";

import {
  applySettingsChange,
  checkStatRoles,
  entitlements,
  getGuildPlan,
  STAT_ROLES_MAX,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildRoles } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/**
 * Roles that follow game stats (Pro). Rows with no role are skipped; each role
 * must be in the server and carry no admin or moderation powers (the bot checks
 * again before giving it). A server back on Free can still clear its rules.
 */
export async function saveStatRoles(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) =>
    answer(form, `/servers/${guild.id}/barracks`, outcome, "#stat-roles");
  const raw: { source: string; min: number; roleId: string }[] = [];
  for (let i = 0; i < STAT_ROLES_MAX; i++) {
    const roleId = String(form.get(`rule${i}_role`) ?? "");
    if (!roleId) continue;
    raw.push({
      source: String(form.get(`rule${i}_source`) ?? ""),
      min: Number(form.get(`rule${i}_min`)),
      roleId,
    });
  }
  const checked = checkStatRoles(raw);
  if (!checked.ok) return back({ error: checked.error });
  const db = await getDb();
  if (checked.value.length && !entitlements(await getGuildPlan(db, guild.id))["barracks.statRoles"])
    return back({ error: "Roles from game stats are part of Garrison Pro. Nothing was saved." });
  const roles = await listGuildRoles(guild.id).catch(() => null);
  if (!roles) return back({ error: "Couldn't check the server's roles. Try again." });
  const ok = new Map(
    roles.filter((r) => !r.managed && !isDangerousRole(r.permissions)).map((r) => [r.id, r]),
  );
  if (checked.value.some((r) => !ok.has(r.roleId)))
    return back({
      error:
        "Pick roles in this server without admin or moderation powers, not ones managed by an app.",
    });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "barracks",
    patch: { statRoles: checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: "Saved. Garrison updates members' roles within 30 minutes.",
    changeId: result.change.id,
  });
}
