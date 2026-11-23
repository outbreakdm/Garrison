import {
  QM_CHANGES_PER_PLAN,
  QM_ROLE_PERMISSION_KEYS,
  QM_ROLE_PERMISSIONS,
  type QmCreated,
  type QmEdit,
  type QmOperation,
  type QmOrder,
  type QmRolePermission,
  type QmSettingChange,
  qmSettingLabel,
  qmSettingValueText,
} from "@garrison/db";
import { z } from "zod";
import { AiEditSchema, type ChannelKind, deletedIds, validateEdits } from "./edits.js";
import { channelName, displayName, MAX_PRIVATE_ROLES } from "./names.js";

/**
 * What the model returns. Deliberately loose (flat, nullable fields) so it maps
 * cleanly to a structured-output schema; every rule that matters is enforced
 * afterwards by validatePlan, because model output is untrusted.
 */
export const AiPlanSchema = z.object({
  summary: z.string().describe("One short sentence describing the whole build."),
  operations: z.array(
    z.object({
      kind: z.enum([
        "create_category",
        "create_text_channel",
        "create_voice_channel",
        "create_role",
      ]),
      ref: z.string().describe("Short unique id for this new item, e.g. 'wardogs' or 'gold_role'."),
      name: z.string(),
      parent: z
        .string()
        .nullable()
        .describe(
          "For channels: a category ref from this plan, or an existing category id. Else null.",
        ),
      topic: z.string().nullable(),
      slowmode_seconds: z.number().int().nullable(),
      user_limit: z.number().int().nullable(),
      private_to: z
        .array(z.string())
        .describe(
          "Role refs from this plan or existing role ids that may see this channel. Empty = visible to everyone.",
        ),
      read_only: z
        .boolean()
        .nullable()
        .describe(
          "Channels only. Text: members can read but not post. Voice: members can listen but not speak. Null or false otherwise.",
        ),
      posters: z
        .array(z.string())
        .describe(
          "Read-only channels: role refs or existing role ids that can still post (text) or speak (voice). Empty otherwise.",
        ),
      color_hex: z.string().nullable().describe("Roles only, e.g. '#d4ff3a'."),
      hoist: z.boolean().nullable(),
      mentionable: z.boolean().nullable(),
      permissions: z
        .array(z.enum(QM_ROLE_PERMISSION_KEYS as [QmRolePermission, ...QmRolePermission[]]))
        .describe("Roles only: member permissions from the allowed list. Empty for none."),
      text_kind: z
        .enum(["text", "announcement", "forum"])
        .nullable()
        .describe(
          "create_text_channel only: announcement (other servers can follow it; Community servers only) or forum (members start posts; its topic is the posting guidelines). Null or text for a normal text channel.",
        ),
    }),
  ),
  notes: z.string().describe("Anything you could not or would not do, and why. Empty if none."),
  order: z
    .array(
      z.object({
        scope: z.enum(["categories", "channels", "roles"]),
        parent: z
          .string()
          .nullable()
          .describe(
            'For "channels": the category id, or a category ref from this plan. Else null.',
          ),
        items: z
          .array(z.string())
          .describe("Ids or refs from this plan, top to bottom as they should show in Discord."),
      }),
    )
    .describe(
      "New orders, top to bottom: the categories, the channels inside one category, or roles. Empty when the order doesn't change.",
    ),
  edits: z
    .array(AiEditSchema)
    .describe(
      "Changes to channels, categories and roles that already exist, and deletions. Empty when nothing existing changes.",
    ),
});
type AiPlanOutput = z.infer<typeof AiPlanSchema>;
/** A plan as the model writes it; older plans and tests may leave out the order and edits. */
export type AiPlan = Omit<AiPlanOutput, "order" | "edits"> & {
  order?: AiPlanOutput["order"];
  edits?: AiPlanOutput["edits"];
  /**
   * Revising a waiting draft: what of it the admin asked to take out (refs, ids, module.field
   * names, message ids). Everything else in the draft is kept (carry.ts), so one draft grows
   * with each message instead of being replaced.
   */
  drop?: string[];
};
export type AiPlanInput = AiPlan;

