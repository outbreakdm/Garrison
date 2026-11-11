"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Long enough for any save or request to answer; then the button frees itself regardless. */
const MAX_PENDING_MS = 6000;

function clear(form?: Element | null) {
  const forms = form ? [form] : document.querySelectorAll("form[data-pending]");
  for (const f of forms) {
    f.removeAttribute("data-pending");
    for (const b of f.querySelectorAll('[aria-busy="true"]')) b.removeAttribute("aria-busy");
  }
}

/**
 * Feedback for every form on the site without touching each one: the form being
 * sent gets data-pending and the pressed button aria-busy, which the stylesheet
 * draws as a scanning line and uses to stop a second press. Both clear when the
 * page answers (the URL changes) or after a few seconds.
 */
export function PendingForms() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const timers = new Map<Element, number>();
    // Invalid forms never fire submit, so only a send that really starts is marked.
    // React's form actions cancel the native submit and post it themselves: still a send.
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.target === "_blank") return;
      form.setAttribute("data-pending", "");
      (e.submitter ?? form.querySelector('[type="submit"]'))?.setAttribute("aria-busy", "true");
      window.clearTimeout(timers.get(form));
      timers.set(
        form,
        window.setTimeout(() => clear(form), MAX_PENDING_MS),
      );
    };
    const onShow = () => clear();
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onShow);
      for (const t of timers.values()) window.clearTimeout(t);
    };
  }, []);

  // A new URL means the page answered: saved, queued, or an error notice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the URL changes
  useEffect(() => clear(), [pathname, search]);

  return null;
}
