"use server";

import {
  applySettingsChange,
  checkQmSettings,
  entitlements,
  getGuildPlan,
  isSetupPreset,
  protectProposals,
  type QmSettingProposal,
  type QmSettingsModule,
  SETUP_PRESETS,
  welcomeProposals,
} from "@garrison/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getServerLayout, listGuildRoles } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";
import { setupHiddenCookie } from "@/lib/setup";

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * One step of "Set up in three clicks" on the Overview (packages/db setup.ts). Protect and
 * Welcome are settings changes checked by the same rules as the AI assistant's and saved
 * through Settings history, so each can be undone there; Build opens the AI assistant with
 * the preset's request written in; Hide puts the card away for this server.
 */
export async function runSetupStep(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "manager");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const base = `/servers/${guild.id}`;
  const back = (outcome: { ok: string } | { error: string }) => flashBack(base, outcome, "#setup");
  const step = String(form.get("step") ?? "");

  if (step === "hide") {
    (await cookies()).set(setupHiddenCookie(guild.id), "1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: base,
      maxAge: 365 * 86_400,
    });
    redirect(base);
  }
  if (step === "build") {
    const preset = String(form.get("preset") ?? "");
    const prompt = isSetupPreset(preset) ? SETUP_PRESETS[preset].prompt : "";
    redirect(
      `${base}/quartermaster?fresh=1${prompt ? `&prompt=${encodeURIComponent(prompt)}` : ""}`,
    );
  }

  let proposals: QmSettingProposal[];
  if (step === "protect") proposals = protectProposals();
  else if (step === "welcome") {
    const channelId = String(form.get("channelId") ?? "");
    if (!SNOWFLAKE.test(channelId)) return back({ error: "Pick the channel welcome cards go in." });
    proposals = welcomeProposals(channelId);
  } else return back({ error: "That step doesn't exist." });

  const db = await getDb();
  const [layout, roles, plan] = await Promise.all([
    getServerLayout(guild.id).catch(() => null),
    listGuildRoles(guild.id).catch(() => null),
    getGuildPlan(db, guild.id),
  ]);
  if (!layout || !roles) return back({ error: "Discord didn't answer. Try again." });
  const kinds = new Map<string, "text" | "voice" | "category" | "other">();
  for (const c of layout.loose) kinds.set(c.id, c.kind);
  for (const cat of layout.categories) {
    kinds.set(cat.id, "category");
    for (const c of cat.channels) kinds.set(c.id, c.kind);
  }
  const checked = await checkQmSettings(
    db,
    guild.id,
    proposals,
    {
      channel: (id) => kinds.get(id) ?? null,
      role: (id) => {
        const r = roles.find((x) => x.id === id);
        if (!r) return null;
        return {
          name: r.name,
          status: r.managed ? "fixed" : isDangerousRole(r.permissions) ? "dangerous" : "ok",
        };
      },
      created: () => null,
    },
    entitlements(plan),
  );
  if (!checked.ok) return back({ error: checked.errors[0] ?? "That couldn't be turned on." });
  if (!checked.changes.length)
    return back({
      ok:
        step === "protect" ? "Protection was already on." : "Welcome cards were already on there.",
    });
  const modules = [...new Set(checked.changes.map((c) => c.module))] as QmSettingsModule[];
  for (const module of modules) {
    const result = await applySettingsChange(db, {
      guildId: guild.id,
      module,
      patch: Object.fromEntries(
        checked.changes.filter((c) => c.module === module).map((c) => [c.field, c.to]),
      ),
      userId: session.userId,
      username: session.username,
    });
    if (!result.ok && result.reason !== "unchanged")
      return back({ error: "Something changed at the same time. Try again." });
  }
  return back({
    ok:
      step === "protect"
        ? "Protection is on: automod, AI moderation and anti-raid. Each can be undone in Settings history."
        : "Welcome cards are on. Change their look on the Welcome page.",
  });
}
