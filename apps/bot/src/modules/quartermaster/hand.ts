import type { QmEdit, QmEditPayload, QmOperation, QmOrder } from "@garrison/db";
import { displayName } from "./names.js";
import type { ServerSnapshot } from "./plan.js";

/**
 * Hand changes from the AI assistant's Your server panel: rename, move a channel to another
 * category, and put a list in a new order. No AI runs. Each change goes into the person's
 * waiting draft as a QmEdit or QmOrder marked `by: "admin"`, so it costs no supplies, shares
 * the draft's preview, Apply and Undo, and survives an AI redraft (keepHandChanges). Checked
 * here against the server as the bot sees it; the build checks everything again when applied.
 */

/** The most hand changes one draft carries, for Discord's rate limits. */
export const MAX_HAND_CHANGES = 50;
/** Discord's limit on channels in one category. */
const CATEGORY_LIMIT = 50;

export interface HandDraft {
  plan: QmOperation[];
  edits: QmEdit[];
  orders: QmOrder[];
}

export type HandResult = ({ ok: true; message: string } & HandDraft) | { ok: false; error: string };

const TEXTISH = new Set(["text", "announcement", "forum", "media"]);

/**
 * A text channel's name as Discord takes it: lowercase, no spaces, letters, numbers, - and _,
 * and emoji (many servers start names with one).
 */
export function handChannelName(raw: string) {
  const kept =
    raw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, "-")
      // Emoji may be joined (ZWJ) or carry a variation selector, so they're kept piece by piece.
      .match(/\p{L}|\p{N}|\p{Extended_Pictographic}|\u{200D}|\u{FE0F}|[_-]/gu)
      ?.join("") ?? "";
  return kept
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

type Found =
  | { at: "channel"; id: string; name: string; parent: string | null; textish: boolean }
  | { at: "category"; id: string; name: string }
  | { at: "role"; id: string; name: string; movable: boolean }
  | { at: "op"; op: QmOperation };

/** What `target` is: something in the server, or something the draft makes (by ref). */
function find(target: string, draft: HandDraft, server: ServerSnapshot): Found | null {
  const op = draft.plan.find((o) => o.ref === target);
  if (op) return { at: "op", op };
  const ch = server.channels?.find((c) => c.id === target);
  if (ch)
    return {
      at: "channel",
      id: ch.id,
      name: ch.name,
      parent: ch.parentId,
      textish: TEXTISH.has(ch.kind ?? "text"),
    };
  const cat = server.categories.find((c) => c.id === target);
  if (cat) return { at: "category", id: cat.id, name: cat.name };
  const role = server.roles.find((r) => r.id === target && r.id !== server.everyoneId);
  if (role) return { at: "role", id: role.id, name: role.name, movable: Boolean(role.movable) };
  return null;
}

const editKind = { channel: "edit_channel", category: "edit_category", role: "edit_role" } as const;

/** An edit that only says what it is changes nothing. */
const empty = (e: QmEdit) =>
  Object.entries(e).every(([k, v]) => ["kind", "id", "was", "by"].includes(k) || v === undefined);

/** Set (or with `undefined`, clear) one field of an existing item's edit, made by hand. */
function setField(
  edits: QmEdit[],
  item: { kind: QmEdit["kind"]; id: string; was: string },
  field: "name" | "parent",
  value: string | null | undefined,
): QmEdit[] {
  const at = edits.findIndex((e) => e.id === item.id && e.kind === item.kind);
  // Its name as it is now: touching an item again after a rename in Discord catches up.
  const base: QmEdit =
    at >= 0 ? { ...(edits[at] as QmEdit), was: item.was } : { ...item, by: "admin" };
  if (value === undefined) delete base[field];
  else (base as unknown as Record<string, unknown>)[field] = value;
  const rest = edits.filter((_, i) => i !== at);
  if (empty(base)) return rest;
  if (at < 0) return [...rest, base];
  const out = [...edits];
  out[at] = base;
  return out;
}

const handCount = (d: HandDraft) =>
  d.edits.filter((e) => e.by === "admin").length + d.orders.filter((o) => o.by === "admin").length;

