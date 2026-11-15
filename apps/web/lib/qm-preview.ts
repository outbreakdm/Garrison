import {
  QM_ROLE_PERMISSIONS,
  type QmOperation,
  type QmRolePermission,
  type QmSettingChange,
  qmSettingLabel,
  qmSettingValueText,
} from "@garrison/db";
import type { LayoutChannel, ServerLayout } from "./discord";

/**
 * The server as it would look after a Quartermaster plan is built: today's
 * categories, channels and roles with the plan's additions slotted in where
 * Discord will put them. Pure, so it's unit tested. A plan only ever adds.
 */

export interface PreviewChannel {
  key: string;
  name: string;
  kind: LayoutChannel["kind"];
  locked: boolean;
  isNew: boolean;
  /** What's worth knowing about a new channel: who sees it, topic, limits. */
  details: string[];
}
export interface PreviewCategory {
  key: string;
  name: string;
  isNew: boolean;
  /** An existing category the plan adds channels to. */
  touched: boolean;
  channels: PreviewChannel[];
}
export interface PreviewRole {
  key: string;
  name: string;
  color: number;
  isNew: boolean;
  details: string[];
}
export interface ServerPreview {
  loose: PreviewChannel[];
  categories: PreviewCategory[];
  roles: PreviewRole[];
  added: { categories: number; channels: number; roles: number };
}

const existing = (c: LayoutChannel): PreviewChannel => ({
  key: c.id,
  name: c.name,
  kind: c.kind,
  locked: c.locked,
  isNew: false,
  details: [],
});

const isChannel = (o: QmOperation) =>
  o.kind === "create_text_channel" || o.kind === "create_voice_channel";

export function previewServer(layout: ServerLayout, plan: QmOperation[]): ServerPreview {
  const roleName = new Map<string, string>([
    ...layout.roles.map((r) => [r.id, r.name] as [string, string]),
    ...plan.filter((o) => o.kind === "create_role").map((o) => [o.ref, o.name] as [string, string]),
  ]);
  const made = (o: QmOperation): PreviewChannel => {
    const details: string[] = [];
    const at = (list: string[]) => list.map((r) => `@${roleName.get(r) ?? "?"}`).join(", ");
    if (o.privateTo.length) details.push(`Only ${at(o.privateTo)}`);
    if (o.readOnly)
      details.push(
        o.kind === "create_voice_channel"
          ? o.posters?.length
            ? `Only ${at(o.posters)} can speak`
            : "Listen only"
          : o.posters?.length
            ? `Read-only: ${at(o.posters)} can post`
            : "Read-only",
      );
    if (o.topic) details.push(o.topic);
    if (o.slowmodeSeconds) details.push(`Slowmode ${o.slowmodeSeconds} s`);
    if (o.userLimit) details.push(`Limit ${o.userLimit}`);
    return {
      key: `new:${o.ref}`,
      name: o.name,
      kind: o.kind === "create_voice_channel" ? "voice" : "text",
      locked: o.privateTo.length > 0,
      isNew: true,
      details,
    };
  };
  const channels = plan.filter(isChannel);
  const newCategories = plan.filter((o) => o.kind === "create_category");
  const homes = new Set([
    ...layout.categories.map((c) => c.id),
    ...newCategories.map((o) => o.ref),
  ]);
  const into = (parent: string) => channels.filter((o) => o.parent === parent).map(made);
  // Discord lists text channels above voice ones, so a new text channel lands above the voice rooms.
  const voiceLast = (list: PreviewChannel[]) => [
    ...list.filter((c) => c.kind !== "voice"),
    ...list.filter((c) => c.kind === "voice"),
  ];

  return {
    // A channel with no category, or whose category has since gone, sits at the top.
    loose: voiceLast([
      ...layout.loose.map(existing),
      ...channels.filter((o) => !o.parent || !homes.has(o.parent)).map(made),
    ]),
    categories: [
      ...layout.categories.map((c) => {
        const added = into(c.id);
        return {
          key: c.id,
          name: c.name,
          isNew: false,
          touched: added.length > 0,
          channels: voiceLast([...c.channels.map(existing), ...added]),
        };
      }),
      // Discord puts new categories at the bottom.
      ...newCategories.map((o) => ({
        key: `new:${o.ref}`,
        name: o.name,
        isNew: true,
        touched: true,
        channels: voiceLast(into(o.ref)),
      })),
    ],
    roles: [
      ...layout.roles.map((r) => ({
        key: r.id,
        name: r.name,
        color: r.color,
        isNew: false,
        details: r.managed ? ["Managed by an app"] : [],
      })),
      // New roles start at the bottom, with no permissions.
      ...plan
        .filter((o) => o.kind === "create_role")
        .map((o) => ({
          key: `new:${o.ref}`,
          name: o.name,
          color: o.color ?? 0,
          isNew: true,
          details: [
            permissionText(o.permissions),
            ...(o.hoist ? ["Shown separately"] : []),
            ...(o.mentionable ? ["Anyone can mention"] : []),
          ],
        })),
    ],
    added: {
      categories: newCategories.length,
      channels: channels.length,
      roles: plan.filter((o) => o.kind === "create_role").length,
    },
  };
}

