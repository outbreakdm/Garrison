"use server";

import {
  applySettingsChange,
  checkVoiceRooms,
  entitlements,
  getGuildPlan,
  getVoiceRooms,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { getServerLayout } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { checkGuildAccess } from "@/lib/session";

/**
 * Voice room settings. Re-checks access and the plan, and that every channel is a voice
 * channel (or category) in this server.
 */
export async function saveVoiceRooms(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "editor", "voice");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/voice`, outcome);
  const db = await getDb();
  const [before, plan, layout] = await Promise.all([
    getVoiceRooms(db, guild.id),
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
  const raw = {
    enabled: form.get("enabled") === "on",
    creatorChannelIds: form.getAll("creatorChannelIds").map(String),
    nameTemplate: String(form.get("nameTemplate") ?? "") || null,
    userLimit: Number(form.get("userLimit") ?? 0),
    categoryId: String(form.get("categoryId") ?? "") || null,
    controls: form.get("controls") === "on",
  };
  if (!raw.creatorChannelIds.every((id) => voice.has(id)))
    return back({ error: "Pick voice channels from this server's list." });
  if (raw.categoryId && !categories.has(raw.categoryId))
    return back({ error: "Pick a category from this server's list." });
  const checked = checkVoiceRooms(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "voice",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: checked.value.enabled
      ? "Saved. Joining a creator channel now makes a room, within a few seconds of the change."
      : "Saved. Voice rooms are off; rooms already open close when they empty.",
    changeId: result.change.id,
  });
}
