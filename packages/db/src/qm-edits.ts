import { QM_ROLE_PERMISSIONS, type QmRolePermission } from "./plans";
import type { QmEdit } from "./schema";

/**
 * Lines for the preview: "~ #general: renamed #chat · only @Members can see it", and
 * "− Delete #old-chat (can't be undone)". `names` maps ids and refs to names.
 */
export function describeEdits(edits: QmEdit[], names: Map<string, string>) {
  const at = (list: string[]) => list.map((r) => `@${names.get(r) ?? "?"}`).join(", ");
  return edits.map((e) => {
    const what = e.kind.endsWith("_role")
      ? `@${e.was}`
      : e.kind.endsWith("_category")
        ? `Category ${e.was}`
        : e.was;
    if (e.kind.startsWith("delete_"))
      return e.kind === "delete_category"
        ? `− Delete ${what} (its channels stay, outside any category; can't be undone)`
        : `− Delete ${what} (can't be undone)`;
    const parts: string[] = [];
    if (e.name) parts.push(`renamed ${e.name}`);
    if (e.topic !== undefined) parts.push(e.topic ? `topic "${e.topic}"` : "no topic");
    if (e.slowmodeSeconds !== undefined)
      parts.push(e.slowmodeSeconds ? `slowmode ${e.slowmodeSeconds} s` : "no slowmode");
    if (e.userLimit !== undefined) parts.push(e.userLimit ? `limit ${e.userLimit}` : "no limit");
    if (e.nsfw !== undefined) parts.push(e.nsfw ? "age-restricted" : "not age-restricted");
    if (e.parent !== undefined)
      parts.push(
        e.parent ? `moved to ${names.get(e.parent) ?? "a category"}` : "out of its category",
      );
    if (e.syncWithCategory) parts.push("follows its category's permissions");
    if (e.access) {
      const a = e.access;
      parts.push(a.privateTo.length ? `only ${at(a.privateTo)} can see it` : "everyone can see it");
      if (a.readOnly)
        parts.push(`read-only${a.posters.length ? `, ${at(a.posters)} can post` : ""}`);
    }
    if (e.color !== undefined) parts.push(`#${e.color.toString(16).padStart(6, "0")}`);
    if (e.hoist !== undefined) parts.push(e.hoist ? "shown separately" : "not shown separately");
    if (e.mentionable !== undefined) parts.push(e.mentionable ? "mentionable" : "not mentionable");
    if (e.permissions)
      parts.push(
        e.permissions.length
          ? (e.permissions as QmRolePermission[])
              .map((p) => QM_ROLE_PERMISSIONS[p]?.label ?? p)
              .join(", ")
          : "no permissions",
      );
    return `~ ${what}: ${parts.join(" · ")}`;
  });
}
