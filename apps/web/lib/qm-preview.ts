import {
  QM_ROLE_PERMISSIONS,
  type QmEdit,
  type QmOperation,
  type QmOrder,
  type QmPost,
  type QmRolePermission,
  type QmSettingChange,
  qmPostLabel,
  qmSettingLabel,
  qmSettingValueText,
} from "@garrison/db";
import type { LayoutChannel, ServerLayout } from "./discord";

/**
 * The server as it would look after a Quartermaster plan is built: today's
 * categories, channels and roles with the plan's additions slotted in where
 * Discord will put them, in the plan's new order, with its edits shown in place: renamed
 * (with the old name for Now), moved to another category, or deleted. Pure, so it's unit
 * tested.
 */

/**
 * A row a plan's order moves shows twice: `"from"` where it is now (the Now view) and
 * `"to"` where it goes (With changes). Counts and details use the `"to"` one.
 */
export type Moved = "from" | "to";

/** One role's overwrite on a channel, in words: what it's allowed and denied there. */
export interface PermRow {
  key: string;
  who: string;
  color: number;
  allowed: string[];
  denied: string[];
}

export interface PreviewChannel {
  key: string;
  name: string;
  kind: LayoutChannel["kind"];
  locked: boolean;
  isNew: boolean;
  /** What's worth knowing about a new channel: who sees it, topic, limits. */
  details: string[];
  topic?: string | null;
  /** Per-role overwrites, @everyone first. */
  perms?: PermRow[];
  /** A new channel's ref in the plan, so it can be taken out of it. */
  ref?: string;
  moved?: Moved;
  /** Renamed by the plan: its name now, for the Now view. */
  was?: string;
  /** The plan deletes it. */
  gone?: boolean;
}
export interface PreviewCategory {
  key: string;
  name: string;
  isNew: boolean;
  was?: string;
  gone?: boolean;
  /** An existing category the plan adds channels to. */
  touched: boolean;
  channels: PreviewChannel[];
  moved?: Moved;
}
export interface PreviewRole {
  key: string;
  name: string;
  color: number;
  isNew: boolean;
  details: string[];
  /** What the role can do server-wide, from its permissions. */
  power?: "Admin" | "Moderator" | "Member";
  perms?: string[];
  /** Position from the top (1 is highest); new roles go to the bottom. */
  position?: number | null;
  ref?: string;
  moved?: Moved;
  was?: string;
  gone?: boolean;
}
export interface ServerPreview {
  loose: PreviewChannel[];
  categories: PreviewCategory[];
  roles: PreviewRole[];
  added: { categories: number; channels: number; roles: number };
  /** Rows the plan's orders move, counted once. */
  moved?: number;
}

/** The rows as they'll be: a moved row's old place left out. */
export const afterRows = <T extends { moved?: Moved }>(list: T[]) =>
  list.filter((x) => x.moved !== "from");

/**
 * Put `keys` in that order among the places they hold now (the bot's orderPositions does
 * the same with Discord positions), then `settle` (text above voice). Rows whose place
 * changed come back twice, old place first, so Now and With changes each show one.
 */
export function reorderRows<T extends { key: string; isNew: boolean; moved?: Moved }>(
  list: T[],
  keys: string[],
  settle: (l: T[]) => T[] = (l) => l,
): { rows: T[]; moved: number } {
  const byKey = new Map(list.map((x) => [x.key, x]));
  const ranked = keys.filter((k, i) => byKey.has(k) && keys.indexOf(k) === i);
  if (ranked.length < 2) return { rows: list, moved: 0 };
  const slots = list.flatMap((x, i) => (ranked.includes(x.key) ? [i] : []));
  const after = [...list];
  slots.forEach((slot, i) => {
    after[slot] = byKey.get(ranked[i] as string) as T;
  });
  const settled = settle(after);
  const rows: T[] = [];
  let moved = 0;
  settled.forEach((x, i) => {
    const was = list[i] as T;
    if (was.key === x.key) {
      rows.push(x);
      return;
    }
    if (!was.isNew) rows.push({ ...was, moved: "from" });
    rows.push({ ...x, moved: "to" });
    if (!x.isNew) moved++;
  });
  return { rows, moved };
}