const deleted = (d: HandDraft, id: string) =>
  d.edits.some((e) => e.id === id && e.kind.startsWith("delete_"));

/** Where a channel sits once the draft is built: its category id or ref, or null. */
function parentAfter(id: string, d: HandDraft, server: ServerSnapshot) {
  const op = d.plan.find((o) => o.ref === id);
  if (op) return op.parent;
  const moved = d.edits.find((e) => e.id === id && e.kind === "edit_channel" && "parent" in e);
  if (moved) return moved.parent ?? null;
  return server.channels?.find((c) => c.id === id)?.parentId ?? null;
}

/** Apply one hand change to a draft (empty when there's none), or say why it can't be done. */
export function applyHandChange(
  draft: HandDraft,
  change: QmEditPayload,
  server: ServerSnapshot,
): HandResult {
  const d: HandDraft = {
    plan: [...draft.plan],
    edits: [...draft.edits],
    orders: [...draft.orders],
  };
  const result = (message: string): HandResult =>
    handCount(d) > MAX_HAND_CHANGES
      ? {
          ok: false,
          error: `A draft holds ${MAX_HAND_CHANGES} changes made by hand. Apply this one first.`,
        }
      : { ok: true, message, ...d };

  if (change.change === "rename") {
    const it = find(change.target, d, server);
    if (!it) return { ok: false, error: "That isn't in the server or the draft anymore." };
    if (it.at !== "op" && deleted(d, it.id))
      return { ok: false, error: "This draft deletes that, so it can't be renamed." };
    if (it.at === "role" && !it.movable)
      return {
        ok: false,
        error: `Garrison can't rename @${it.name}: it has staff powers, belongs to a bot, or sits above Garrison's role. Rename it in Server Settings → Roles.`,
      };
    const textish =
      it.at === "op" ? it.op.kind === "create_text_channel" : it.at === "channel" && it.textish;
    const name = textish ? handChannelName(change.name) : displayName(change.name, 100);
    if (!name) return { ok: false, error: "That name is empty once cleaned up." };
    if (it.at === "op") {
      const at = d.plan.indexOf(it.op);
      d.plan[at] = { ...it.op, name };
      return result(`Renamed the new ${it.op.name} to ${name} in the draft.`);
    }
    d.edits = setField(
      d.edits,
      { kind: editKind[it.at], id: it.id, was: it.name },
      "name",
      name === it.name ? undefined : name,
    );
    return result(
      name === it.name
        ? `${it.name} keeps its name.`
        : `Renamed ${it.name} to ${name} in the draft.`,
    );
  }

  if (change.change === "move") {
    const it = find(change.target, d, server);
    const isChannel =
      it?.at === "channel" ||
      (it?.at === "op" &&
        (it.op.kind === "create_text_channel" || it.op.kind === "create_voice_channel"));
    if (!it || !isChannel) return { ok: false, error: "Only channels move between categories." };
    const id = it.at === "op" ? it.op.ref : (it as { id: string }).id;
    if (it.at !== "op" && deleted(d, id))
      return { ok: false, error: "This draft deletes that channel, so it can't move." };
    const to = change.parent;
    if (to !== null) {
      const cat = find(to, d, server);
      const ok = cat?.at === "category" || (cat?.at === "op" && cat.op.kind === "create_category");
      if (!ok || deleted(d, to))
        return { ok: false, error: "That category isn't in the server or the draft." };
      const filled = [
        ...(server.channels ?? []).map((c) => c.id),
        ...d.plan
          .filter((o) => o.kind !== "create_category" && o.kind !== "create_role")
          .map((o) => o.ref),
      ].filter((x) => x !== id && !deleted(d, x) && parentAfter(x, d, server) === to).length;
      if (filled >= CATEGORY_LIMIT)
        return { ok: false, error: `Discord allows ${CATEGORY_LIMIT} channels in a category.` };
    }
    const from = parentAfter(id, d, server);
    if (it.at === "op") {
      const at = d.plan.indexOf(it.op);
      d.plan[at] = { ...it.op, parent: to };
    } else {
      const now = server.channels?.find((c) => c.id === id)?.parentId ?? null;
      d.edits = setField(
        d.edits,
        { kind: "edit_channel", id, was: (it as { name: string }).name },
        "parent",
        to === now ? undefined : to,
      );
    }
    // An order of the category it left can't list it anymore.
    if (from !== to)
      d.orders = d.orders.flatMap((o) => {
        if (o.scope !== "channels" || o.parent !== from || !o.items.includes(id)) return [o];
        const keep = o.items.map((x, i) => [x, o.names[i] ?? x] as const).filter(([x]) => x !== id);
        return keep.length < 2
          ? []
          : [{ ...o, items: keep.map(([x]) => x), names: keep.map(([, n]) => n) }];
      });
    return result("Moved it in the draft.");
  }

  // A new order for one list.
  const { scope, parent } = change;
  const items = change.items;
  if (items.length < 2 || new Set(items).size !== items.length)
    return { ok: false, error: "An order needs two or more different items." };
  const names: string[] = [];
  for (const x of items) {
    const it = find(x, d, server);
    const fits =
      scope === "categories"
        ? it?.at === "category" || (it?.at === "op" && it.op.kind === "create_category")
        : scope === "roles"
          ? (it?.at === "role" && it.movable) || (it?.at === "op" && it.op.kind === "create_role")
          : (it?.at === "channel" ||
              (it?.at === "op" &&
                (it.op.kind === "create_text_channel" || it.op.kind === "create_voice_channel"))) &&
            parentAfter(x, d, server) === parent;
    if (!it || !fits || deleted(d, x))
      return {
        ok: false,
        error:
          scope === "roles"
            ? "Only roles below Garrison's own, without staff powers, can be put in a new order."
            : "That order lists something that isn't in that list anymore.",
      };
    names.push(it.at === "op" ? it.op.name : it.name);
  }
  if (scope === "channels" && parent === null)
    return { ok: false, error: "Channels outside a category keep Discord's order." };
  const order: QmOrder = {
    scope,
    parent: scope === "channels" ? parent : null,
    items,
    names,
    by: "admin",
  };
  const at = d.orders.findIndex((o) => o.scope === order.scope && o.parent === order.parent);
  if (at >= 0) d.orders[at] = order;
  else d.orders.push(order);
  return result(
    `Put the ${scope === "channels" ? "channels" : scope} in a new order in the draft.`,
  );
}

