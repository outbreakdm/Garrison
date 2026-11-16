"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AutoResult } from "@/lib/autosave";
import { toast } from "./Toaster";

type Action = (form: FormData) => Promise<AutoResult>;
type Mark = "idle" | "saving" | "saved" | "error" | "held";

const SIGNAL = "garrison:save";

/**
 * For editors whose fields are React state (a card editor, rows added and removed with
 * buttons): call with the editor's value and attach the ref to an element inside the panel.
 * Each change after the first render tells the panel to save, after `delay` ms (typing
 * still waits for its own pause). To stop a save that can't go through yet (no channel
 * picked, Pro fields on Free), put data-hold="<why>" on any element inside the panel.
 */
export function useSaveSignal<T extends HTMLElement>(value: string, delay = 600) {
  const ref = useRef<T>(null);
  // Compared with the last value, not "skip the first run": effects can run twice on mount.
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    ref.current?.dispatchEvent(
      new CustomEvent(SIGNAL, { bubbles: true, detail: { delay, value } }),
    );
  }, [value, delay]);
  return ref;
}

/**
 * Switches, picks and selects save at once. Typing waits for a pause: short for a number,
 * longer for words, so a sentence isn't saved (and put in Settings history) word by word.
 * A field marked data-commit (a blocked word) saves only when it's left or Enter is pressed.
 */
const NUMBER_MS = 800;
const WORDS_MS = 1500;
const SAVED_MS = 2200;

const NOT_TYPED = new Set(["checkbox", "radio", "hidden", "submit", "button", "file", "range"]);
function typingDelay(el: EventTarget | null): number | null {
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return null;
  if (el instanceof HTMLInputElement && NOT_TYPED.has(el.type)) return null;
  if (el.dataset.commit !== undefined) return null;
  return el instanceof HTMLInputElement && el.type === "number" ? NUMBER_MS : WORDS_MS;
}

/**
 * A settings panel that saves itself: open on the page, no Save button. Each change is
 * sent through the page's own action (same checks, same Settings history), the header
 * says "Saving…" then "Saved", and a toast offers Undo. Before scripts load it's a plain
 * form with a Save button, so it works either way.
 */