/** Discord permission bits worth naming, in the order people think of them. */
const PERMS: [bigint, string][] = [
  [1n << 3n, "Administrator"],
  [1n << 5n, "Manage server"],
  [1n << 28n, "Manage roles"],
  [1n << 4n, "Manage channels"],
  [1n << 2n, "Ban members"],
  [1n << 1n, "Kick members"],
  [1n << 40n, "Time out members"],
  [1n << 13n, "Manage messages"],
  [1n << 17n, "Mention everyone"],
  [1n << 29n, "Manage webhooks"],
  [1n << 10n, "View channel"],
  [1n << 11n, "Send messages"],
  [1n << 16n, "Read history"],
  [1n << 14n, "Embed links"],
  [1n << 15n, "Attach files"],
  [1n << 6n, "Add reactions"],
  [1n << 18n, "External emoji"],
  [1n << 35n, "Create threads"],
  [1n << 38n, "Talk in threads"],
  [1n << 20n, "Connect"],
  [1n << 21n, "Speak"],
  [1n << 9n, "Video"],
  [1n << 0n, "Create invites"],
  [1n << 26n, "Change nickname"],
];
const MOD_BITS =
  (1n << 1n) | (1n << 2n) | (1n << 4n) | (1n << 5n) | (1n << 13n) | (1n << 28n) | (1n << 40n);

const bits = (s: string | undefined) => {
  try {
    return BigInt(s ?? "0");
  } catch {
    return 0n;
  }
};
/** The named permissions in a bit set; anything unnamed is counted as "N more". */
export function permLabels(set: bigint) {
  const named = PERMS.filter(([b]) => (set & b) !== 0n).map(([, l]) => l);
  const known = PERMS.reduce((a, [b]) => a | b, 0n);
  let rest = set & ~known;
  let more = 0;
  while (rest) {
    more += Number(rest & 1n);
    rest >>= 1n;
  }
  return more ? [...named, `${more} more`] : named;
}
export function rolePower(set: bigint): NonNullable<PreviewRole["power"]> {
  if (set & (1n << 3n)) return "Admin";
  return set & MOD_BITS ? "Moderator" : "Member";
}

const isChannel = (o: QmOperation) =>
  o.kind === "create_text_channel" || o.kind === "create_voice_channel";

