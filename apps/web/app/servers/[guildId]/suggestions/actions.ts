"use server";

import {
  applySettingsChange,
  checkSuggestions,
  entitlements,
  getGuildPlan,
  getSuggestionSettings,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { checkGuildAccess } from "@/lib/session";

/** Suggestions settings. Re-checks access, the plan, and that the channel is in this server. */
export async function saveSuggestions(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/suggestions`, outcome);
  const db = await getDb();
  const [before, plan, channels] = await Promise.all([
    getSuggestionSettings(db, guild.id),
    getGuildPlan(db, guild.id),
    listTextChannels(guild.id).catch(() => null),
  ]);
  if (!channels) return back({ error: "Discord didn't answer. Try again." });
  const raw = {
    enabled: form.get("enabled") === "on",
    channelId: String(form.get("channelId") ?? "") || null,
    anonymous: form.get("anonymous") === "on",
  };
  if (raw.channelId && !channels.some((c) => c.id === raw.channelId))
    return back({ error: "Pick a text channel from this server's list." });
  const checked = checkSuggestions(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "suggestions",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: checked.value.enabled
      ? "Saved. Members can use /suggest now."
      : "Saved. Suggestions are off; cards already posted keep their votes.",
    changeId: result.change.id,
  });
}
