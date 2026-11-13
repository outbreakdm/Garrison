import Link from "next/link";
import type { ReactNode } from "react";

/**
 * What a list says when it has nothing yet: what will appear here, and the one
 * thing to do about it. A drawn mark on a tile in the page's color, not a painting,
 * so it reads at a glance in both themes and never fails to load.
 */

type Mark = "server" | "accounts" | "log" | "leaderboard" | "cases" | "groups" | "raids" | "inbox";

const MARKS: Record<Mark, ReactNode> = {
  // A shield with a plus: add Garrison to a server.
  server: (
    <>
      <path d="M12 3.5 5 6v5.2c0 4.1 2.9 7.6 7 9.3 4.1-1.7 7-5.2 7-9.3V6z" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  // Two linked plates: game accounts shared with the server.
  accounts: (
    <>
      <rect x="3.5" y="5" width="9" height="11" rx="1" />
      <rect x="11.5" y="8" width="9" height="11" rx="1" />
      <path d="M6 8.5h4M6 11h3M14 11.5h4M14 14h3" />
    </>
  ),
  // A ruled page: the event log.
  log: (
    <>
      <path d="M6 3.5h9l3.5 3.5v13.5H6z" />
      <path d="M15 3.5V7h3.5M9 11h6.5M9 14h6.5M9 17h4" />
    </>
  ),
  // Three podium steps: the XP leaderboard.
  leaderboard: (
    <>
      <path d="M3.5 20.5h17M9 20.5v-11h6v11M3.5 20.5v-6H9M15 20.5V13h5.5v7.5" />
      <path d="m12 4 .9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" />
    </>
  ),
  // A gavel over a block: moderation cases.
  cases: (
    <>
      <path d="m13.5 4.5 6 6M11 7l6 6M12.2 5.8l-3.4 3.4M16.8 10.4l-3.4 3.4" />
      <path d="M10.6 11.6 4 18.2l1.8 1.8 6.6-6.6" />
      <path d="M13 20.5h7.5" />
    </>
  ),
  // Seats in a row: a group to join.
  groups: (
    <>
      <circle cx="7" cy="9" r="2.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 18.5c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5M13 18.5c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
      <path d="M12 5.5v4M10 7.5h4" />
    </>
  ),
  // A calendar page: raids and events.
  raids: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="1" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M9 14.5l2 2 4-4" />
    </>
  ),
  // An open tray: nothing waiting.
  inbox: (
    <>
      <path d="M4 13.5 6.5 5h11l2.5 8.5v6H4z" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20" />
    </>
  ),
};

export interface EmptyAction {
  label: string;
  href: string;
}

export function EmptyState({
  mark,
  title,
  children,
  action,
  compact = false,
  headingLevel = 2,
}: {
  mark: Mark;
  title: string;
  children?: ReactNode;
  action?: EmptyAction;
  /** Inside a table or list card: tighter, no plate of its own. */
  compact?: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className={`empty${compact ? " empty--compact" : " g-card"}`}>
      <span className="empty__mark" aria-hidden="true">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {MARKS[mark]}
        </svg>
      </span>
      <div className="empty__text">
        <Heading className="empty__title">{title}</Heading>
        {children ? <div className="empty__body">{children}</div> : null}
        {action ? (
          action.href.startsWith("/") ? (
            <Link className="g-btn g-btn--secondary g-btn--sm empty__action" href={action.href}>
              {action.label}
            </Link>
          ) : (
            <a className="g-btn g-btn--secondary g-btn--sm empty__action" href={action.href}>
              {action.label}
            </a>
          )
        ) : null}
      </div>
    </div>
  );
}
