"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AutoResult } from "@/lib/autosave";
import { toast } from "./Toaster";

type Action = (form: FormData) => Promise<AutoResult>;
type Mark = "idle" | "saving" | "saved" | "error";

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

  // Listens on the whole panel, so a switch in the header bar (form="<id>-form") counts.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const schedule = (ms: number, typing = false) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        // Mid-typing ("3" on the way to "30"): a value the field itself rejects waits for
        // the field to be left, then the server says what's wrong.
        if (typing && form.current && !form.current.checkValidity()) return;
        void saveRef.current();
      }, ms);
    };
    const onInput = (e: Event) => {
      const ms = typingDelay(e.target);
      if (ms !== null) schedule(ms, true);
    };
    // A typed field commits on blur or Enter; everything else commits as it changes.
    const onChange = () => schedule(0);
    // Leaving with a change still waiting: send it now, and ask before closing the tab.
    const onLeave = (e: BeforeUnloadEvent) => {
      if (timer.current || busy.current) e.preventDefault();
    };
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    window.addEventListener("beforeunload", onLeave);
    setLive(true);
    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
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
    <section ref={root} id={id} className="g-card autosave" data-live={live ? "" : undefined}>
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
};

function SaveMark({ mark }: { mark: Mark }) {
  return (
    <span className={`save-mark save-mark--${mark}`}>
      <span className="save-mark__icon" aria-hidden="true" />
      {WORDS[mark]}
    </span>
  );
}
