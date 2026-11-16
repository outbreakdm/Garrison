import type { QmBuild, QmOperation, QmPost, QmSettingChange } from "@garrison/db";

export interface RemoveTarget {
  /** A channel, category or role the draft makes. */
  ref?: string;
  /** A setting it changes: "module.field". */
  setting?: string;
  /** A post, by its place in the list. */
  post?: number;
}

export interface Trimmed {
  plan: QmOperation[];
  settings: QmSettingChange[];
  posts: QmPost[];
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

/**
 * A draft without one item, and without whatever only made sense with it: the channels in
 * a removed category, channels private to nothing but removed roles, settings and posts that
 * point at removed items. Other channels lose a removed role from their lists. Only ever
 * takes away, so what's left is as safe as the draft was.
 */
export function withoutItem(
  build: Pick<QmBuild, "plan" | "settings" | "posts">,
  target: RemoveTarget,
): Trimmed {
  let settings = build.settings ?? [];
  let posts = build.posts ?? [];
  const removed: string[] = [];
  if (target.setting) {
    const hit = settings.find((c) => `${c.module}.${c.field}` === target.setting);
    settings = settings.filter((c) => `${c.module}.${c.field}` !== target.setting);
    if (hit) removed.push(`${hit.module} ${hit.field}`);
    return { plan: build.plan, settings, posts, removed };
  }
  if (target.post !== undefined) {
    const hit = posts[target.post];
    posts = posts.filter((_, i) => i !== target.post);
    if (hit) removed.push(hit.name);
    return { plan: build.plan, settings, posts, removed };
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
  return { plan, settings, posts, removed };
}