/** `everyoneId`: the server's id, which is also @everyone's role id in overwrites. */
export function previewServer(
  layout: ServerLayout,
  plan: QmOperation[],
  everyoneId = "",
  orders: QmOrder[] = [],
  edits: QmEdit[] = [],
): ServerPreview {
  // What the plan's edits do to what exists: new names, deletions, channels moved elsewhere.
  const renamed = new Map(
    edits
      .filter((e) => e.name && !e.kind.startsWith("delete_"))
      .map((e) => [e.id, e.name as string]),
  );
  const deleting = new Set(edits.filter((e) => e.kind.startsWith("delete_")).map((e) => e.id));
  const movedTo = new Map(
    edits
      .filter((e) => e.kind === "edit_channel" && e.parent !== undefined)
      .map((e) => [e.id, e.parent ?? null]),
  );
  /** A row as the edits leave it. */
  const edited = <T extends { key: string; name: string }>(row: T): T => {
    const name = renamed.get(row.key);
    return {
      ...row,
      ...(name && name !== row.name ? { name, was: row.name } : {}),
      ...(deleting.has(row.key) ? { gone: true } : {}),
    };
  };
  const roleName = new Map<string, string>([
    ...layout.roles.map((r) => [r.id, r.name] as [string, string]),
    ...plan.filter((o) => o.kind === "create_role").map((o) => [o.ref, o.name] as [string, string]),
  ]);
  const roleColor = new Map<string, number>([
    ...layout.roles.map((r) => [r.id, r.color] as [string, number]),
    ...plan
      .filter((o) => o.kind === "create_role")
      .map((o) => [o.ref, o.color ?? 0] as [string, number]),
  ]);
  const who = (id: string) =>
    id === everyoneId || id === "everyone" ? "@everyone" : `@${roleName.get(id) ?? "deleted role"}`;
  const everyoneFirst = (rows: PermRow[]) => [
    ...rows.filter((x) => x.who === "@everyone"),
    ...rows.filter((x) => x.who !== "@everyone"),
  ];
  const existing = (c: LayoutChannel): PreviewChannel =>
    edited({
      key: c.id,
      name: c.name,
      kind: c.kind,
      locked: c.locked,
      isNew: false,
      details: [],
      topic: c.topic ?? null,
      perms: everyoneFirst(
        (c.overwrites ?? []).map((o) => ({
          key: o.id,
          who: who(o.id),
          color: roleColor.get(o.id) ?? 0,
          allowed: permLabels(bits(o.allow)),
          denied: permLabels(bits(o.deny)),
        })),
      ),
    });
  /** A new channel's overwrites as Garrison will make them (service.ts channelOverwrites). */
  const madePerms = (o: QmOperation): PermRow[] => {
    const voice = o.kind === "create_voice_channel";
    const use = voice
      ? ["View channel", "Connect", "Speak"]
      : ["View channel", "Send messages", "Read history"];
    const talk = voice ? "Speak" : "Send messages";
    const rows = new Map<string, PermRow>();
    const row = (id: string) => {
      let x = rows.get(id);
      if (!x) {
        x = { key: id, who: who(id), color: roleColor.get(id) ?? 0, allowed: [], denied: [] };
        rows.set(id, x);
      }
      return x;
    };
    if (o.privateTo.length) {
      row("everyone").denied.push("View channel");
      for (const r of o.privateTo) row(r).allowed.push(...use);
    }
    if (o.readOnly) {
      row("everyone").denied.push(talk);
      for (const r of o.posters ?? []) {
        const x = row(r);
        if (!x.allowed.includes(talk)) x.allowed.push(talk);
      }
    }
    return everyoneFirst([...rows.values()]);
  };
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
      topic: o.topic ?? null,
      perms: madePerms(o),
      ref: o.ref,
    };
  };
  const channels = plan.filter(isChannel);
  const newCategories = plan.filter((o) => o.kind === "create_category");
  const homes = new Set([
    ...layout.categories.map((c) => c.id),
    ...newCategories.map((o) => o.ref),
  ]);
  const into = (parent: string) => channels.filter((o) => o.parent === parent).map(made);
  // Existing channels an edit moves to another category: where each one lands, by list key.
  const listKey = (parent: string | null) =>
    parent === null
      ? ""
      : layout.categories.some((c) => c.id === parent)
        ? parent
        : `new:${parent}`;
  const arriving = new Map<string, PreviewChannel[]>();
  const homeOf = new Map<string, string>([
    ...layout.loose.map((c) => [c.id, ""] as [string, string]),
    ...layout.categories.flatMap((cat) =>
      cat.channels.map((c) => [c.id, cat.id] as [string, string]),
    ),
  ]);
  for (const c of [...layout.loose, ...layout.categories.flatMap((x) => x.channels)]) {
    const to = movedTo.get(c.id);
    if (to === undefined || listKey(to) === homeOf.get(c.id)) continue;
    const key = listKey(to);
    arriving.set(key, [...(arriving.get(key) ?? []), { ...existing(c), moved: "to" }]);
  }
  /** A list's existing channels: one moved away stays as its old place, for Now. */
  const staying = (list: LayoutChannel[], key: string) =>
    list.map((c): PreviewChannel => {
      const to = movedTo.get(c.id);
      return to !== undefined && listKey(to) !== key
        ? { ...existing(c), moved: "from" }
        : existing(c);
    });
  // Discord lists text channels above voice ones, so a new text channel lands above the voice rooms.
  const voiceLast = (list: PreviewChannel[]) => [
    ...list.filter((c) => c.kind !== "voice"),
    ...list.filter((c) => c.kind === "voice"),
  ];

  // An order names existing things by id and the plan's own by ref.
  const keyOf = (item: string, known: Set<string>) => (known.has(item) ? item : `new:${item}`);
  const categoryIds = new Set(layout.categories.map((c) => c.id));
  let moved = 0;
  const ordered = <T extends { key: string; isNew: boolean; moved?: Moved }>(
    list: T[],
    scope: QmOrder["scope"],
    known: Set<string>,
    parentKey: string | null = null,
    settle?: (l: T[]) => T[],
  ) => {
    let rows = list;
    for (const o of orders) {
      if (o.scope !== scope) continue;
      if (scope === "channels" && keyOf(o.parent ?? "", categoryIds) !== parentKey) continue;
      const r = reorderRows(
        afterRows(rows),
        o.items.map((i) => keyOf(i, known)),
        settle,
      );
      rows = r.rows;
      moved += r.moved;
    }
    return rows;
  };
  const channelIds = new Set(
    [...layout.loose, ...layout.categories.flatMap((c) => c.channels)].map((c) => c.id),
  );
  const roleIds = new Set(layout.roles.map((r) => r.id));
  const inOrder = (key: string, list: PreviewChannel[]) =>
    ordered(list, "channels", channelIds, key, voiceLast);

  const preview: ServerPreview = {
    // A channel with no category, or whose category has since gone, sits at the top.
    loose: voiceLast([
      ...staying(layout.loose, ""),
      ...channels.filter((o) => !o.parent || !homes.has(o.parent)).map(made),
      ...(arriving.get("") ?? []),
    ]),
    categories: [
      ...layout.categories.map((c) => {
        const added = [...into(c.id), ...(arriving.get(c.id) ?? [])];
        const list = voiceLast([...staying(c.channels, c.id), ...added]);
        return edited({
          key: c.id,
          name: c.name,
          isNew: false,
          // Opened when the plan changes anything in it.
          touched: added.length > 0 || list.some((x) => x.moved || x.was || x.gone),
          channels: inOrder(c.id, list),
        });
      }),
      // Discord puts new categories at the bottom.
      ...newCategories.map((o) => ({
        key: `new:${o.ref}`,
        name: o.name,
        isNew: true,
        touched: true,
        channels: inOrder(
          `new:${o.ref}`,
          voiceLast([...into(o.ref), ...(arriving.get(`new:${o.ref}`) ?? [])]),
        ),
      })),
    ],
    roles: [
      ...layout.roles.map((r, i) =>
        edited({
          key: r.id,
          name: r.name,
          color: r.color,
          isNew: false,
          details: r.managed ? ["Managed by an app"] : [],
          power: rolePower(bits(r.permissions)),
          perms: permLabels(bits(r.permissions)),
          position: i + 1,
        }),
      ),
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
          power: "Member" as const,
          perms: (o.permissions ?? [])
            .map((p) => QM_ROLE_PERMISSIONS[p as QmRolePermission]?.label)
            .filter((l): l is (typeof QM_ROLE_PERMISSIONS)[QmRolePermission]["label"] =>
              Boolean(l),
            ),
          position: null,
          ref: o.ref,
        })),
    ],
    added: {
      categories: newCategories.length,
      channels: channels.length,
      roles: plan.filter((o) => o.kind === "create_role").length,
    },
    moved: [...arriving.values()].reduce((n, l) => n + l.length, 0),
  };
  if (!orders.length) return preview;
  preview.categories = ordered(preview.categories, "categories", categoryIds).map((c) =>
    // A category with a channel moved inside it opens, like one with new channels.
    c.channels.some((x) => x.moved) ? { ...c, touched: true } : c,
  );
  const roles = ordered(preview.roles, "roles", roleIds);
  if (roles !== preview.roles) {
    // Positions as they'll be; new roles nobody moved still go to the bottom.
    let at = 0;
    preview.roles = roles.map((r) => {
      if (r.moved === "from") return r;
      at++;
      return r.isNew && !r.moved ? r : { ...r, position: at };
    });
  }
  preview.moved = (preview.moved ?? 0) + moved;
  return preview;
}