export function AutoSaveCard({
  id,
  title,
  action,
  undo,
  guildId,
  stamp,
  saveLabel,
  fields,
  aside,
  footer,
  bare = false,
  children,
}: {
  id: string;
  title: string;
  action: Action;
  undo: Action;
  guildId: string;
  /** When the settings last changed (ms). After an Undo, a new stamp resets the fields. */
  stamp: number | string;
  /** The Save button's words, for before scripts load. */
  saveLabel: string;
  /**
   * The fields this panel owns, when its action's settings are split over several panels:
   * the action keeps every other field as it is. Left out, the form holds all of them.
   */
  fields?: string[];
  /**
   * The right of the header bar, after the save mark: a count, a tag, or the panel's own
   * switch. A field here joins the form with form="<id>-form".
   */
  aside?: ReactNode;
  /** Below the form, inside the panel: anything with forms of its own (post, restore). */
  footer?: ReactNode;
  /**
   * Inside something that's already a card (a tile that opened to edit): no card of its
   * own and no title, just a toolbar with `aside` and the save mark above the fields.
   */
  bare?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [live, setLive] = useState(false);
  const [mark, setMark] = useState<Mark>("idle");
  // Fields are uncontrolled. Undo changes them on the server; remount them once the page
  // arrives with the undone values (a new stamp), never while someone is typing.
  const [epoch, setEpoch] = useState(0);
  const [resetFrom, setResetFrom] = useState<number | string | null>(null);
  if (resetFrom !== null && stamp !== resetFrom) {
    setResetFrom(null);
    setEpoch(epoch + 1);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const latest = useRef({ action, undo, guildId, stamp });
  latest.current = { action, undo, guildId, stamp };

  const show = (m: Mark) => {
    if (settle.current) clearTimeout(settle.current);
    setMark(m);
    if (m === "saved") settle.current = setTimeout(() => setMark("idle"), SAVED_MS);
  };

  const runUndo = async (changeId: string) => {
    const data = new FormData();
    data.set("guildId", latest.current.guildId);
    data.set("changeId", changeId);
    data.set("_auto", "1");
    setResetFrom(latest.current.stamp);
    show("saving");
    let r: AutoResult;
    try {
      r = await latest.current.undo(data);
    } catch {
      r = { status: "error", message: "Couldn't reach Garrison, so nothing was undone." };
    }
    if (r.status === "saved") {
      show("saved");
      toast({ message: "Undone. It's back to how it was." });
    } else {
      setResetFrom(null);
      show(r.status === "error" ? "error" : "idle");
      if (r.status === "error") toast({ message: r.message, tone: "error" });
    }
  };

  const save = async (): Promise<void> => {
    const el = form.current;
    if (!el) return;
    // An editor inside says this can't save yet; it shows why, the mark says "Not saved yet".
    if (root.current?.querySelector("[data-hold]")) {
      show("held");
      return;
    }
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    show("saving");
    const data = new FormData(el);
    data.set("_auto", "1");
    let r: AutoResult;
    try {
      r = await latest.current.action(data);
    } catch {
      r = { status: "error", message: "Couldn't reach Garrison. Nothing was saved; try again." };
    }
    busy.current = false;
    // Something changed while this was on its way: send the form as it is now instead.
    if (again.current) {
      again.current = false;
      return save();
    }
    if (r.status === "saved") {
      show("saved");
      const changeId = r.changeId;
      toast({
        message: r.message,
        action: changeId ? { label: "Undo", run: () => void runUndo(changeId) } : undefined,
      });
    } else if (r.status === "unchanged") {
      show("idle");
    } else {
      show("error");
      toast({ message: r.message, tone: "error" });
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Hears this panel's form wherever its fields are: inside it, in its header bar, or in the
  // page head (form="<id>-form").
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const schedule = (ms: number, typing = false, ifIdle = false) => {
      // A signal only starts a save when nothing is waiting: a switch flipped this instant
      // saves now, and typing keeps its own pause.
      if (ifIdle && timer.current) return;
      if (timer.current) clearTimeout(timer.current);
      el.dataset.pending = "";
      timer.current = setTimeout(() => {
        timer.current = null;
        // Mid-typing ("3" on the way to "30"): a value the field itself rejects waits for
        // the field to be left, then the server says what's wrong.
        if (typing && form.current && !form.current.checkValidity()) {
          delete el.dataset.pending;
          return;
        }
        void saveRef.current().finally(() => {
          if (!timer.current && !busy.current) delete el.dataset.pending;
        });
      }, ms);
    };
    // Only this panel's own form counts: a field inside it, or one joined by form="<id>-form"
    // (a header switch). Another form in the panel (Post now's channel) isn't a change.
    const mine = (t: EventTarget | null) => {
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLSelectElement ||
        t instanceof HTMLTextAreaElement
      )
        return t.form === form.current;
      return t instanceof Element && Boolean(form.current?.contains(t));
    };
    const onInput = (e: Event) => {
      if (!mine(e.target)) return;
      const ms = typingDelay(e.target);
      if (ms !== null) schedule(ms, true);
    };
    // A typed field commits on blur or Enter; everything else commits as it changes.
    const onChange = (e: Event) => {
      if (mine(e.target)) schedule(0);
    };
    const onSignal = (e: Event) => {
      const delay = (e as CustomEvent<{ delay?: number }>).detail?.delay ?? 600;
      schedule(delay, false, true);
    };
    // Leaving with a change still waiting: send it now, and ask before closing the tab.
    const onLeave = (e: BeforeUnloadEvent) => {
      if (timer.current || busy.current) e.preventDefault();
    };
    // On the document: a field joined by form="<id>-form" can sit anywhere on the page (the
    // module's switch in the page head); `mine` keeps out every other form's fields.
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    el.addEventListener(SIGNAL, onSignal);
    window.addEventListener("beforeunload", onLeave);
    setLive(true);
    return () => {
      document.removeEventListener("input", onInput);
      document.removeEventListener("change", onChange);
      el.removeEventListener(SIGNAL, onSignal);
      window.removeEventListener("beforeunload", onLeave);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void saveRef.current();
      }
      if (settle.current) clearTimeout(settle.current);
    };
  }, []);

  // The header bar sits outside the form: React puts the action's hidden inputs first
  // inside a form, and the bar must be the panel's first child.
  return (
    <section
      ref={root}
      id={id}
      className={bare ? "autosave autosave--bare" : "g-card autosave"}
      data-live={live ? "" : undefined}
    >
      {bare ? (
        <div className="autosave__bar">
          {aside ? (
            <span className="autosave__aside" key={epoch}>
              {aside}
            </span>
          ) : null}
          {live ? <SaveMark mark={mark} /> : null}
        </div>
      ) : (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          <span className="autosave__head">
            {live ? <SaveMark mark={mark} /> : null}
            {aside ? (
              <span className="autosave__aside" key={epoch}>
                {aside}
              </span>
            ) : null}
          </span>
        </div>
      )}
      <form
        ref={form}
        id={`${id}-form`}
        className="autosave__form"
        aria-label={title}
        action={action as unknown as (f: FormData) => void}
        onSubmit={(e) => {
          // Enter in a field: save now, in place.
          if (!live) return;
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          void save();
        }}
      >
        <input type="hidden" name="guildId" value={guildId} />
        {fields ? <input type="hidden" name="_fields" value={fields.join(",")} /> : null}
        <div className="autosave__body" key={epoch}>
          {children}
        </div>
        <div className="form-foot autosave__fallback">
          <button type="submit" className="g-btn g-btn--primary">
            {saveLabel}
          </button>
          <span className="g-help">
            Recorded in <a href={`/servers/${guildId}/settings#history`}>Settings history</a>, where
            it can be undone.
          </span>
        </div>
      </form>
      {footer}
    </section>
  );
}

const WORDS: Record<Mark, string> = {
  idle: "Auto-saved",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
  held: "Not saved yet",
};

function SaveMark({ mark }: { mark: Mark }) {
  return (
    <span className={`save-mark save-mark--${mark}`}>
      <span className="save-mark__icon" aria-hidden="true" />
      {WORDS[mark]}
    </span>
  );
}
