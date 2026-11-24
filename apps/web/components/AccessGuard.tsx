"use client";

import {
  type AccessSwitch,
  type DashboardRole,
  MANAGER_REQUEST_KINDS,
  switchFor,
} from "@garrison/db/cards";
import { usePathname } from "next/navigation";
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
 * - an access group: per area. Where it gives View, every change is locked as for a viewer;
 *   where it gives Edit, manager-only requests stay locked unless the group has that switch.
 */
export function AccessGuard({
  role,
  areas = null,
  switches = [],
}: {
  role: DashboardRole;
  /** Their access per area, or null when a Viewer or Editor grant covers every area alike. */
  areas?: Record<string, "view" | "edit"> | null;
  switches?: AccessSwitch[];
}) {
  const pathname = usePathname();
  // /servers/<id>/<area>/…: the area this page belongs to.
  const area = pathname.split("/")[3] ?? "";
  const canEdit = areas ? areas[area] === "edit" : role === "editor";
  const switchKey = switches.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: switchKey stands for switches
  useEffect(() => {
    if (role === "manager") return;
    const main = document.getElementById("content");
    if (!main) return;

    const locked = (form: HTMLFormElement) => {
      if (form.method.toLowerCase() !== "post") return false;
      if (!canEdit) return true;
      if (form.dataset.need === "manager") return true;
      const kind = form.querySelector<HTMLInputElement>('input[name="kind"]')?.value;
      if (!kind || !MANAGER_REQUEST_KINDS.has(kind)) return false;
      const needs = switchFor(kind);
      return !needs || !switches.includes(needs);
    };
    const why = !canEdit
      ? "You can view this page, not change it."
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
  }, [role, canEdit, switchKey]);
  return null;
}