/** A plan's orders in words, for the plan panel: where, and the new order top to bottom. */
export function orderLines(orders: QmOrder[], plan: QmOperation[], layout: ServerLayout | null) {
  const names = new Map<string, string>([
    ...(layout?.categories ?? []).map((c) => [c.id, c.name] as [string, string]),
    ...plan.map((o) => [o.ref, o.name] as [string, string]),
  ]);
  return orders.map((o, i) => ({
    key: `${o.scope}:${o.parent ?? ""}:${i}`,
    where:
      o.scope === "categories"
        ? "Categories"
        : o.scope === "roles"
          ? "Roles"
          : `Channels in ${names.get(o.parent ?? "") ?? "a category"}`,
    names: o.scope === "roles" ? o.names.map((n) => `@${n}`) : o.names,
  }));
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
  /** "automod.scamLinks": which change it is, to take it out of a draft. */
  key: string;
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
    key: `${c.module}.${c.field}`,
    label: qmSettingLabel(c.module, c.field),
    from: qmSettingValueText(c.module, c.field, c.from, name),
    to: qmSettingValueText(c.module, c.field, c.to, name),
  }));
}

/** One line per setting, for a build's history entry. */
export function settingLines(settings: QmSettingChange[]) {
  return settings.map((c) => `~ ${qmSettingLabel(c.module, c.field)}`);
}

export interface PostPreview {
  /** "Saved message “Rules”" */
  what: string;
  /** "#rules (new)" */
  where: string;
}

/** What a plan posts and where, with the plan's new channels by name. */
export function postPreviews(
  layout: ServerLayout | null,
  plan: QmOperation[],
  posts: QmPost[],
): PostPreview[] {
  const made = new Map(plan.map((o) => [o.ref, o.name]));
  const channels = new Map<string, string>();
  for (const c of layout?.loose ?? []) channels.set(c.id, c.name);
  for (const cat of layout?.categories ?? [])
    for (const c of cat.channels) channels.set(c.id, c.name);
  return posts.map((p) => ({
    what: `${qmPostLabel(p.kind)} “${p.name}”`,
    where: made.has(p.channel)
      ? `#${made.get(p.channel)} (new)`
      : channels.has(p.channel)
        ? `#${channels.get(p.channel)}`
        : "a deleted channel",
  }));
}

/** One line per post, for a build's history entry. */
export function postLines(posts: QmPost[]) {
  return posts.map((p) => `> ${qmPostLabel(p.kind)} ${p.name}`);
}

/** The id of an item's details section in the plan panel, from its preview key. */
export const detailId = (key: string) => `qm-d-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
