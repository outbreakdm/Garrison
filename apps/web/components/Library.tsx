import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A saved item on a library page (role menus, messages, stream alerts, ticket panels;
 * docs/LAYOUT_PROPOSAL.md §3). In the grid it's a tile that links to its editor; the editor
 * opens on a page of its own (`?edit=<id>`), full width with its preview and a way back,
 * instead of growing inside the grid. While one item is open the others aren't drawn, and
 * only the open item's editor is rendered at all.
 *
 * `summary` is the tile's face: its mark, name, facts and state. The editor page reuses it
 * as its header.
 */
export function LibraryItem({
  id,
  editing,
  href,
  back,
  backLabel,
  summary,
  children,
}: {
  id: string;
  /** The item being edited on this page, if any (an id that exists). */
  editing: string | null;
  href: string;
  back: string;
  backLabel: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  if (editing && editing !== id) return null;
  if (!editing) {
    return (
      <Link className="g-card panel item-tile" id={id} href={href}>
        <span className="panel__summary">{summary}</span>
      </Link>
    );
  }
  return (
    <section className="editor-page" id={id} aria-label="Editing">
      <Link className="editor-page__back" href={back}>
        <span className="editor-page__arrow" aria-hidden="true" />
        {backLabel}
      </Link>
      <div className="g-card panel editor-page__card">
        <div className="panel__summary">{summary}</div>
        <div className="panel__body">{children}</div>
      </div>
    </section>
  );
}