/**
 * An AI redraft of a draft that had hand changes keeps them: a hand rename or move wins over
 * the AI's for that field, a hand order replaces the AI's for that list, and the rest of the
 * AI's draft stays. Changes the redraft deletes or no longer allows are dropped.
 */
export function keepHandChanges(
  before: Pick<HandDraft, "edits" | "orders">,
  next: HandDraft,
): Pick<HandDraft, "edits" | "orders"> {
  // Refs the redraft still makes; an id is a Discord snowflake.
  const known = (x: string) => /^\d{17,20}$/.test(x) || next.plan.some((o) => o.ref === x);
  let edits = [...next.edits];
  for (const h of before.edits.filter((e) => e.by === "admin")) {
    if (edits.some((e) => e.id === h.id && e.kind.startsWith("delete_"))) continue;
    if (h.parent && !known(h.parent)) continue;
    const at = edits.findIndex((e) => e.id === h.id && e.kind === h.kind);
    if (at < 0) edits.push(h);
    else {
      const merged: QmEdit = { ...(edits[at] as QmEdit) };
      if (h.name !== undefined) merged.name = h.name;
      if ("parent" in h) merged.parent = h.parent;
      edits = edits.map((e, i) => (i === at ? merged : e));
    }
  }
  const gone = new Set(edits.filter((e) => e.kind.startsWith("delete_")).map((e) => e.id));
  const orders = [...next.orders];
  for (const h of before.orders.filter((o) => o.by === "admin")) {
    const stale = h.items.some((x) => gone.has(x) || !known(x));
    if (stale || (h.parent && (gone.has(h.parent) || !known(h.parent)))) continue;
    const at = orders.findIndex((o) => o.scope === h.scope && o.parent === h.parent);
    if (at >= 0) orders[at] = h;
    else orders.push(h);
  }
  return { edits, orders };
}
