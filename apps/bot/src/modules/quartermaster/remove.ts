import type { QmBuild, QmOperation, QmOrder, QmPost, QmSettingChange } from "@garrison/db";

export interface RemoveTarget {
  /** A channel, category or role the draft makes. */
  ref?: string;
  /** A setting it changes: "module.field". */
  setting?: string;
  /** A post, by its place in the list. */
  post?: number;
  /** A new order, by its place in the list. */
  order?: number;
}

export interface Trimmed {
  plan: QmOperation[];
  settings: QmSettingChange[];
  posts: QmPost[];
  orders: QmOrder[];
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
  build: Pick<QmBuild, "plan" | "settings" | "posts"> & Partial<Pick<QmBuild, "orders">>,
  target: RemoveTarget,
): Trimmed {
  let settings = build.settings ?? [];
  let posts = build.posts ?? [];
  let orders = build.orders ?? [];
  const removed: string[] = [];
  if (target.setting) {
    const hit = settings.find((c) => `${c.module}.${c.field}` === target.setting);
    settings = settings.filter((c) => `${c.module}.${c.field}` !== target.setting);
    if (hit) removed.push(`${hit.module} ${hit.field}`);
    return { plan: build.plan, settings, posts, orders, removed };
  }
  if (target.post !== undefined) {
    const hit = posts[target.post];
    posts = posts.filter((_, i) => i !== target.post);
    if (hit) removed.push(hit.name);
    return { plan: build.plan, settings, posts, orders, removed };
  }
  if (target.order !== undefined) {
    const hit = orders[target.order];
    orders = orders.filter((_, i) => i !== target.order);
    if (hit) removed.push(orderName(hit));
    return { plan: build.plan, settings, posts, orders, removed };
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
  return { plan, settings, posts, orders, removed };
}
