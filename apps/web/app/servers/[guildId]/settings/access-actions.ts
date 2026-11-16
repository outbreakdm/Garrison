"use server";

import {
  type AccessGrant,
  applySettingsChange,
  checkAccessGrants,
  getAccessGrants,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listGuildRoles } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";

/**
 * Who else may use this server's dashboard: give a person or a role Viewer or Editor access,
 * change it, or take it away. Managers only (Manage Server, checked live). Each change saves
 * the whole list through applySettingsChange, so it's in Settings history with Undo, and a
 * manager is the only one who can undo it (settings/actions undoChange).
 */
export async function changeAccess(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "manager");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (o: Outcome) => answer(form, `/servers/${guild.id}/settings`, o, "#access");

  const op = String(form.get("op") ?? "");
  const kind = String(form.get("kind") ?? "");
  const id = String(form.get("id") ?? "");
  const level = String(form.get("level") ?? "");
  if (!["add", "remove", "level"].includes(op) || (kind !== "user" && kind !== "role"))
    return back({ error: "That form wasn't valid. Refresh and try again." });
  if (!isSnowflake(id)) return back({ error: "Pick a person or a role from this server." });
  if (op !== "remove" && level !== "viewer" && level !== "editor")
    return back({ error: "Pick Viewer or Editor." });

  const db = await getDb();
  const current = await getAccessGrants(db, guild.id);
  const at = current.findIndex((g) => g.kind === kind && g.id === id);
  let next: AccessGrant[];
  let ok: string;

  if (op === "remove") {
    if (at < 0) return back("unchanged");
    next = current.filter((_, i) => i !== at);
    ok = `${label(current[at] as AccessGrant)} no longer has access.`;
  } else if (op === "level") {
    if (at < 0) return back({ error: "They no longer have access. Add them again." });
    next = current.map((g, i) => (i === at ? { ...g, level: level as AccessGrant["level"] } : g));
    ok = `${label(current[at] as AccessGrant)} is now ${article(level)}.`;
  } else {
    // A grant names someone who's here now: a member, or one of this server's own roles.
    let name: string;
    if (kind === "user") {
      const member = await fetchMemberCard(guild.id, id).catch(() => null);
      if (!member?.joinedAt)
        return back({ error: "They aren't in this server. Find them by name, then add them." });
      if (member.bot) return back({ error: "Bots can't use the dashboard." });
      name = member.name;
    } else {
      const roles = await listGuildRoles(guild.id).catch(() => null);
      if (!roles) return back({ error: "Discord didn't answer. Try again." });
      const role = roles.find((r) => r.id === id);
      if (!role || role.id === guild.id || role.managed)
        return back({ error: "Pick a role from this server (not @everyone or a bot's role)." });
      name = role.name;
    }
    const grant: AccessGrant = { kind, id, level: level as AccessGrant["level"], name };
    next = at < 0 ? [...current, grant] : current.map((g, i) => (i === at ? grant : g));
    ok = `${label(grant)} can ${level === "editor" ? "change settings" : "view the dashboard"} now.`;
  }

  const checked = checkAccessGrants(next);
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "access",
    patch: { grants: checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({ ok, changeId: result.change.id });
}

const label = (g: AccessGrant) => (g.kind === "role" ? `Everyone with @${g.name}` : g.name);
const article = (level: string) => (level === "editor" ? "an editor" : "a viewer");
