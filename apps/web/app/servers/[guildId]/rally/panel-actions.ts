"use server";

import {
  applySettingsChange,
  checkLfgPanel,
  checkTemplates,
  getGuildPlan,
  getLfgPanel,
  getRallyTemplates,
} from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { answer, type Outcome } from "@/lib/outcome";
import { checkGuildAccess } from "@/lib/session";

/**
 * The LFG panel: its words, which templates get a button, the Something else button and
 * whether it follows the groups. Posting it is a request to the bot (post_lfg_panel), which
 * uses what's saved here.
 */
export async function saveLfgPanel(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "editor", "rally");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/rally`, outcome);
  let picked: unknown = [];
  try {
    picked = JSON.parse(String(form.get("lfgPanelTemplates") ?? "[]"));
  } catch {
    return back({ error: "Refresh the page and try again." });
  }
  const db = await getDb();
  const [raw, plan, before] = await Promise.all([
    getRallyTemplates(db, guild.id),
    getGuildPlan(db, guild.id),
    getLfgPanel(db, guild.id),
  ]);
  const templates = checkTemplates(raw, plan);
  const checked = checkLfgPanel(
    {
      lfgPanelTitle: String(form.get("lfgPanelTitle") ?? ""),
      lfgPanelBody: String(form.get("lfgPanelBody") ?? ""),
      lfgPanelTemplates: picked,
      lfgPanelOther: form.get("lfgPanelOther") === "on",
      lfgPanelSticky: form.get("lfgPanelSticky") === "on",
    },
    templates.ok ? templates.value : [],
  );
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "rally",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: before.lfgPanelMessageId
      ? "Saved the panel. Post it again below to update the one in Discord."
      : "Saved the panel. Post it below when it's ready.",
    changeId: result.change.id,
  });
}