/** What the plan may refer to that already exists. Built from the server, never from model output. */
export interface ServerSnapshot {
  everyoneId: string;
  categories: { id: string; name: string }[];
  /** Top to bottom. `movable`: Garrison may put it in a new order (see QmOrder). */
  roles: { id: string; name: string; managed: boolean; movable?: boolean }[];
  /** Channels in each category, top to bottom, for orders and edits. Missing: none known (tests). */
  channels?: { id: string; name: string; parentId: string | null; kind?: ChannelKind }[];
  /** Channels Discord or Garrison depends on, with why, so they can't be deleted. */
  protectedChannels?: Record<string, string>;
  channelCount: number;
  roleCount: number;
  /** Role permissions Garrison holds, so can give. Missing: all of them (tests). */
  grantable?: QmRolePermission[];
  /** A Community server, which announcement channels need. Missing: not known (tests). */
  community?: boolean;
}

/** The most changes one plan can make (QM_CHANGES_PER_PLAN). */
export const MAX_OPERATIONS = QM_CHANGES_PER_PLAN;
const DISCORD_CHANNEL_LIMIT = 500;
const DISCORD_ROLE_LIMIT = 250;

export { channelName, displayName, MAX_PRIVATE_ROLES } from "./names.js";

export type ValidationResult =
  | {
      ok: true;
      summary: string;
      operations: QmOperation[];
      orders: QmOrder[];
      edits: QmEdit[];
      notes: string;
    }
  | { ok: false; errors: string[] };

/**
 * The most orders one plan sets: all categories, the roles, and the channels of each category
 * (and those outside any). Six refused a whole-server tidy of a server with five categories.
 */
export const MAX_ORDERS = 25;

/**
 * Turn model output into a plan Garrison will run, or explain why not. A plan
 * with any problem is rejected whole: half a build is worse than none.
 */
