"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

/**
 * Page tabs (docs/LAYOUT_PROPOSAL.md §2): a module page with several jobs shows one at a time.
 * Every tab is rendered, so a module's switch and its settings form are always on the page;
 * the tab bar only changes which one shows. Each tab has its own address (?tab=automod; the
 * first tab is the plain address), switching happens in place without a round trip, and a
 * link to a section on another tab (#lockdown, a search result) opens that tab.
 */
export interface TabDef {
  id: string;
  label: string;
  /** A count beside the label: "Appeals 2". */
  count?: number;
  /** Something on that tab needs you: a caution mark beside the label. */
  blocked?: boolean;
}

function useCurrentTab(ids: readonly string[]) {
  const params = useSearchParams();
  const asked = params.get("tab");
  return asked && ids.includes(asked) ? asked : ids[0];
}

function hrefFor(pathname: string, params: URLSearchParams, ids: readonly string[], id: string) {
  const next = new URLSearchParams(params);
  if (id === ids[0]) next.delete("tab");
  else next.set("tab", id);
  // A finished action's flash belongs to the view it came from.
  next.delete("ok");
  next.delete("error");
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function PageTabs({ tabs, label }: { tabs: TabDef[]; label: string }) {
  const ids = tabs.map((t) => t.id);
  const current = useCurrentTab(ids);
  const pathname = usePathname();
  const params = useSearchParams();
  // A link to a section that lives on another tab opens that tab, then scrolls to it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ids stand for tabs
  useEffect(() => {
    const open = () => {
      const target = decodeURIComponent(window.location.hash.slice(1));
      if (!target) return;
      const el = document.getElementById(target);
      const tab = el?.closest<HTMLElement>("[data-tab-panel]")?.dataset.tabPanel;
      if (!el || !tab) return;
      const here = new URLSearchParams(window.location.search).get("tab") ?? ids[0];
      if (tab !== here) {
        const url = hrefFor(
          window.location.pathname,
          new URLSearchParams(window.location.search),
          ids,
          tab,
        );
        window.history.replaceState(null, "", `${url}${window.location.hash}`);
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => el.scrollIntoView({ block: "start" })),
      );
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [ids.join(",")]);

  return (
    <nav className="page-tabs" aria-label={label}>
      {tabs.map((t) => (
        <a
          key={t.id}
          className="page-tab"
          href={hrefFor(pathname, params, ids, t.id)}
          aria-current={t.id === current ? "page" : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.history.pushState(null, "", hrefFor(pathname, params, ids, t.id));
          }}
        >
          {t.label}
          {t.count ? <span className="page-tab__count">{t.count}</span> : null}
          {t.blocked ? (
            <span className="page-tab__warn" title="Needs you">
              <span className="sr-only">, needs you</span>
            </span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}

/** One tab's content; `tabs` is every tab's id in order, the first being the default. */
export function TabPanel({
  id,
  tabs,
  className,
  children,
}: {
  id: string;
  tabs: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const current = useCurrentTab(tabs);
  return (
    <div data-tab-panel={id} className={className} hidden={current !== id}>
      {children}
    </div>
  );
}

const MARK_WORDS: Record<string, string> = {
  idle: "Auto-saved",
  saving: "Saving",
  saved: "Saved",
  error: "Not saved",
  held: "Not saved yet",
};

/**
 * "On this page" (Setup template, 1280px and up): the tab's panels, each a jump link with its
 * save state, kept current as panels save.
 */
export function SectionIndex() {
  const [items, setItems] = useState<{ id: string; title: string; mark: string }[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!host) return;
    const panels = host.parentElement?.querySelector<HTMLElement>(".setup__panels");
    if (!panels) return;
    const read = () =>
      setItems(
        [
          ...panels.querySelectorAll<HTMLElement>(
            ":scope > section[id], :scope > div > section[id]",
          ),
        ]
          .map((s) => {
            const title = s.querySelector(".card-title")?.textContent?.trim() ?? "";
            const mark =
              s.querySelector(".card-head .save-mark")?.className.match(/save-mark--(\w+)/)?.[1] ??
              "";
            return { id: s.id, title, mark };
          })
          .filter((i) => i.title),
      );
    read();
    const watch = new MutationObserver(read);
    watch.observe(panels, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => watch.disconnect();
  }, [host]);
  return (
    <nav className="setup__index" aria-label="On this page" ref={setHost}>
      {items.length ? <span className="setup__index-title">On this page</span> : null}
      {items.map((i) => (
        <a
          key={i.id}
          className="setup__index-item"
          href={`#${i.id}`}
          data-mark={i.mark || undefined}
        >
          <span className="setup__index-dot" aria-hidden="true" />
          <span className="setup__index-name">{i.title}</span>
          {i.mark ? <span className="sr-only">, {MARK_WORDS[i.mark] ?? i.mark}</span> : null}
        </a>
      ))}
    </nav>
  );
}
