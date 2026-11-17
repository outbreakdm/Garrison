import type { ReactNode } from "react";
import { SectionIndex } from "./PageTabs";

/**
 * The page templates (docs/LAYOUT_PROPOSAL.md §3). Each tab or small page uses one:
 *
 * Activity: what's happening (cases, the queue, the board). The wide column is the live list;
 *   the side column holds quick tools and small facts. On phones the wide column comes first.
 * Setup: configuration. One column of panels, with "On this page" beside it from 1280px up.
 * Compact: a small module on one row, settings beside its live list.
 */
export function ActivityLayout({ main, side }: { main: ReactNode; side?: ReactNode }) {
  return (
    <div className={side ? "page-split" : "activity"}>
      <div className="page-split__main">{main}</div>
      {side ? <aside className="page-split__side">{side}</aside> : null}
    </div>
  );
}

export function SetupLayout({ children, index = true }: { children: ReactNode; index?: boolean }) {
  return (
    <div className={index ? "setup" : "setup setup--plain"}>
      <div className="setup__panels">{children}</div>
      {index ? <SectionIndex /> : null}
    </div>
  );
}

/**
 * Settings in the wide column (60%), the live list beside them (40%). On phones the live list
 * comes first when it has items, since that's what changes; with nothing in it, settings lead.
 */
export function CompactLayout({
  settings,
  live,
  liveFirst = false,
}: {
  settings: ReactNode;
  live?: ReactNode;
  liveFirst?: boolean;
}) {
  if (!live) return <div className="compact__settings">{settings}</div>;
  return (
    <div className={liveFirst ? "compact compact--live-first" : "compact"}>
      <div className="compact__settings">{settings}</div>
      <div className="compact__live">{live}</div>
    </div>
  );
}
