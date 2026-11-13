"use server";

import {
  applySettingsChange,
  BOOSTS_MAX,
  checkBoosts,
  checkRankCard,
  DEFAULT_RANK_CARD,
  entitlements,
  getGuildPlan,
  getRanksSettings,
  readRankCard,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getServerLayout } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * The rank card's look. Re-checks access for the server in the form, re-reads the
 * plan, and checks the card with the same rules the bot draws by. The standard
 * card is stored as null, so a server that never customized has nothing saved.
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

/**
 * XP boosts (Pro). Each row is "role:<id>" or "channel:<id>" with a multiplier;
 * blank rows are skipped. Targets must exist in this server. A server back on
 * Free can still clear its boosts.
 */
export async function saveBoosts(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/ranks`, outcome, "?edit=boosts#boosts");
  const raw: { kind: string; id: string; multiplier: number }[] = [];
  for (let i = 0; i < BOOSTS_MAX; i++) {
    const target = String(form.get(`boost${i}_target`) ?? "");
    if (!target) continue;
    const [kind = "", id = ""] = target.split(":");
    raw.push({ kind, id, multiplier: Number(form.get(`boost${i}_mult`)) });
  }
  const checked = checkBoosts(raw);
  if (!checked.ok) return back({ error: checked.error });
  const db = await getDb();
  if (checked.value.length && !entitlements(await getGuildPlan(db, guild.id))["ranks.boosts"])
    return back({ error: "XP boosts are part of Garrison Pro. Nothing was saved." });
  const layout = await getServerLayout(guild.id).catch(() => null);
  if (!layout) return back({ error: "Couldn't check the server's roles and channels. Try again." });
  const roles = new Set(layout.roles.map((r) => r.id));
  const places = new Set([
    ...layout.loose.map((c) => c.id),
    ...layout.categories.flatMap((c) => [c.id, ...c.channels.map((ch) => ch.id)]),
  ]);
  if (checked.value.some((b) => !(b.kind === "role" ? roles : places).has(b.id)))
    return back({ error: "One of those roles or channels isn't in this server anymore." });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "ranks",
    patch: { boosts: checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back({
      error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute.",
    });
  return back({ ok: "Saved the boosts. They apply from the next XP earned." });
}
