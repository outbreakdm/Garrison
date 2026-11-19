import {
  afterRows,
  detailId,
  type Moved,
  type ServerPreview as Preview,
  type PreviewChannel,
} from "@/lib/qm-preview";
import { DragLists, RenameName } from "./WorkspaceEdit";

/** A row's classes: new, moved (its new place) / was (its old place, shown in Now), deleted. */
const rowClass = (base: string, isNew: boolean, moved?: Moved, gone?: boolean) =>
  [
    base,
    isNew ? "is-new" : "",
    moved === "to" ? "is-moved" : "",
    moved === "from" ? "is-was" : "",
    gone ? "is-gone" : "",
  ]
    .filter(Boolean)
    .join(" ");

/** The tag on a row: New, Moved, Renamed or Deleted, for what the plan does to it. */
function Tag({
  isNew,
  moved,
  was,
  gone,
}: {
  isNew: boolean;
  moved?: Moved;
  was?: string;
  gone?: boolean;
}) {
  if (isNew) return <span className="sp-new">New</span>;
  if (gone) return <span className="sp-new sp-new--gone sp-after">Deleted</span>;
  if (moved === "to") return <span className="sp-new sp-new--moved">Moved</span>;
  if (was && moved !== "from")
    return <span className="sp-new sp-new--moved sp-after">Renamed</span>;
  return null;
}

/** In the plan panel each row opens its details (a :target section the panel shows). */
function Open({ id, name }: { id: string; name: string }) {
  return (
    <a className="sp-row__open" href={`#${detailId(id)}`} draggable={false}>
      <span className="sr-only">Details for {name}</span>
    </a>
  );
}

/**
 * Hand changes in the Your server panel: the server's id, a key for the page's rows (so an
 * order shown ahead of the bot clears when they change), and roles Garrison can't change,
 * with why.
 */
export interface PreviewEdit {
  guildId: string;
  version: string;
  locked: Record<string, string>;
}

/** What a row's key is in a hand change: an id, or the ref of an item the draft makes. */
const target = (key: string) => (key.startsWith("new:") ? key.slice(4) : key);

/** A row's name: renamed in place when it can be, and its old name for the Now view. */
function Name({
  edit,
  row,
  label,
  className,
}: {
  edit?: PreviewEdit;
  row: { key: string; name: string; was?: string; gone?: boolean; moved?: Moved };
  label: string;
  className: string;
}) {
  const now =
    row.was && row.moved !== "from" ? (
      <span className={`${className} sp-before`}>{row.was}</span>
    ) : null;
  const shown = row.moved === "from" && row.was ? row.was : row.name;
  if (!edit || row.gone || row.moved === "from")
    return (
      <>
        <span className={`${className}${now ? " sp-after" : ""}`}>{shown}</span>
        {now}
      </>
    );
  return (
    <>
      <span className="sp-after sp-edit">
        <RenameName
          guildId={edit.guildId}
          target={target(row.key)}
          name={row.name}
          label={label}
          className={className}
        />
      </span>
      {now}
    </>
  );
}