export function validatePlan(
  raw: AiPlanInput,
  server: ServerSnapshot,
  /** The most changes this plan may make: 20, or fewer when the day's allowance is short. */
  maxOperations = MAX_OPERATIONS,
  /** Settings fields the plan also changes, already checked; they count as changes too. */
  settingsCount = 0,
): ValidationResult {
  const errors: string[] = [];
  const ops: QmOperation[] = [];
  const refs = new Map<string, QmOperation["kind"]>();
  const categoryIds = new Set(server.categories.map((c) => c.id));
  const roleIds = new Set(
    server.roles.filter((r) => !r.managed && r.id !== server.everyoneId).map((r) => r.id),
  );

  const total =
    raw.operations.length + (raw.order?.length ?? 0) + (raw.edits?.length ?? 0) + settingsCount;
  if (!total) errors.push("The plan has no changes.");
  if (total > maxOperations)
    errors.push(
      maxOperations < MAX_OPERATIONS
        ? `The plan has ${total} changes, but only ${maxOperations} supplies are left for changes.`
        : `The plan has ${total} changes; the most a build can make is ${MAX_OPERATIONS}.`,
    );

  raw.operations.slice(0, maxOperations).forEach((op, i) => {
    const n = `Change ${i + 1}`;
    const ref = op.ref.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(ref))
      errors.push(`${n}: its ref "${op.ref.slice(0, 40)}" isn't valid.`);
    else if (refs.has(ref)) errors.push(`${n}: the ref "${ref}" is used twice.`);

    const isChannel = op.kind === "create_text_channel" || op.kind === "create_voice_channel";
    const name =
      op.kind === "create_text_channel"
        ? channelName(op.name)
        : displayName(op.name, op.kind === "create_role" ? 100 : 90);
    if (!name) errors.push(`${n}: the name is empty once cleaned up.`);

    let parent: string | null = null;
    if (isChannel && op.parent) {
      const p = op.parent.trim();
      if (refs.get(p.toLowerCase()) === "create_category") parent = p.toLowerCase();
      else if (categoryIds.has(p)) parent = p;
      else
        errors.push(
          `${n}: its category "${p.slice(0, 40)}" isn't a category in this plan or the server.`,
        );
    }

    /** Role refs from this plan, or normal existing roles; anything else is an error. */
    const rolesFrom = (list: string[], what: string) => {
      const out: string[] = [];
      if (list.length > MAX_PRIVATE_ROLES)
        errors.push(`${n}: ${what} ${MAX_PRIVATE_ROLES} roles at most.`);
      for (const r of list.slice(0, MAX_PRIVATE_ROLES)) {
        const t = r.trim();
        if (refs.get(t.toLowerCase()) === "create_role") out.push(t.toLowerCase());
        else if (roleIds.has(t)) out.push(t);
        else
          errors.push(
            `${n}: "${t.slice(0, 40)}" isn't a role in this plan or a normal role in the server.`,
          );
      }
      return out;
    };
    const privateTo = isChannel ? rolesFrom(op.private_to, "it can be private to") : [];
    const readOnly = isChannel && op.read_only === true;
    const posters = readOnly ? rolesFrom(op.posters ?? [], "it can let") : [];
    if (isChannel && !readOnly && (op.posters ?? []).length)
      errors.push(`${n}: it lists who can post, but isn't read-only.`);

    const permissions: QmRolePermission[] = [];
    if (op.kind === "create_role") {
      const can = new Set(server.grantable ?? QM_ROLE_PERMISSION_KEYS);
      for (const p of new Set(op.permissions ?? [])) {
        if (!Object.hasOwn(QM_ROLE_PERMISSIONS, p))
          errors.push(
            `${n}: "${String(p).slice(0, 40)}" isn't a permission the AI assistant can give.`,
          );
        else if (!can.has(p))
          errors.push(
            `${n}: Garrison can't give "${QM_ROLE_PERMISSIONS[p].label}" yet. Re-invite it from the dashboard to allow that.`,
          );
        else permissions.push(p);
      }
    } else if ((op.permissions ?? []).length) errors.push(`${n}: only roles get permissions.`);

    let color: number | null = null;
    if (op.kind === "create_role" && op.color_hex) {
      const m = op.color_hex.trim().match(/^#?([0-9a-f]{6})$/i);
      if (m?.[1]) color = Number.parseInt(m[1], 16);
      else errors.push(`${n}: "${op.color_hex.slice(0, 20)}" isn't a color like #d4ff3a.`);
    }

    if (
      op.kind === "create_text_channel" &&
      op.text_kind === "announcement" &&
      server.community === false
    )
      errors.push(
        `${n}: announcement channels need a Community server. Make it a text channel, or turn on Community in Server Settings first.`,
      );
    const slowmode =
      op.kind === "create_text_channel" && op.slowmode_seconds ? op.slowmode_seconds : null;
    if (slowmode !== null && (slowmode < 0 || slowmode > 21_600))
      errors.push(`${n}: slowmode must be 0 to 21600 seconds.`);
    const userLimit = op.kind === "create_voice_channel" && op.user_limit ? op.user_limit : null;
    if (userLimit !== null && (userLimit < 0 || userLimit > 99))
      errors.push(`${n}: voice user limit must be 0 to 99.`);

    refs.set(ref, op.kind);
    ops.push({
      kind: op.kind,
      ref,
      name,
      parent,
      topic:
        op.kind === "create_text_channel" && op.topic ? displayName(op.topic, 300) || null : null,
      slowmodeSeconds: slowmode,
      userLimit,
      privateTo,
      color,
      hoist: op.kind === "create_role" ? Boolean(op.hoist) : false,
      mentionable: op.kind === "create_role" ? Boolean(op.mentionable) : false,
      readOnly,
      posters,
      permissions,
      ...(op.kind === "create_text_channel" &&
      (op.text_kind === "announcement" || op.text_kind === "forum")
        ? { textKind: op.text_kind }
        : {}),
    });
  });

  const newChannels = ops.filter((o) => o.kind !== "create_role").length;
  const newRoles = ops.filter((o) => o.kind === "create_role").length;
  if (server.channelCount + newChannels > DISCORD_CHANNEL_LIMIT)
    errors.push("This would pass Discord's limit of 500 channels.");
  if (server.roleCount + newRoles > DISCORD_ROLE_LIMIT)
    errors.push("This would pass Discord's limit of 250 roles.");

  const orders = validateOrders(raw.order ?? [], server, ops, errors);
  const edits = validateEdits(raw.edits ?? [], server, ops, errors);
  const gone = deletedIds(edits);
  for (const o of orders)
    if ((o.parent && gone.has(o.parent)) || o.items.some((id) => gone.has(id)))
      errors.push("An order lists something the plan deletes; leave it out of the order.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    summary: displayName(raw.summary, 200) || "Server changes",
    operations: ops,
    orders,
    edits,
    notes: displayName(raw.notes, 500),
  };
}

