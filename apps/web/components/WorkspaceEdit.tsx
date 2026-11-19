"use client";

import type { QmEditPayload } from "@garrison/db";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { handEdit } from "@/app/servers/[guildId]/quartermaster/actions";
import { toast } from "./Toaster";

/**
 * Hand changes in the AI assistant's Your server panel. Each one is queued for the bot, which
 * puts it into the person's waiting draft (no AI, no supplies); the panel shows it at once,
 * then the page refreshes into the draft as the bot saved it.
 */

/** How long a change shown ahead of the bot waits before giving up on it. */
const SHOWN_MS = 30_000;

function Pencil() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M10.5 3 13 5.5 6 12.5H3.5V10Z" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * An item's name, renamed in place: the pencil (or Enter on it) turns it into a field, Enter
 * or leaving it saves, Escape keeps the name. Inside a category's summary, clicks don't fold it.
 */
export function RenameName({
  guildId,
  target,
  name,
  label,
  className = "sp-row__name",
}: {
  guildId: string;
  /** The item's id, or the ref of one the draft makes. */
  target: string;
  name: string;
  /** "Rename #general": the button's and the field's label. */
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [, start] = useTransition();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);
  // The server's name arrived (or the change never did): show what the server says.
  useEffect(() => {
    if (!shown) return;
    if (shown === name) setShown(null);
    const t = setTimeout(() => setShown(null), SHOWN_MS);
    return () => clearTimeout(t);
  }, [name, shown]);

  const save = (value: string) => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === name) return;
    setShown(next);
    start(async () => {
      const r = await handEdit(guildId, { change: "rename", target, name: next });
      if (!r.ok) {
        setShown(null);
        toast({ message: r.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  };

  if (editing)
    return (
      <input
        ref={field}
        className="g-input sp-rename"
        defaultValue={name}
        maxLength={100}
        aria-label={label}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            save(e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onKeyUp={(e) => e.preventDefault()}
        onBlur={(e) => save(e.currentTarget.value)}
      />
    );
  return (
    <>
      <span className={`${className}${shown ? " is-saving" : ""}`}>{shown ?? name}</span>
      <button
        type="button"
        className="sp-tool"
        aria-label={label}
        title="Rename"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Pencil />
      </button>
    </>
  );
}

/** One hand change as a button, like Keep on a change Discord overtook. */
export function HandButton({
  guildId,
  change,
  children,
}: {
  guildId: string;
  change: QmEditPayload;
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="g-btn g-btn--ghost g-btn--sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await handEdit(guildId, change);
          if (!r.ok) toast({ message: r.error, tone: "error" });
          else router.refresh();
        })
      }
    >
      {children}
    </button>
  );
}

/** A list's movable rows in the order they show (a pending order first, then the page's). */
function rows(list: Element, kind?: string) {
  return [...list.children]
    .filter(
      (c): c is HTMLElement =>
        c instanceof HTMLElement &&
        c.dataset.item !== undefined &&
        (!kind || c.dataset.kind === kind),
    )
    .map((n, i) => ({ n, at: n.style.order ? Number(n.style.order) : i }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.n);
}

/** Show a list in a new order ahead of the bot (CSS order, which the next render clears). */
function showOrder(list: Element, order: HTMLElement[]) {
  const all = rows(list);
  const moving = new Set(order);
  const slots = all.flatMap((n, i) => (moving.has(n) ? [i] : []));
  const after = [...all];
  slots.forEach((slot, i) => {
    after[slot] = order[i] as HTMLElement;
  });
  after.forEach((n, i) => {
    n.style.order = String(i);
  });
}

/**
 * Drag to reorder, and the Move up / Move down buttons, for every list inside: categories,
 * the channels in a category (text and voice each among their own), and roles. A channel
 * dropped on another category (its name, or any of its channels) moves there. Rows are marked
 * up by ServerPreview: a list is [data-list] (with data-parent), a row [data-item] (with
 * data-kind), a category's name [data-drop], and a row's buttons [data-move="up" | "down"].
 */
export function DragLists({
  guildId,
  version,
  children,
}: {
  guildId: string;
  /** Changes whenever the page's rows do, so an order shown ahead of the bot is cleared. */
  version: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!version) return;
    for (const n of root.current?.querySelectorAll<HTMLElement>("[data-item]") ?? []) {
      n.style.order = "";
      n.classList.remove("is-pending");
    }
  }, [version]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let dragged: HTMLElement | null = null;
    let over: HTMLElement | null = null;

    const send = async (change: QmEditPayload, undo: () => void) => {
      const r = await handEdit(guildId, change);
      if (!r.ok) {
        undo();
        toast({ message: r.error, tone: "error" });
        return;
      }
      router.refresh();
    };
    const mark = (n: HTMLElement | null, cls?: string) => {
      over?.classList.remove("drop-before", "drop-after", "drop-into");
      over = n;
      if (n && cls) n.classList.add(cls);
    };

    /** Put `row` at `index` among the rows of its own kind in its list, and save it. */
    const reorder = (row: HTMLElement, list: HTMLElement, index: number) => {
      const scope = list.dataset.list;
      if (scope === "loose") {
        toast({ message: "Channels outside a category keep Discord's order.", tone: "error" });
        return;
      }
      const kind = scope === "channels" ? row.dataset.kind : undefined;
      const before = rows(list, kind);
      const rest = before.filter((n) => n !== row);
      if (index < 0 || index > rest.length) return;
      const next = [...rest.slice(0, index), row, ...rest.slice(index)];
      if (next.every((n, i) => n === before[i]) || next.length < 2) return;
      const was = rows(list).map((n) => n.style.order);
      showOrder(list, next);
      void send(
        {
          change: "order",
          scope: scope as "categories" | "channels" | "roles",
          parent: list.dataset.parent || null,
          items: next.map((n) => n.dataset.item as string),
        },
        () =>
          rows(list).forEach((n, i) => {
            n.style.order = was[i] ?? "";
          }),
      );
    };

    /** Move a channel into another category's list (or out of any, "" ), and save it. */
    const move = (row: HTMLElement, parent: string) => {
      row.classList.add("is-pending");
      void send(
        { change: "move", target: row.dataset.item as string, parent: parent || null },
        () => row.classList.remove("is-pending"),
      );
    };

    const onDragStart = (e: DragEvent) => {
      const row = (e.target as Element | null)?.closest<HTMLElement>("[data-item]");
      if (!row || !el.contains(row)) return;
      dragged = row;
      row.classList.add("is-dragging");
      e.dataTransfer?.setData("text/plain", row.dataset.item ?? "");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    };
    const onDragOver = (e: DragEvent) => {
      if (!dragged) return;
      const t = e.target as Element | null;
      const fromList = dragged.parentElement?.closest<HTMLElement>("[data-list]");
      const isChannel = fromList?.dataset.list === "channels" || fromList?.dataset.list === "loose";
      // Onto a category's name: a channel moves into it.
      const drop = t?.closest<HTMLElement>("[data-drop]");
      if (drop && isChannel) {
        e.preventDefault();
        mark(drop, "drop-into");
        return;
      }
      const row = t?.closest<HTMLElement>("[data-item]");
      const list = row?.parentElement?.closest<HTMLElement>("[data-list]");
      if (!row || row === dragged || !list) return mark(null);
      const sameList = list === fromList;
      const channelLists =
        isChannel && (list.dataset.list === "channels" || list.dataset.list === "loose");
      if (!sameList && !channelLists) return mark(null);
      if (sameList && list.dataset.list === "channels" && row.dataset.kind !== dragged.dataset.kind)
        return mark(null);
      e.preventDefault();
      const box = row.getBoundingClientRect();
      mark(
        row,
        !sameList
          ? "drop-into"
          : e.clientY < box.top + box.height / 2
            ? "drop-before"
            : "drop-after",
      );
    };
    const onDrop = (e: DragEvent) => {
      if (!dragged || !over) return;
      e.preventDefault();
      const row = dragged;
      const target = over;
      const fromList = row.parentElement?.closest<HTMLElement>("[data-list]");
      if (target.dataset.drop !== undefined) {
        if ((fromList?.dataset.parent ?? "") !== target.dataset.drop)
          move(row, target.dataset.drop);
      } else {
        const list = target.parentElement?.closest<HTMLElement>("[data-list]");
        if (list && fromList && list !== fromList) move(row, list.dataset.parent ?? "");
        else if (list) {
          const kind = list.dataset.list === "channels" ? row.dataset.kind : undefined;
          const order = rows(list, kind).filter((n) => n !== row);
          const at = order.indexOf(target);
          reorder(row, list, target.classList.contains("drop-after") ? at + 1 : at);
        }
      }
      mark(null);
    };
    const onDragEnd = () => {
      dragged?.classList.remove("is-dragging");
      dragged = null;
      mark(null);
    };
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-move]");
      if (!btn || !el.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest<HTMLElement>("[data-item]");
      const list = row?.parentElement?.closest<HTMLElement>("[data-list]");
      if (!row || !list) return;
      const kind = list.dataset.list === "channels" ? row.dataset.kind : undefined;
      const at = rows(list, kind).indexOf(row);
      reorder(row, list, btn.dataset.move === "up" ? at - 1 : at + 1);
    };

    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    el.addEventListener("dragend", onDragEnd);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
      el.removeEventListener("dragend", onDragEnd);
      el.removeEventListener("click", onClick);
    };
  }, [guildId, router]);

  return (
    <div ref={root} className="sp-work">
      {children}
    </div>
  );
}
