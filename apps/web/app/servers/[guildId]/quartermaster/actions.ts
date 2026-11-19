"use server";

import {
  applySettingsChange,
  checkQmSettings,
  deleteTemplate,
  entitlements,
  getGuildPlan,
  QM_SETTINGS,
  type QmEditPayload,
  type QmSettingsModule,
  qmSettingLabel,
  queueDashboardAction,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { wakeBot } from "@/lib/bot";
import { getDb } from "@/lib/db";
import { getServerLayout, listGuildRoles } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/** Delete one of your own server templates. Only ever the signed-in member's. */
export async function removeTemplate(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const id = String(form.get("templateId") ?? "");
  const ok =
    /^[0-9a-f-]{36}$/.test(id) && (await deleteTemplate(await getDb(), access.session.userId, id));
  return flashBack(
    `/servers/${access.guild.id}/quartermaster`,
    ok ? { ok: "Template deleted." } : { error: "That template was already gone." },
    "#templates",
  );
}

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * One setting from the assistant's Features panel: a switch, a channel, a number or a word.
 * Checked by the same rules as the module's own page (checkQmSettings uses them), then
 * saved through Settings history, where it can be undone.
 */
export async function saveFeature(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/quartermaster?tab=modules`, outcome, "#qm-plan");
  const module = String(form.get("module") ?? "") as QmSettingsModule;
  const name = String(form.get("field") ?? "");
  const spec = QM_SETTINGS[module]?.fields as
    | Record<string, { kind: string; options?: readonly string[] }>
    | undefined;
  const kind = spec?.[name]?.kind;
  if (!kind) return back({ error: "That setting can't be changed here." });
  const raw = String(form.get("value") ?? "").trim();
  let value: unknown;
  if (kind === "bool") value = raw === "true";
  else if (kind === "textChannel" || kind === "category") {
    if (raw && !SNOWFLAKE.test(raw)) return back({ error: "Pick a channel from the list." });
    value = raw || null;
  } else if (kind === "int") {
    const n = Number(raw);
    if (!raw || !Number.isInteger(n)) return back({ error: "That needs a whole number." });
    value = n;
  } else if (kind === "enum") value = raw;
  else if (kind === "text" || kind === "emoji") value = raw || null;
  else return back({ error: "That one is set on the module's own page." });

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
    [{ module, field: name, value }],
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
  if (!checked.ok) return back({ error: checked.errors[0] ?? "That can't be saved." });
  const change = checked.changes[0];
  if (!change) return back({ ok: "Already set that way." });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module,
    patch: { [name]: change.to },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back({
      error: result.reason === "unchanged" ? "Already set that way." : "Try again in a minute.",
    });
  return back({ ok: `Saved ${qmSettingLabel(module, name)}. Undo it in Settings history.` });
}

/** An existing item's id, or the ref of one a draft makes. */
const ITEM = /^(\d{17,20}|[a-z0-9_-]{1,32})$/;

export type HandEditResult = { ok: true } | { ok: false; error: string };

const HAND_ERRORS: Record<string, string> = {
  busy: "Garrison is still working through your last changes. Try again in a moment.",
  too_fast: "That's a lot of changes at once. Wait a few seconds, then carry on.",
  cooldown: "Try again in a moment.",
};

/**
 * One hand change from the Your server panel: rename, move a channel, or a new order. Queued
 * for the bot, which puts it into this person's newest waiting draft (or starts one), checks
 * it against the server, and costs no supplies. Managers only, like applying a build.
 */
export async function handEdit(guildId: string, change: QmEditPayload): Promise<HandEditResult> {
  const access = await checkGuildAccess(guildId);
  if (!access) return { ok: false, error: "Sign in again to make changes." };
  if (access.role !== "manager")
    return { ok: false, error: "Only managers of this server can change it here." };
  let payload: QmEditPayload;
  if (change.change === "rename") {
    const name = String(change.name ?? "")
      .trim()
      .slice(0, 100);
    if (!ITEM.test(change.target) || !name) return { ok: false, error: "Give it a name." };
    payload = { change: "rename", target: change.target, name };
  } else if (change.change === "move") {
    if (!ITEM.test(change.target) || (change.parent !== null && !ITEM.test(change.parent)))
      return { ok: false, error: "That can't move there." };
    payload = { change: "move", target: change.target, parent: change.parent };
  } else if (change.change === "order") {
    const items = Array.isArray(change.items) ? change.items.map(String) : [];
    const scopes = ["categories", "channels", "roles"];
    if (
      !scopes.includes(change.scope) ||
      items.length < 2 ||
      items.length > 260 ||
      !items.every((x) => ITEM.test(x)) ||
      (change.parent !== null && !ITEM.test(change.parent))
    )
      return { ok: false, error: "That order isn't valid." };
    payload = { change: "order", scope: change.scope, parent: change.parent, items };
  } else return { ok: false, error: "That change isn't valid." };
  const queued = await queueDashboardAction(
    await getDb(),
    access.guild.id,
    { id: access.session.userId, name: access.session.username },
    { kind: "qm_edit", payload },
  );
  if (!queued.ok) return { ok: false, error: HAND_ERRORS[queued.reason] ?? "Try again." };
  wakeBot();
  return { ok: true };
}
