import { DEFAULT_WORDING, type RallyTemplate, type RallyWording } from "@garrison/db";
import { slotsText } from "./slots";

/**
 * Turn the template form into a template object. Shapes only: the result goes
 * through checkTemplates (shared with the bot) before anything is saved. Pure,
 * so it's unit tested.
 */
export function templateFromForm(form: FormData): Record<string, unknown> {
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const wording: Record<string, string | null> = {};
  for (const key of Object.keys(DEFAULT_WORDING) as (keyof RallyWording)[]) {
    const v = text(`w_${key}`).trim();
    wording[key] = v || (key === "requirement" ? null : DEFAULT_WORDING[key]);
  }
  const roles = (slotsText(form) ?? text("roles")).trim();
  return {
    id: text("templateId"),
    name: text("name"),
    game: text("game").trim() || null,
    roles: roles || null,
    size: roles ? null : text("size").trim() || null,
    wording,
    lifetimeHours: text("lifetimeHours") || "3",
    voice: form.get("voice") === "on",
    channelIds: form.getAll("channelIds").filter((v) => typeof v === "string" && v !== ""),
    notifyRoleId: text("notifyRoleId") || null,
    isDefault: form.get("isDefault") === "on",
  };
}

/** Replace the template with the same ID, or add it. A new default unsets the old one. */
export function upsertTemplate(list: RallyTemplate[], t: Record<string, unknown>) {
  const others = t.isDefault ? list.map((x) => ({ ...x, isDefault: false })) : list;
  const i = others.findIndex((x) => x.id === t.id);
  if (i === -1) return [...others, t];
  return others.map((x, k) => (k === i ? t : x));
}
