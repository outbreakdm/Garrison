"use server";

import {
  applySettingsChange,
  checkStarboard,
  entitlements,
  getGuildPlan,
  getStarboard,
  parseEmoji,
  resolveEmoji,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildEmojis, listTextChannels } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { checkGuildAccess } from "@/lib/session";

/**
 * Starboard settings. Re-checks access for the server in the form and the plan,
 * and checks every channel belongs to this server.
 */
export async function saveStarboard(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "editor", "honors");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/honors`, outcome);
  const db = await getDb();
  const [before, plan, channels, serverEmoji] = await Promise.all([
    getStarboard(db, guild.id),
    getGuildPlan(db, guild.id),
    listTextChannels(guild.id).catch(() => null),
    listGuildEmojis(guild.id).catch(() => []),
  ]);
  if (!channels) return back({ error: "Discord didn't answer. Try again." });
  const raw = {
    enabled: form.get("enabled") === "on",
    channelId: String(form.get("channelId") ?? ""),
    // ":name:" is one of this server's emoji; anything else is kept as typed.
    emoji: resolveEmoji(String(form.get("emoji") ?? ""), serverEmoji),
    threshold: Number(form.get("threshold")),
    selfStar: form.get("selfStar") === "on",
    ignoredChannelIds: form.getAll("ignoredChannelIds").map(String),
    accent: String(form.get("accent") ?? "") || null,
  };
  const known = new Set(channels.map((c) => c.id));
  if (
    (raw.channelId && !known.has(raw.channelId)) ||
    !raw.ignoredChannelIds.every((id) => known.has(id))
  )
    return back({ error: "Pick channels from this server's list." });
  const custom = parseEmoji(raw.emoji);
  if (custom?.kind === "custom" && !serverEmoji.some((e) => e.id === custom.id))
    return back({ error: "Use an emoji from this server." });
  const checked = checkStarboard(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "starboard",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: checked.value.enabled
      ? `Saved. Messages with ${checked.value.threshold} ${checked.value.emoji} go to the starboard.`
      : "Saved. The starboard is off.",
    changeId: result.change.id,
  });
}