/** A new role's permissions in words: "Attach files, Create threads", or "No permissions". */
export function permissionText(permissions: string[] | undefined) {
  const labels = (permissions ?? [])
    .map((p) => QM_ROLE_PERMISSIONS[p as QmRolePermission]?.label)
    .filter(Boolean);
  return labels.length ? labels.join(", ") : "No permissions";
}

/** "2 categories, 5 channels and 1 role", leaving out what the plan doesn't add. */
export function addedText(added: ServerPreview["added"]) {
  const parts = [
    added.categories
      ? `${added.categories} ${added.categories === 1 ? "category" : "categories"}`
      : "",
    added.channels ? `${added.channels} ${added.channels === 1 ? "channel" : "channels"}` : "",
    added.roles ? `${added.roles} ${added.roles === 1 ? "role" : "roles"}` : "",
  ].filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** One line per change, for a build's history entry. */
export function planLines(plan: QmOperation[]) {
  const names = new Map(plan.map((o) => [o.ref, o.name]));
  return plan.map((o) => {
    const where = o.parent && names.has(o.parent) ? ` in ${names.get(o.parent)}` : "";
    const lock = `${o.privateTo.length ? " · private" : ""}${
      o.readOnly ? (o.kind === "create_voice_channel" ? " · listen only" : " · read-only") : ""
    }`;
    switch (o.kind) {
      case "create_category":
        return `+ Category ${o.name}`;
      case "create_text_channel":
        return `+ #${o.name}${where}${lock}`;
      case "create_voice_channel":
        return `+ Voice ${o.name}${where}${lock}`;
      default:
        return `+ Role @${o.name} · ${permissionText(o.permissions).toLowerCase()}`;
    }
  });
}

export interface SettingDiff {
  /** "Automod · Scam links" */
  label: string;
  from: string;
  to: string;
}

/**
 * A plan's settings as the admin reads them: one row per field, from → to, with channel and
 * role names (the plan's new items by name too). An id that's gone shows as such.
 */
export function settingDiffs(
  layout: ServerLayout | null,
  plan: QmOperation[],
  settings: QmSettingChange[],
): SettingDiff[] {
  const made = new Map(plan.map((o) => [o.ref, o]));
  const channels = new Map<string, string>();
  for (const c of layout?.loose ?? []) channels.set(c.id, `#${c.name}`);
  for (const cat of layout?.categories ?? []) {
    channels.set(cat.id, cat.name);
    for (const c of cat.channels) channels.set(c.id, c.kind === "voice" ? c.name : `#${c.name}`);
  }
  const roles = new Map((layout?.roles ?? []).map((r) => [r.id, `@${r.name}`]));
  const name = (v: string) => {
    const o = made.get(v);
    if (o)
      return o.kind === "create_role"
        ? `@${o.name} (new)`
        : o.kind === "create_text_channel"
          ? `#${o.name} (new)`
          : `${o.name} (new)`;
    return channels.get(v) ?? roles.get(v) ?? "a deleted channel or role";
  };
  return settings.map((c) => ({
    label: qmSettingLabel(c.module, c.field),
    from: qmSettingValueText(c.module, c.field, c.from, name),
    to: qmSettingValueText(c.module, c.field, c.to, name),
  }));
}

/** One line per setting, for a build's history entry. */
export function settingLines(settings: QmSettingChange[]) {
  return settings.map((c) => `~ ${qmSettingLabel(c.module, c.field)}`);
}
