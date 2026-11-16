"use client";

import { type DashboardRole, MANAGER_REQUEST_KINDS } from "@garrison/db/cards";
import { useEffect } from "react";

/**
 * Shows someone with shared access what they can't do, by disabling it. The server already
 * refuses it (lib/session); this keeps the page honest instead of letting a click bounce.
 *
 * - viewer: every control of every form that changes something (POST), and any field joined
 *   to one by form="…" (a header switch). Searches and filters (GET) keep working.
 * - editor: the forms only managers may send: a request for a manager-only kind (moderation,
 *   lockdown, backups, templates, applying a build, seasons) or a form marked
 *   data-need="manager" (the plan, appeals, who has access).
 */
export function AccessGuard({ role }: { role: DashboardRole }) {
  useEffect(() => {
    if (role === "manager") return;
    const main = document.getElementById("content");
    if (!main) return;

    const locked = (form: HTMLFormElement) => {
      if (form.method.toLowerCase() !== "post") return false;
      if (role === "viewer") return true;
      if (form.dataset.need === "manager") return true;
      const kind = form.querySelector<HTMLInputElement>('input[name="kind"]')?.value;
      return Boolean(kind && MANAGER_REQUEST_KINDS.has(kind));
    };
    const why =
      role === "viewer"
        ? "You can view this server's dashboard, not change it."
        : "Needs Manage Server in Discord.";

    const lockAll = () => {
      for (const form of main.querySelectorAll("form")) {
        if (!locked(form)) continue;
        form.dataset.locked = "";
        for (const el of form.elements) {
          if (
            (el instanceof HTMLInputElement && el.type !== "hidden") ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLButtonElement
          ) {
            if (!el.disabled) el.disabled = true;
            if (el instanceof HTMLButtonElement && !el.title) el.title = why;
          }
        }
      }
    };

    lockAll();
    // Tiles open, editors render, pages change: keep up with what appears.
    const watch = new MutationObserver(() => lockAll());
    watch.observe(main, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    // A locked form never sends, even from a key press in a field.
    const stop = (e: Event) => {
      const form = e.target instanceof HTMLFormElement ? e.target : null;
      if (form && locked(form)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    main.addEventListener("submit", stop, true);
    return () => {
      watch.disconnect();
      main.removeEventListener("submit", stop, true);
    };
  }, [role]);
  return null;
}
