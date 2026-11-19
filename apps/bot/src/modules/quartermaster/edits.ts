import {
  QM_ROLE_PERMISSION_KEYS,
  QM_ROLE_PERMISSIONS,
  type QmEdit,
  type QmOperation,
  type QmRolePermission,
} from "@garrison/db";

export { describeEdits } from "@garrison/db";

import { z } from "zod";
import { channelName, displayName, MAX_PRIVATE_ROLES } from "./names.js";
import type { ServerSnapshot } from "./plan.js";

/**
 * Changing and deleting what already exists (since 2026-11-19). The model proposes; every
 * rule that matters is checked here, against the server as Garrison sees it, never against
 * what the model says. Edits are undone from the state the build records before changing
 * anything; deletes are permanent, so they're capped, shown as such, and refused for
 * anything Discord or Garrison depends on.
 */

export const QM_EDIT_KINDS = [
  "edit_channel",
  "edit_category",
  "edit_role",
  "delete_channel",
  "delete_category",
  "delete_role",
] as const satisfies readonly QmEdit["kind"][];

/** The most deletions one plan makes. Each is permanent. */
export const MAX_DELETES = 10;

/** What the model returns for an edit. Loose, like AiPlanSchema; validateEdits decides. */
export const AiEditSchema = z.object({
  kind: z.enum(QM_EDIT_KINDS),
  id: z.string().describe("The id of the existing channel, category or role, from the snapshot."),
  name: z.string().nullable().describe("A new name, or null to keep it."),
  topic: z
    .string()
    .nullable()
    .describe('Text, announcement and forum channels: a new topic, "" to clear it, null to keep.'),
  slowmode_seconds: z
    .number()
    .int()
    .nullable()
    .describe("0 to 21600; 0 turns it off. Null keeps it."),
  user_limit: z.number().int().nullable().describe("Voice: 0 (no limit) to 99. Null keeps it."),
  nsfw: z.boolean().nullable().describe("Age-restricted. Null keeps it."),
  parent: z
    .string()
    .nullable()
    .describe(
      'Channels: a category id or a category ref from this plan to move it into, "none" to take it out of its category, null to keep.',
    ),
  access: z
    .object({
      private_to: z
        .array(z.string())
        .describe("Role ids or refs that may see it; empty = everyone sees it."),
      read_only: z
        .boolean()
        .describe("Text: members read but don't post. Voice: members listen but don't speak."),
      posters: z
        .array(z.string())
        .describe("Read-only: role ids or refs that still post or speak. Empty otherwise."),
    })
    .nullable()
    .describe(
      "Channels and categories: who sees it and who posts, replacing what's set now for @everyone and those roles. Null keeps the access as it is.",
    ),
  sync_with_category: z
    .boolean()
    .nullable()
    .describe("Channels: true makes it follow its category's permissions again. Else null."),
  color_hex: z.string().nullable().describe("Roles: a color like '#d4ff3a'. Null keeps it."),
  hoist: z
    .boolean()
    .nullable()
    .describe("Roles: show separately in the member list. Null keeps it."),
  mentionable: z.boolean().nullable().describe("Roles: anyone can @mention it. Null keeps it."),
  permissions: z
    .array(z.enum(QM_ROLE_PERMISSION_KEYS as [QmRolePermission, ...QmRolePermission[]]))
    .nullable()
    .describe(
      "Roles: the full list of member permissions it should have, from the allowed list (it replaces them). Null keeps them.",
    ),
});
export type AiEdit = z.infer<typeof AiEditSchema>;

/** Channel kinds as the snapshot reports them. */
export type ChannelKind = "text" | "voice" | "announcement" | "forum" | "stage" | "media" | "other";
const TEXTISH: ChannelKind[] = ["text", "announcement", "forum", "media"];
const HAS_TOPIC: ChannelKind[] = ["text", "announcement", "forum", "media"];
const HAS_SLOWMODE: ChannelKind[] = ["text", "forum", "media", "voice", "stage"];
const HAS_LIMIT: ChannelKind[] = ["voice"];

const label = (kind: QmEdit["kind"], name: string, channel?: ChannelKind) =>
  kind.endsWith("_role")
    ? `@${name}`
    : kind.endsWith("_category")
      ? `category ${name}`
      : channel && TEXTISH.includes(channel)
        ? `#${name}`
        : name;

/**
 * Check the model's edits against the server and what the plan creates. Errors go into
 * `errors` (the whole plan is refused if there are any), like validatePlan's.
 */
