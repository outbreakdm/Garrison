import {
  checkTemplates,
  DEFAULT_WORDING,
  type GuildPlan,
  getGuildPlan,
  getRallyTemplates,
  PLAN_LIMITS,
  type RallyTemplate,
  type RallyWording,
} from "@garrison/db";
import type { BotContext } from "../../commands/types.js";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; plan: GuildPlan; templates: RallyTemplate[] }>();

/**
 * The templates a server can use right now. They're checked again here, and
 * the plan applies at use: after a downgrade, only the first few work and role
 * notifications stop, without anything being deleted.
 */
export function usableTemplates(raw: unknown, plan: GuildPlan): RallyTemplate[] {
  const checked = checkTemplates(raw, "pro");
  if (!checked.ok) return [];
  const limit = PLAN_LIMITS[plan];
  return checked.value.slice(0, limit.templates).map((t) => ({
    ...t,
    notifyRoleId: limit.notifyRole ? t.notifyRoleId : null,
  }));
}

export async function cachedTemplates(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const [raw, plan] = await Promise.all([
    getRallyTemplates(ctx.db, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  const templates = usableTemplates(raw, plan);
  if (raw.length && !templates.length)
    ctx.logger.warn("Rally templates failed their check", { guildId });
  const entry = { at: Date.now(), plan, templates };
  cache.set(guildId, entry);
  return entry;
}

/** Find what someone picked: an autocomplete ID, or a typed name. */
export function findTemplate(templates: RallyTemplate[], picked: string | null) {
  if (!picked) return templates.find((t) => t.isDefault) ?? null;
  const p = picked.trim().toLowerCase();
  return templates.find((t) => t.id === picked || t.name.toLowerCase() === p) ?? null;
}

export type PostWording = RallyWording & { voice: boolean };
export const DEFAULT_POST_WORDING: PostWording = { ...DEFAULT_WORDING, voice: true };

/** A post's wording, falling back to the defaults for posts made before templates. */
export function postWording(w: Partial<PostWording> | null | undefined): PostWording {
  return { ...DEFAULT_POST_WORDING, ...(w ?? {}) };
}
