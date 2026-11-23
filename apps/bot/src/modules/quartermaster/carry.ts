import type { DraftPlan } from "./planner.js";

type Op = DraftPlan["operations"][number];
type Edit = NonNullable<DraftPlan["edits"]>[number];
type Order = NonNullable<DraftPlan["order"]>[number];
type Setting = DraftPlan["settings"][number];
type Post = DraftPlan["posts"][number];
type Write = NonNullable<DraftPlan["writes"]>[number];

/** Every string inside a setting's value: the channels, roles and refs it may name. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) strings(v, out);
  return out;
}

/**
 * What an item points at, field by field (never its own name or text, so a channel called
 * "rules" isn't mistaken for the message with the ref "rules").
 */
const pointsAt = {
  op: (o: Op) => [o.parent ?? "", ...o.private_to, ...(o.posters ?? [])],
  edit: (e: Edit) => [
    e.id,
    e.parent ?? "",
    ...(e.access?.private_to ?? []),
    ...(e.access?.posters ?? []),
  ],
  order: (o: Order) => [o.parent ?? "", ...o.items],
  setting: (x: Setting) => strings(x.value),
  post: (x: Post) => [x.itemId, x.channel],
  write: (w: Write) => [
    ...(w.items ?? []).map((i) => i.role),
    ...(w.staffRoles ?? []),
    w.channel ?? "",
  ],
};

/**
 * One draft per person per server, built up message by message (since 2026-11-23). The model
 * revises a waiting draft by returning it whole, but a model can leave things out by mistake,
 * and then a new prompt would quietly replace earlier changes. So nothing of the waiting draft
 * goes unless the revision names it in `drop`: whatever the revision leaves out is carried
 * over as it was. The revision's own version of an item wins (same ref, same existing id, same
 * setting, same write), and anything that leans on a dropped item goes with it. The merged
 * draft is then checked whole, like any draft.
 */
export function carryOver(base: DraftPlan, next: DraftPlan): { plan: DraftPlan; kept: number } {
  const drop = new Set((next.drop ?? []).map((d) => d.trim()).filter(Boolean));
  // Refs and ids that are gone: what was dropped (by ref or id, never by name).
  const gone = new Set(drop);
  const leans = (targets: string[]) => targets.some((t) => t && gone.has(t));
  // Through the draft's own items: a dropped category takes its channels, and what they hold.
  for (let grew = true; grew; ) {
    grew = false;
    for (const op of base.operations)
      if (!gone.has(op.ref) && leans(pointsAt.op(op))) {
        gone.add(op.ref);
        grew = true;
      }
  }
  let kept = 0;
  const keep = <T>(
    list: T[],
    key: (x: T) => string,
    taken: Set<string>,
    targets: (x: T) => string[],
  ) =>
    list.filter((x) => {
      const k = key(x);
      if (taken.has(k) || drop.has(k) || gone.has(k) || leans(targets(x))) return false;
      kept++;
      return true;
    });

  const opKey = (o: Op) => o.ref;
  const sameNew = new Set(next.operations.map((o) => `${o.kind}:${o.name.toLowerCase()}`));
  const ops = keep(
    // The same new item under another ref is the revision's version of it, not a second one.
    base.operations.filter((o) => !sameNew.has(`${o.kind}:${o.name.toLowerCase()}`)),
    opKey,
    new Set(next.operations.map(opKey)),
    pointsAt.op,
  );
  const editKey = (e: Edit) => e.id;
  const edits = keep(
    base.edits ?? [],
    editKey,
    new Set((next.edits ?? []).map(editKey)),
    pointsAt.edit,
  );
  const orderKey = (o: Order) => `${o.scope}:${o.parent ?? ""}`;
  const order = keep(
    base.order ?? [],
    orderKey,
    new Set((next.order ?? []).map(orderKey)),
    pointsAt.order,
  );
  const settingKey = (x: Setting) => `${x.module}.${x.field}`;
  const settings = keep(
    base.settings,
    settingKey,
    new Set(next.settings.map(settingKey)),
    pointsAt.setting,
  );
  const postKey = (x: Post) => `${x.kind}:${x.itemId}:${x.channel}`;
  const posts = keep(base.posts, postKey, new Set(next.posts.map(postKey)), pointsAt.post);
  const writeKey = (w: Write) => w.messageId || w.target;
  const writes = keep(
    base.writes ?? [],
    writeKey,
    new Set((next.writes ?? []).map(writeKey)),
    pointsAt.write,
  );

  return {
    kept,
    plan: {
      summary: next.summary || base.summary,
      notes: next.notes || base.notes,
      // Earlier changes first, in the order they were made, then what this message adds.
      operations: [...ops, ...next.operations],
      edits: [...edits, ...(next.edits ?? [])],
      order: [...order, ...(next.order ?? [])],
      settings: [...settings, ...next.settings],
      posts: [...posts, ...next.posts],
      writes: [...writes, ...(next.writes ?? [])],
    },
  };
}

/** True when a merged draft has nothing left to build. */
export const draftIsEmpty = (p: DraftPlan) =>
  !p.operations.length &&
  !(p.edits ?? []).length &&
  !(p.order ?? []).length &&
  !p.settings.length &&
  !p.posts.length &&
  !(p.writes ?? []).length;