/**
 * New orders, checked against the server: every item is something that exists (or this plan
 * makes) in that list, at least two, none twice. Roles are only those Garrison may move
 * (no admin or moderation powers, not managed, below its own role), so an order can never
 * change who outranks whom among staff.
 */
function validateOrders(
  raw: AiPlanOutput["order"],
  server: ServerSnapshot,
  ops: QmOperation[],
  errors: string[],
): QmOrder[] {
  const out: QmOrder[] = [];
  if (raw.length > MAX_ORDERS) errors.push(`A plan can set ${MAX_ORDERS} orders at most.`);
  const made = new Map(ops.map((o) => [o.ref, o]));
  const categories = new Map(server.categories.map((c) => [c.id, c.name]));
  const roles = new Map(server.roles.filter((r) => r.movable).map((r) => [r.id, r.name]));
  const fixedRoles = new Set(server.roles.filter((r) => !r.movable).map((r) => r.id));
  // Every role top to bottom; a new role starts at the bottom, just above @everyone.
  const ladder = [
    ...server.roles
      .filter((r) => r.id !== server.everyoneId)
      .map((r) => ({ id: r.id, fixed: !r.movable })),
    ...ops.filter((o) => o.kind === "create_role").map((o) => ({ id: o.ref, fixed: false })),
  ];
  const channels = server.channels ?? [];
  raw.slice(0, MAX_ORDERS).forEach((o, i) => {
    const n = `Order ${i + 1}`;
    let parent: string | null = null;
    if (o.scope === "channels") {
      const p = (o.parent ?? "").trim();
      // No parent: the channels outside any category.
      if (!p || p.toLowerCase() === "null" || p.toLowerCase() === "none") parent = null;
      else if (made.get(p.toLowerCase())?.kind === "create_category") parent = p.toLowerCase();
      else if (categories.has(p)) parent = p;
      else {
        errors.push(`${n}: "${p.slice(0, 40)}" isn't a category in this plan or the server.`);
        return;
      }
    }
    const items: string[] = [];
    const names: string[] = [];
    for (const raw of o.items) {
      const t = raw.trim();
      const op = made.get(t.toLowerCase());
      let name: string | undefined;
      if (o.scope === "categories") {
        name = op?.kind === "create_category" ? op.name : categories.get(t);
      } else if (o.scope === "roles") {
        name = op?.kind === "create_role" ? op.name : roles.get(t);
        if (!name && fixedRoles.has(t)) {
          errors.push(
            `${n}: a role with admin or moderation powers, a managed role, or one above Garrison's own stays where it is.`,
          );
          continue;
        }
      } else {
        const isChannel = op?.kind === "create_text_channel" || op?.kind === "create_voice_channel";
        if (isChannel && op.parent === parent) name = op.name;
        else {
          const ch = channels.find((c) => c.id === t);
          if (ch && ch.parentId === parent) name = ch.name;
        }
      }
      if (!name) {
        errors.push(`${n}: "${t.slice(0, 40)}" isn't one of the ${o.scope} it can order.`);
        continue;
      }
      const id = op ? t.toLowerCase() : t;
      if (items.includes(id)) {
        errors.push(`${n}: "${name}" is listed twice.`);
        continue;
      }
      items.push(id);
      names.push(name);
    }
    if (items.length < 2) {
      errors.push(`${n}: an order needs two or more ${o.scope}.`);
      return;
    }
    const crossing = o.scope === "roles" ? roleCrossing(ladder, items) : null;
    if (crossing) {
      errors.push(
        `${n}: @${names[items.indexOf(crossing)]} would pass a staff or bot role. Other roles keep to their side of those, so staff can still moderate everyone below them.`,
      );
      return;
    }
    out.push({ scope: o.scope, parent, items, names });
  });
  return out;
}