export function validateEdits(
  raw: AiEdit[],
  server: ServerSnapshot,
  ops: QmOperation[],
  errors: string[],
): QmEdit[] {
  const out: QmEdit[] = [];
  const made = new Map(ops.map((o) => [o.ref, o.kind]));
  const categories = new Map(server.categories.map((c) => [c.id, c.name]));
  const channels = new Map(
    (server.channels ?? []).map((c) => [c.id, { ...c, kind: c.kind ?? ("text" as ChannelKind) }]),
  );
  const roles = new Map(server.roles.map((r) => [r.id, r]));
  const protectedChannels = server.protectedChannels ?? {};
  const seen = new Set<string>();
  const deletes = raw.filter((e) => e.kind.startsWith("delete_")).length;
  if (deletes > MAX_DELETES)
    errors.push(`A plan can delete ${MAX_DELETES} things at most; deletions are permanent.`);

  raw.forEach((e, i) => {
    const n = `Edit ${i + 1}`;
    const id = e.id.trim();
    const onRole = e.kind.endsWith("_role");
    const onCategory = e.kind.endsWith("_category");
    const channel = channels.get(id);
    const role = roles.get(id);
    const was = onRole ? role?.name : onCategory ? categories.get(id) : channel?.name;
    if (!was) {
      errors.push(
        `${n}: "${id.slice(0, 40)}" isn't a ${onRole ? "role" : onCategory ? "category" : "channel"} in this server.`,
      );
      return;
    }
    const what = label(e.kind, was, channel?.kind);
    if (seen.has(id)) {
      errors.push(`${n}: ${what} is changed twice; put everything for it in one edit.`);
      return;
    }
    seen.add(id);

    if (onRole) {
      if (id === server.everyoneId) {
        errors.push(
          `${n}: @everyone can't be changed or deleted here; change channel access instead.`,
        );
        return;
      }
      if (!role?.movable) {
        errors.push(
          `${n}: ${what} has admin or moderation powers, belongs to a bot or integration, or sits above Garrison's role, so the AI assistant leaves it alone. Change it in Server Settings → Roles.`,
        );
        return;
      }
    }

    if (e.kind.startsWith("delete_")) {
      const why = protectedChannels[id];
      if (why) {
        errors.push(`${n}: ${what} can't be deleted: ${why}`);
        return;
      }
      out.push({ kind: e.kind, id, was });
      return;
    }

    const edit: QmEdit = { kind: e.kind, id, was };
    const kind = channel?.kind;
    if (e.name?.trim() && e.name.trim() !== was) {
      const name =
        !onRole && !onCategory && kind && TEXTISH.includes(kind)
          ? channelName(e.name)
          : displayName(e.name, onRole ? 100 : 90);
      if (!name) errors.push(`${n}: the new name for ${what} is empty once cleaned up.`);
      else if (name !== was) edit.name = name;
    }

    if (!onRole && !onCategory && kind) {
      if (e.topic !== null) {
        if (!HAS_TOPIC.includes(kind)) errors.push(`${n}: ${what} can't have a topic.`);
        else edit.topic = e.topic.trim() ? displayName(e.topic, 1000) : "";
      }
      if (e.slowmode_seconds !== null) {
        if (!HAS_SLOWMODE.includes(kind)) errors.push(`${n}: ${what} has no slowmode.`);
        else if (e.slowmode_seconds < 0 || e.slowmode_seconds > 21_600)
          errors.push(`${n}: slowmode must be 0 to 21600 seconds.`);
        else edit.slowmodeSeconds = e.slowmode_seconds;
      }
      if (e.user_limit !== null) {
        if (!HAS_LIMIT.includes(kind)) errors.push(`${n}: only voice channels have a user limit.`);
        else if (e.user_limit < 0 || e.user_limit > 99)
          errors.push(`${n}: a voice user limit is 0 to 99.`);
        else edit.userLimit = e.user_limit;
      }
      if (e.nsfw !== null) edit.nsfw = e.nsfw;
      if (e.parent !== null) {
        const p = e.parent.trim();
        if (p.toLowerCase() === "none") edit.parent = null;
        else if (made.get(p.toLowerCase()) === "create_category") edit.parent = p.toLowerCase();
        else if (categories.has(p)) edit.parent = p;
        else errors.push(`${n}: "${p.slice(0, 40)}" isn't a category in this plan or the server.`);
        if (edit.parent !== undefined && edit.parent === (channel?.parentId ?? null))
          delete edit.parent;
      }
      if (e.sync_with_category) {
        const parent = edit.parent !== undefined ? edit.parent : (channel?.parentId ?? null);
        if (!parent)
          errors.push(`${n}: ${what} isn't in a category, so there's nothing to follow.`);
        else if (e.access) errors.push(`${n}: set ${what}'s own access or sync it, not both.`);
        else edit.syncWithCategory = true;
      }
    } else if (
      e.topic !== null ||
      e.slowmode_seconds !== null ||
      e.user_limit !== null ||
      e.parent !== null ||
      e.sync_with_category
    ) {
      errors.push(`${n}: only channels have a topic, slowmode, user limit or category.`);
    }

    if (e.access) {
      if (onRole) errors.push(`${n}: roles don't have channel access; edit the channels instead.`);
      else {
        const rolesFrom = (list: string[], whatFor: string) => {
          const picked: string[] = [];
          if (list.length > MAX_PRIVATE_ROLES)
            errors.push(`${n}: ${whatFor} ${MAX_PRIVATE_ROLES} roles at most.`);
          for (const r of list.slice(0, MAX_PRIVATE_ROLES)) {
            const t = r.trim();
            const existing = roles.get(t);
            if (made.get(t.toLowerCase()) === "create_role") picked.push(t.toLowerCase());
            else if (existing && !existing.managed && t !== server.everyoneId) picked.push(t);
            else
              errors.push(
                `${n}: "${t.slice(0, 40)}" isn't a role in this plan or a normal role in the server.`,
              );
          }
          return [...new Set(picked)];
        };
        const privateTo = rolesFrom(e.access.private_to, "it can be private to");
        const posters = e.access.read_only ? rolesFrom(e.access.posters, "it can let") : [];
        if (!e.access.read_only && e.access.posters.length)
          errors.push(`${n}: it lists who can post in ${what}, but doesn't make it read-only.`);
        edit.access = { privateTo, readOnly: e.access.read_only, posters };
      }
    }

    if (onRole) {
      if (e.color_hex !== null) {
        const m = e.color_hex.trim().match(/^#?([0-9a-f]{6})$/i);
        if (m?.[1]) edit.color = Number.parseInt(m[1], 16);
        else errors.push(`${n}: "${e.color_hex.slice(0, 20)}" isn't a color like #d4ff3a.`);
      }
      if (e.hoist !== null) edit.hoist = e.hoist;
      if (e.mentionable !== null) edit.mentionable = e.mentionable;
      if (e.permissions !== null) {
        const can = new Set(server.grantable ?? QM_ROLE_PERMISSION_KEYS);
        const perms: QmRolePermission[] = [];
        for (const p of new Set(e.permissions)) {
          if (!Object.hasOwn(QM_ROLE_PERMISSIONS, p))
            errors.push(
              `${n}: "${String(p).slice(0, 40)}" isn't a permission the AI assistant can give.`,
            );
          else if (!can.has(p))
            errors.push(
              `${n}: Garrison can't give "${QM_ROLE_PERMISSIONS[p].label}" yet. Re-invite it from the dashboard to allow that.`,
            );
          else perms.push(p);
        }
        edit.permissions = perms;
      }
    } else if (e.color_hex !== null || e.hoist !== null || e.mentionable !== null || e.permissions)
      errors.push(`${n}: only roles have a color, permissions, or show-separately setting.`);

    const changes = Object.keys(edit).filter((k) => !["kind", "id", "was"].includes(k));
    if (!changes.length) {
      errors.push(`${n}: it doesn't change anything about ${what}.`);
      return;
    }
    out.push(edit);
  });

  // Nothing in the plan may lean on something it deletes.
  const gone = new Set(out.filter((x) => x.kind.startsWith("delete_")).map((x) => x.id));
  if (gone.size) {
    const named = (id: string) => {
      const x = out.find((o) => o.id === id);
      return x ? label(x.kind, x.was, channels.get(id)?.kind) : id;
    };
    for (const op of ops) {
      for (const ref of [op.parent ?? "", ...op.privateTo, ...(op.posters ?? [])])
        if (gone.has(ref))
          errors.push(`New ${op.name} uses ${named(ref)}, which the plan deletes.`);
    }
    for (const x of out) {
      if (x.kind.startsWith("delete_")) continue;
      const uses = [
        typeof x.parent === "string" ? x.parent : "",
        ...(x.access?.privateTo ?? []),
        ...(x.access?.posters ?? []),
      ];
      for (const ref of uses)
        if (gone.has(ref))
          errors.push(`The change to ${named(x.id)} uses ${named(ref)}, which the plan deletes.`);
    }
  }
  return out;
}

/** Ids the plan deletes, for checks elsewhere (orders, settings, posts). */
export const deletedIds = (edits: QmEdit[]) =>
  new Set(edits.filter((e) => e.kind.startsWith("delete_")).map((e) => e.id));

/** A stored edit as the model wrote it, for revising a plan that hasn't been built. */
export function asAiEdits(edits: QmEdit[]): AiEdit[] {
  return edits.map((e) => ({
    kind: e.kind,
    id: e.id,
    name: e.name ?? null,
    topic: e.topic ?? null,
    slowmode_seconds: e.slowmodeSeconds ?? null,
    user_limit: e.userLimit ?? null,
    nsfw: e.nsfw ?? null,
    parent: e.parent === undefined ? null : (e.parent ?? "none"),
    access: e.access
      ? { private_to: e.access.privateTo, read_only: e.access.readOnly, posters: e.access.posters }
      : null,
    sync_with_category: e.syncWithCategory ?? null,
    color_hex: e.color === undefined ? null : `#${e.color.toString(16).padStart(6, "0")}`,
    hoist: e.hoist ?? null,
    mentionable: e.mentionable ?? null,
    permissions: (e.permissions as QmRolePermission[] | undefined) ?? null,
  }));
}
