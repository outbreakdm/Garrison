"use server";

import {
  applySettingsChange,
  checkRankCard,
  DEFAULT_RANK_CARD,
  entitlements,
  getGuildPlan,
  getRanksSettings,
  readRankCard,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * The rank card's look. Re-checks access for the server in the form, re-reads the
 * plan, and checks the card with the same rules the bot draws by. The standard
 * card is stored as null, so a server that never customised has nothing saved.
 */
export async function saveRankCard(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/ranks`, outcome, "?edit=card#card");
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("card") ?? ""));
  } catch {
    return back({ error: "That form wasn't valid. Refresh and try again." });
  }
  const db = await getDb();
  const [settings, plan] = await Promise.all([
    getRanksSettings(db, guild.id),
    getGuildPlan(db, guild.id),
  ]);
  const checked = checkRankCard(raw, entitlements(plan), readRankCard(settings.card));
  if (!checked.ok) return back({ error: checked.error });
  const standard = JSON.stringify(checked.value) === JSON.stringify(DEFAULT_RANK_CARD);
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "ranks",
    patch: { card: standard ? null : checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back({
      error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute.",
    });
  return back({ ok: "Saved the rank card. /rank draws it from now on." });
}
