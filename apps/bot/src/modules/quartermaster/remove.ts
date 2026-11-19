import type {
  QmBuild,
  QmEdit,
  QmOperation,
  QmOrder,
  QmPost,
  QmSettingChange,
  QmWrite,
} from "@garrison/db";

export interface RemoveTarget {
  /** A channel, category or role the draft makes. */
  ref?: string;
  /** A setting it changes: "module.field". */
  setting?: string;
  /** A post, by its place in the list. */
  post?: number;
  /** A new order, by its place in the list. */
  order?: number;
  /** A change to something that exists (or its deletion), by the item's id. */
  edit?: string;
  /** Text the plan writes, by its place in the list. */
  write?: number;
}

export interface Trimmed {
  plan: QmOperation[];
  settings: QmSettingChange[];
  posts: QmPost[];
  orders: QmOrder[];
  edits: QmEdit[];
  writes: QmWrite[];
  /** Names of everything taken out, the asked-for item first. */
  removed: string[];
}

/** Does a setting's new value point at one of these refs? */
const mentions = (value: unknown, refs: Set<string>): boolean =>
  typeof value === "string"
    ? refs.has(value)
    : Array.isArray(value)
      ? value.some((v) => mentions(v, refs))
      : false;

/** Where an order puts things, in words: "the new order of the roles". */
export function orderName(o: QmOrder) {
  return o.scope === "channels" ? "the new channel order" : `the new order of the ${o.scope}`;
}

/**
 * A draft without one item, and without whatever only made sense with it: the channels in
 * a removed category, channels private to nothing but removed roles, settings and posts that
 * point at removed items, and removed items in a new order (the order goes once fewer than
 * two are left, or its category goes). Other channels lose a removed role from their lists.
 * Only ever takes away, so what's left is as safe as the draft was.
 */
export function withoutItem(
  build: Pick<QmBuild, "plan" | "settings" | "posts"> &
    Partial<Pick<QmBuild, "orders" | "edits" | "writes">>,
  target: RemoveTarget,
): Trimmed {
  let settings = build.settings ?? [];
  let posts = build.posts ?? [];
  let orders = build.orders ?? [];
  let edits = build.edits ?? [];
  let writes = build.writes ?? [];
  const removed: string[] = [];
  if (target.write !== undefined) {
    const hit = writes[target.write];
    writes = writes.filter((_, i) => i !== target.write);
    if (hit) removed.push(hit.name);
    // A post of a message only this write made goes with it.
    if (hit?.isNew) posts = posts.filter((p) => p.itemId !== hit.messageId);
    return { plan: build.plan, settings, posts, orders, edits, writes, removed };
  }
  if (target.edit) {
    const hit = edits.find((e) => e.id === target.edit);
    edits = edits.filter((e) => e.id !== target.edit);
    if (hit)
      removed.push(
        hit.kind.startsWith("delete_") ? `deleting ${hit.was}` : `the change to ${hit.was}`,
      );
    return { plan: build.plan, settings, posts, orders, edits, writes, removed };
  }
  if (target.setting) {
    const hit = settings.find((c) => `${c.module}.${c.field}` === target.setting);
    settings = settings.filter((c) => `${c.module}.${c.field}` !== target.setting);
    if (hit) removed.push(`${hit.module} ${hit.field}`);
    return { plan: build.plan, settings, posts, orders, edits, writes, removed };
  }
  if (target.post !== undefined) {
    const hit = posts[target.post];
    posts = posts.filter((_, i) => i !== target.post);
    if (hit) removed.push(hit.name);
    return { plan: build.plan, settings, posts, orders, edits, writes, removed };
  }
  if (target.order !== undefined) {
    const hit = orders[target.order];
    orders = orders.filter((_, i) => i !== target.order);
    if (hit) removed.push(orderName(hit));
    return { plan: build.plan, settings, posts, orders, edits, writes, removed };
  }
  const gone = new Set<string>();
  if (target.ref && build.plan.some((o) => o.ref === target.ref)) gone.add(target.ref);
  // Follow what depends on what's gone until nothing more falls away.
  for (let grew = gone.size > 0; grew; ) {
    grew = false;
    for (const o of build.plan) {
      if (gone.has(o.ref)) continue;
      const orphaned = o.parent !== null && gone.has(o.parent);
      const privateToNothing = o.privateTo.length > 0 && o.privateTo.every((r) => gone.has(r));
      if (orphaned || privateToNothing) {
        gone.add(o.ref);
        grew = true;
      }
    }
  }
  const named = build.plan.filter((o) => gone.has(o.ref));
  // The asked-for item first, then what went with it.
  removed.push(
    ...named.filter((o) => o.ref === target.ref).map((o) => o.name),
    ...named.filter((o) => o.ref !== target.ref).map((o) => o.name),
  );
  const plan = build.plan
    .filter((o) => !gone.has(o.ref))
    .map((o) => ({
      ...o,
      privateTo: o.privateTo.filter((r) => !gone.has(r)),
      ...(o.posters ? { posters: o.posters.filter((r) => !gone.has(r)) } : {}),
    }));
  settings = settings.filter((c) => !mentions(c.to, gone));
  posts = posts.filter((p) => !gone.has(p.channel));
  orders = orders.flatMap((o) => {
    if (o.parent && gone.has(o.parent)) return [];
    const keep = o.items
      .map((id, i) => [id, o.names[i] ?? id] as const)
      .filter(([id]) => !gone.has(id));
    if (keep.length === o.items.length) return [o];
    return keep.length < 2
      ? []
      : [{ ...o, items: keep.map(([id]) => id), names: keep.map(([, n]) => n) }];
  });
  // A change to something that exists can't lean on what's gone: a move into a removed
  // category goes, and removed roles leave its access lists.
  edits = edits.flatMap((e) => {
    if (e.parent && gone.has(e.parent)) {
      const { parent: _, ...rest } = e;
      return Object.keys(rest).some((k) => !["kind", "id", "was", "by"].includes(k)) ? [rest] : [];
    }
    if (!e.access) return [e];
    const strip = (l: string[]) => l.filter((r) => !gone.has(r));
    return [
      {
        ...e,
        access: {
          ...e.access,
          privateTo: strip(e.access.privateTo),
          posters: strip(e.access.posters),
        },
      },
    ];
  });
  return { plan, settings, posts, orders, edits, writes, removed };
}