/**
 * Where each item goes: the items swap among the places they hold now, top place to the
 * first item. `places` are their current positions; for roles a higher number is higher up,
 * for channels a lower number is. Pure, so the bot and tests agree.
 */
export function orderPositions(
  items: { id: string; position: number }[],
  order: string[],
  higherIsUp: boolean,
): { id: string; position: number }[] {
  const here = items.filter((i) => order.includes(i.id));
  const places = here.map((i) => i.position).sort((a, b) => (higherIsUp ? b - a : a - b));
  const ranked = order.filter((id) => here.some((i) => i.id === id));
  return ranked.map((id, i) => ({ id, position: places[i] ?? 0 }));
}

/**
 * Would an order lift a role past a fixed one (staff, bot, or above Garrison), or drop one
 * below it? `ladder` is every role top to bottom. Staff can only moderate members whose top
 * role is lower than theirs, so plain roles keep to their side of every fixed role. Returns
 * the first role that would cross, or null.
 */
export function roleCrossing(
  ladder: { id: string; fixed: boolean }[],
  order: string[],
): string | null {
  const band = new Map<string, number>();
  let b = 0;
  for (const r of ladder) {
    if (r.fixed) b++;
    else band.set(r.id, b);
  }
  const listed = order.filter((id, i) => band.has(id) && order.indexOf(id) === i);
  const slots = ladder.filter((r) => listed.includes(r.id)).map((r) => band.get(r.id));
  return listed.find((id, i) => band.get(id) !== slots[i]) ?? null;
}

/** Lines for the preview of a plan's orders: "↕ Categories: Info, Games, Voice". */
export function describeOrders(orders: QmOrder[], ops: QmOperation[], server: ServerSnapshot) {
  const names = new Map<string, string>([
    ...ops.map((o) => [o.ref, o.name] as [string, string]),
    ...server.categories.map((c) => [c.id, c.name] as [string, string]),
  ]);
  return orders.map((o) => {
    const where =
      o.scope === "categories"
        ? "Categories"
        : o.scope === "roles"
          ? "Roles"
          : `Channels in ${names.get(o.parent ?? "") ?? "a category"}`;
    const list = o.scope === "roles" ? o.names.map((x) => `@${x}`) : o.names;
    return `↕ ${where}: ${list.join(", ")}`;
  });
}

/** Lines for the preview: exactly what Apply will create. */
export function describePlan(ops: QmOperation[], server: ServerSnapshot) {
  const names = new Map<string, string>([
    ...ops.map((o) => [o.ref, o.name] as [string, string]),
    ...server.categories.map((c) => [c.id, c.name] as [string, string]),
    ...server.roles.map((r) => [r.id, r.name] as [string, string]),
  ]);
  return ops.map((o) => {
    const extras: string[] = [];
    if (o.parent) extras.push(`in ${names.get(o.parent) ?? "?"}`);
    const at = (list: string[]) => list.map((r) => `@${names.get(r) ?? "?"}`).join(", ");
    if (o.privateTo.length) extras.push(`only ${at(o.privateTo)} can see it`);
    if (o.readOnly)
      extras.push(
        o.kind === "create_voice_channel"
          ? `listen-only${o.posters?.length ? `, ${at(o.posters)} can speak` : ""}`
          : `read-only${o.posters?.length ? `, ${at(o.posters)} can post` : ""}`,
      );
    if (o.slowmodeSeconds) extras.push(`slowmode ${o.slowmodeSeconds} s`);
    if (o.userLimit) extras.push(`limit ${o.userLimit}`);
    if (o.topic) extras.push(`topic "${o.topic}"`);
    const tail = extras.length ? ` · ${extras.join(" · ")}` : "";
    switch (o.kind) {
      case "create_category":
        return `+ Category ${o.name}${tail}`;
      case "create_text_channel":
        return `+ #${o.name}${tail}`;
      case "create_voice_channel":
        return `+ Voice ${o.name}${tail}`;
    }
    const perms = o.permissions?.length
      ? (o.permissions as QmRolePermission[])
          .map((p) => QM_ROLE_PERMISSIONS[p]?.label ?? p)
          .join(", ")
      : "no permissions";
    return `+ Role @${o.name} · ${perms}${o.color !== null ? ` · #${o.color.toString(16).padStart(6, "0")}` : ""}${o.hoist ? " · shown separately" : ""}`;
  });
}