/** Move up / Move down, for keyboards and touch (DragLists does the moving). */
function MoveButtons({ name }: { name: string }) {
  return (
    <span className="sp-tools sp-after">
      <button type="button" className="sp-tool" data-move="up" aria-label={`Move ${name} up`}>
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="M4 10 8 6l4 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" className="sp-tool" data-move="down" aria-label={`Move ${name} down`}>
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
}

/** Rows that can be dragged and moved: in their new place, and not being deleted. */
const handy = (edit: PreviewEdit | undefined, row: { moved?: Moved; gone?: boolean }) =>
  Boolean(edit) && row.moved !== "from" && !row.gone;

function Glyph({ kind, locked }: { kind: PreviewChannel["kind"]; locked: boolean }) {
  return (
    <span className="sp-glyph" aria-hidden="true">
      {kind === "voice" ? (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="M2.5 6v4h2.6L8.5 13V3L5.1 6H2.5Z" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M11 5.5a3.5 3.5 0 0 1 0 5" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ) : (
        "#"
      )}
      {locked ? (
        <svg
          className="sp-lock"
          viewBox="0 0 16 16"
          width="9"
          height="9"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7h1Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
        </svg>
      ) : null}
    </span>
  );
}

function Channel({
  c,
  linked,
  edit,
  loose = false,
}: {
  c: PreviewChannel;
  linked?: boolean;
  edit?: PreviewEdit;
  loose?: boolean;
}) {
  const what = `${c.kind === "voice" ? "Voice channel" : "Channel"}${c.locked ? ", private" : ""}`;
  const can = handy(edit, c);
  const label = `${c.kind === "voice" ? "" : "#"}${c.name}`;
  return (
    <li
      className={rowClass("sp-row", c.isNew, c.moved, c.gone)}
      {...(can
        ? {
            "data-item": target(c.key),
            "data-kind": c.kind === "voice" ? "voice" : "text",
            draggable: true,
          }
        : {})}
    >
      <Glyph kind={c.kind} locked={c.locked} />
      <span className="sp-row__main">
        <span className="sr-only">{what}: </span>
        <Name edit={edit} row={c} label={`Rename ${label}`} className="sp-row__name" />
        {c.details.length ? <span className="sp-row__detail">{c.details.join(" · ")}</span> : null}
      </span>
      <Tag isNew={c.isNew} moved={c.moved} was={c.was} gone={c.gone} />
      {can && !loose ? <MoveButtons name={label} /> : null}
      {linked && c.moved !== "from" ? <Open id={c.key} name={c.name} /> : null}
    </li>
  );
}

/**
 * The server drawn the way Discord lists it: categories, channels and roles. With a plan, its
 * additions are slotted in and marked, its edits shown in place, and a switch flips between
 * the server now and the server with the changes; the switch is two radio buttons and CSS, so
 * it works before any script loads. With `edit` (the AI assistant's Your server panel), names
 * rename in place and lists reorder by dragging or with Move up / Move down.
 */
export function ServerPreview({
  name,
  preview,
  planned,
  linked = false,
  edit,
}: {
  name: string;
  preview: Preview;
  /** A plan is waiting: mark its additions and offer the now / with changes switch. */
  planned: boolean;
  /** Rows open their details (the AI assistant's plan panel). */
  linked?: boolean;
  /** Hand changes: rename, drag and move (the AI assistant's Your server panel). */
  edit?: PreviewEdit;
}) {
  const total =
    preview.loose.length +
    afterRows(preview.categories).reduce((n, c) => n + afterRows(c.channels).length, 0);
  // With a plan, untouched categories fold away so the changes are what you see.
  const openAll = !planned && total <= 60;
  const body = (
    <div className="sp__body">
      <div className="sp__pane">
        <div className="g-label sp__title">Channels</div>
        {preview.loose.length || edit ? (
          <ul className="sp-list" data-list="loose" data-parent="">
            {preview.loose.map((c) => (
              <Channel c={c} key={`${c.moved ?? ""}${c.key}`} linked={linked} edit={edit} loose />
            ))}
          </ul>
        ) : null}
        <div className="sp-cats" data-list="categories" data-parent="">
          {preview.categories.map((cat) => {
            const can = handy(edit, cat);
            return (
              <details
                className={rowClass("sp-cat", cat.isNew, cat.moved, cat.gone)}
                key={`${cat.moved ?? ""}${cat.key}`}
                open={openAll || cat.touched}
                {...(can ? { "data-item": target(cat.key) } : {})}
              >
                <summary
                  {...(can ? { draggable: true, "data-drop": target(cat.key) } : {})}
                  aria-label={
                    cat.was && cat.moved !== "from"
                      ? `${cat.name}, renamed from ${cat.was}`
                      : undefined
                  }
                >
                  <Name
                    edit={edit}
                    row={cat}
                    label={`Rename the ${cat.name} category`}
                    className="sp-cat__name"
                  />
                  {cat.isNew || cat.moved === "to" || cat.was || cat.gone ? (
                    <Tag isNew={cat.isNew} moved={cat.moved} was={cat.was} gone={cat.gone} />
                  ) : (
                    <span className="sp-cat__count">
                      {cat.channels.filter((c) => !c.isNew && c.moved !== "to").length}
                    </span>
                  )}
                  {can ? <MoveButtons name={`the ${cat.name} category`} /> : null}
                </summary>
                {cat.channels.length || edit ? (
                  <ul className="sp-list" data-list="channels" data-parent={target(cat.key)}>
                    {cat.channels.map((c) => (
                      <Channel c={c} key={`${c.moved ?? ""}${c.key}`} linked={linked} edit={edit} />
                    ))}
                  </ul>
                ) : null}
                {cat.channels.length ? null : <p className="sp-empty">Empty</p>}
              </details>
            );
          })}
        </div>
        {total === 0 && preview.categories.length === 0 ? (
          <p className="sp-empty">Garrison can't see any channels.</p>
        ) : null}
      </div>
      <div className="sp__pane sp__pane--roles">
        <div className="g-label sp__title">Roles</div>
        <ul className="sp-list" data-list="roles" data-parent="">
          {preview.roles.map((r) => {
            const why = edit?.locked[r.key];
            const can = handy(edit, r) && !why;
            return (
              <li
                className={rowClass("sp-row", r.isNew, r.moved, r.gone)}
                key={`${r.moved ?? ""}${r.key}`}
                title={why}
                {...(can
                  ? { "data-item": target(r.key), "data-kind": "role", draggable: true }
                  : {})}
              >
                <svg
                  className="sp-dot"
                  viewBox="0 0 10 10"
                  width="10"
                  height="10"
                  aria-hidden="true"
                >
                  {/* A fill attribute, not a style: the page's CSP allows no inline styles. */}
                  {r.color ? (
                    <circle
                      cx="5"
                      cy="5"
                      r="5"
                      fill={`#${r.color.toString(16).padStart(6, "0")}`}
                    />
                  ) : (
                    <circle
                      cx="5"
                      cy="5"
                      r="4.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  )}
                </svg>
                <span className="sp-row__main">
                  <Name
                    edit={can ? edit : undefined}
                    row={r}
                    label={`Rename @${r.name}`}
                    className="sp-row__name"
                  />
                  {r.details.length ? (
                    <span className="sp-row__detail">{r.details.join(" · ")}</span>
                  ) : null}
                </span>
                <Tag isNew={r.isNew} moved={r.moved} was={r.was} gone={r.gone} />
                {can ? <MoveButtons name={`@${r.name}`} /> : null}
                {linked && r.moved !== "from" ? <Open id={r.key} name={r.name} /> : null}
              </li>
            );
          })}
          <li className="sp-row sp-row--quiet">
            <svg className="sp-dot" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="sp-row__main">
              <span className="sp-row__name">@everyone</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
  return (
    <section className={`sp ${planned ? "sp--planned" : ""}`} aria-label="Server preview">
      <header className="sp__bar">
        <span className="sp__server">
          <span className="sp__icon" aria-hidden="true">
            {(name.match(/[\p{L}\p{N}]/u)?.[0] ?? "G").toUpperCase()}
          </span>
          <span>
            <span className="sp__name">{name}</span>
            <span className="sp__meta">
              {total - preview.added.channels} channels ·{" "}
              {afterRows(preview.roles).filter((r) => !r.isNew).length} roles
            </span>
          </span>
        </span>
        {planned ? (
          <fieldset className="sp-switch">
            <legend className="sr-only">Show the server</legend>
            <label>
              <input type="radio" name="sp-view" value="after" defaultChecked />
              <span>With changes</span>
            </label>
            <label>
              <input type="radio" name="sp-view" value="before" />
              <span>Now</span>
            </label>
          </fieldset>
        ) : (
          <span className="g-badge">Live</span>
        )}
      </header>
      {edit ? (
        <DragLists guildId={edit.guildId} version={edit.version}>
          {body}
        </DragLists>
      ) : (
        body
      )}
      {edit ? (
        <p className="sp__hint">
          Use the pencil to rename, or drag to reorder. Changes wait in the draft until you apply
          them; making them uses no supplies.
        </p>
      ) : null}
    </section>
  );
}
