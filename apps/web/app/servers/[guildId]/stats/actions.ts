"use server";

import {
  applySettingsChange,
  checkServerStats,
  entitlements,
  getGuildPlan,
  getServerStats,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { getServerLayout } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { checkGuildAccess } from "@/lib/session";

/**
 * Server stats. Re-checks access and the plan, and that every channel, category and role
 * belongs to this server. The counters come as one JSON list (the editor's rows).
 */
export async function saveServerStats(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/stats`, outcome);
  let counters: unknown;
  try {
    counters = JSON.parse(String(form.get("counters") ?? "[]"));
  } catch {
    return back({ error: "The counters didn't arrive whole. Try again." });
  }
  if (!Array.isArray(counters)) return back({ error: "The counters didn't arrive whole." });
  const db = await getDb();
  const [before, plan, layout] = await Promise.all([
    getServerStats(db, guild.id),
    getGuildPlan(db, guild.id),
    getServerLayout(guild.id).catch(() => null),
  ]);
  if (!layout) return back({ error: "Discord didn't answer. Try again." });
  const voice = new Set(
    [...layout.loose, ...layout.categories.flatMap((c) => c.channels)]
      .filter((c) => c.kind === "voice")
      .map((c) => c.id),
  );
  const categories = new Set(layout.categories.map((c) => c.id));
  const roles = new Set(layout.roles.map((r) => r.id));
  const raw = {
    enabled: form.get("enabled") === "on",
    counters,
    categoryId: String(form.get("categoryId") ?? "") || null,
  };
  const checked = checkServerStats(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const { value } = checked;
  if (value.counters.some((c) => c.channelId && !voice.has(c.channelId)))
    return back({ error: "Pick voice channels from this server's list." });
  if (value.counters.some((c) => c.roleId && !roles.has(c.roleId)))
    return back({ error: "Pick roles from this server's list." });
  if (value.categoryId && !categories.has(value.categoryId))
    return back({ error: "Pick a category from this server's list." });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "stats",
    patch: { ...value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: value.enabled
      ? "Saved. Garrison makes or updates the channels within a minute; numbers refresh every ten."
      : "Saved. Server stats are off; Garrison removes the channels it made within a minute.",
    changeId: result.change.id,
  });
}
