import type { BackupChannel, BackupRole, ServerBackup } from "./backups";

/**
 * Server templates (Pro): a server's layout (roles, categories, channels and their
 * role permissions), saved by a member to copy into another server they own.
 * Unlike a backup, a template matches by name, not ID: applying it creates only
 * the roles, categories and channels the server doesn't already have by name.
 * Member-specific permissions are left out, since members differ between servers.
 */

export const TEMPLATES_PER_USER = 5;
export const TEMPLATE_NAME_MAX = 40;
/** At most this many roles and channels are created per apply. */
export const TEMPLATE_APPLY_MAX = 250;

/** A snapshot made portable: no member overwrites. */
export function toTemplate(backup: ServerBackup): ServerBackup {
  return {
    version: 1,
    roles: backup.roles,
    channels: backup.channels.map((c) => ({
      ...c,
      overwrites: c.overwrites.filter((o) => o.kind === "role"),
    })),
  };
}

const key = (name: string) => name.trim().toLowerCase();

export interface TemplateTarget {
  roles: { id: string; name: string }[];
  /** Categories and channels, with their category (null at the top level). */
  channels: { id: string; name: string; type: number; parentId: string | null }[];
}

export interface TemplateApplyPlan {
  /** Template role ID → an existing role with the same name. */
  existingRoles: Record<string, string>;
  /** Template category ID → an existing category with the same name. */
  existingCategories: Record<string, string>;
  roles: BackupRole[];
  categories: BackupChannel[];
  /** Channels to create; a channel with the same name in the same category is skipped. */
  channels: BackupChannel[];
  skipped: number;
}

const CATEGORY = 4;

/** What applying the template to this server would create, lowest roles first. */
export function templateApplyPlan(template: ServerBackup, now: TemplateTarget): TemplateApplyPlan {
  const roleByName = new Map(now.roles.map((r) => [key(r.name), r.id]));
  const existingRoles: Record<string, string> = {};
  const roles: BackupRole[] = [];
  for (const r of [...template.roles].sort((a, b) => a.position - b.position)) {
    const found = roleByName.get(key(r.name));
    if (found) existingRoles[r.id] = found;
    else roles.push(r);
  }

  const categoriesNow = now.channels.filter((c) => c.type === CATEGORY);
  const categoryByName = new Map(categoriesNow.map((c) => [key(c.name), c.id]));
  const existingCategories: Record<string, string> = {};
  const categories: BackupChannel[] = [];
  const byPosition = (a: BackupChannel, b: BackupChannel) => a.position - b.position;
  for (const c of template.channels.filter((c) => c.type === CATEGORY).sort(byPosition)) {
    const found = categoryByName.get(key(c.name));
    if (found) existingCategories[c.id] = found;
    else categories.push(c);
  }

  const channelsNow = new Set(
    now.channels
      .filter((c) => c.type !== CATEGORY)
      .map((c) => `${c.parentId ?? ""}/${key(c.name)}`),
  );
  const channels: BackupChannel[] = [];
  for (const c of template.channels.filter((c) => c.type !== CATEGORY).sort(byPosition)) {
    // Only an existing category can already hold a same-named channel.
    const parent = c.parentId ? (existingCategories[c.parentId] ?? null) : null;
    const inNewCategory = c.parentId !== null && !existingCategories[c.parentId];
    if (!inNewCategory && channelsNow.has(`${parent ?? ""}/${key(c.name)}`)) continue;
    channels.push(c);
  }

  let budget = TEMPLATE_APPLY_MAX;
  const take = <T>(list: T[]) => {
    const kept = list.slice(0, Math.max(0, budget));
    budget -= kept.length;
    return kept;
  };
  const plan = {
    existingRoles,
    existingCategories,
    roles: take(roles),
    categories: take(categories),
    channels: take(channels),
  };
  const skipped =
    roles.length +
    categories.length +
    channels.length -
    (plan.roles.length + plan.categories.length + plan.channels.length);
  return { ...plan, skipped };
}