/**
 * What a waiting draft points at that the server no longer has: categories, channels and
 * roles it was drafted against, named as they were. Drafts have no time limit, so this is
 * checked again before building: a draft from last week may place a channel in a category
 * someone deleted since. Things the same draft creates (refs) are always there.
 */
export function staleReferences(
  build: { plan: QmOperation[]; edits?: QmEdit[]; orders?: QmOrder[] },
  server: ServerSnapshot,
): string[] {
  const refs = new Set(build.plan.map((o) => o.ref));
  const categories = new Map(server.categories.map((c) => [c.id, c.name]));
  const roles = new Map(server.roles.map((r) => [r.id, r.name]));
  const channels = server.channels ? new Map(server.channels.map((c) => [c.id, c.name])) : null;
  const gone = new Set<string>();
  const category = (id: string | null | undefined) => {
    if (id && !refs.has(id) && !categories.has(id)) gone.add("a category");
  };
  const role = (id: string) => {
    if (!refs.has(id) && !roles.has(id)) gone.add("a role");
  };
  for (const op of build.plan) {
    category(op.parent);
    for (const id of [...op.privateTo, ...(op.posters ?? [])]) role(id);
  }
  for (const e of build.edits ?? []) {
    const known = e.kind.endsWith("_role")
      ? roles.has(e.id)
      : e.kind.endsWith("_category")
        ? categories.has(e.id)
        : // Channels are only known when the snapshot lists them.
          channels === null || channels.has(e.id);
    if (!known)
      gone.add(
        e.kind.endsWith("_role") ? `@${e.was}` : e.kind.endsWith("_category") ? e.was : `#${e.was}`,
      );
    category(e.parent);
    for (const id of [...(e.access?.privateTo ?? []), ...(e.access?.posters ?? [])]) role(id);
  }
  for (const o of build.orders ?? []) {
    if (o.scope === "channels") category(o.parent);
    o.items.forEach((id, i) => {
      if (refs.has(id)) return;
      const there =
        o.scope === "roles"
          ? roles.has(id)
          : o.scope === "categories"
            ? categories.has(id)
            : channels === null || channels.has(id);
      if (!there) gone.add(o.names[i] ?? "something it moves");
    });
  }
  return [...gone];
}

/** Undo order: channels first, then categories (once empty), then roles. Settings are undone apart. */
export function rollbackOrder(created: QmCreated[]) {
  const rank = { channel: 0, category: 1, role: 2 } as const;
  return created
    .filter((c): c is QmCreated & { kind: keyof typeof rank } => c.kind in rank)
    .sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Lines for the preview of a plan's settings: "~ Automod · Scam links: Off → On". */
export function describeSettings(
  changes: QmSettingChange[],
  ops: QmOperation[],
  server: ServerSnapshot,
  channelName: (id: string) => string | undefined,
) {
  const made = new Map(ops.map((o) => [o.ref, o]));
  const roles = new Map(server.roles.map((r) => [r.id, r.name]));
  const name = (v: string) => {
    const op = made.get(v);
    if (op)
      return op.kind === "create_role"
        ? `@${op.name}`
        : op.kind === "create_category"
          ? op.name
          : `#${op.name}`;
    const role = roles.get(v);
    if (role) return `@${role}`;
    const channel = channelName(v);
    return channel ? `#${channel}` : "a deleted channel";
  };
  return changes.map((c) => {
    const from = qmSettingValueText(c.module, c.field, c.from, name);
    const to = qmSettingValueText(c.module, c.field, c.to, name);
    return `~ ${qmSettingLabel(c.module, c.field)}: ${from ? `${from} → ${to}` : to}`;
  });
}
