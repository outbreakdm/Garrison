import {
  afterRows,
  detailId,
  type Moved,
  type ServerPreview as Preview,
  type PreviewChannel,
} from "@/lib/qm-preview";

/** A row's classes: new, or moved (its new place) / was (its old place, shown in Now). */
const rowClass = (base: string, isNew: boolean, moved?: Moved) =>
  [base, isNew ? "is-new" : "", moved === "to" ? "is-moved" : "", moved === "from" ? "is-was" : ""]
    .filter(Boolean)
    .join(" ");

/** The tag on a row: New, or Moved where a plan's order puts it. */
function Tag({ isNew, moved }: { isNew: boolean; moved?: Moved }) {
  if (isNew) return <span className="sp-new">New</span>;
  return moved === "to" ? <span className="sp-new sp-new--moved">Moved</span> : null;
}

/** In the plan panel each row opens its details (a :target section the panel shows). */
function Open({ id, name }: { id: string; name: string }) {
  return (
    <a className="sp-row__open" href={`#${detailId(id)}`}>
      <span className="sr-only">Details for {name}</span>
    </a>
  );
}

/**
 * The server drawn the way Discord lists it: categories, channels and roles.
 * With a plan, its additions are slotted in and marked, and a switch flips
 * between the server now and the server with the changes. The switch is two
 * radio buttons and CSS, so it works before any script loads.
 */

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

function Channel({ c, linked }: { c: PreviewChannel; linked?: boolean }) {
  const what = `${c.kind === "voice" ? "Voice channel" : "Channel"}${c.locked ? ", private" : ""}`;
  return (
    <li className={rowClass("sp-row", c.isNew, c.moved)}>
      <Glyph kind={c.kind} locked={c.locked} />
      <span className="sp-row__main">
        <span className="sp-row__name">
          <span className="sr-only">{what}: </span>
          {c.name}
        </span>
        {c.details.length ? <span className="sp-row__detail">{c.details.join(" · ")}</span> : null}
      </span>
      <Tag isNew={c.isNew} moved={c.moved} />
      {linked && c.moved !== "from" ? <Open id={c.key} name={c.name} /> : null}
    </li>
  );
}

export function ServerPreview({
  name,
  preview,
  planned,
  linked = false,
}: {
  name: string;
  preview: Preview;
  /** A plan is waiting: mark its additions and offer the now / with changes switch. */
  planned: boolean;
  /** Rows open their details (the AI assistant's plan panel). */
  linked?: boolean;
}) {
  const total =
    preview.loose.length +
    afterRows(preview.categories).reduce((n, c) => n + afterRows(c.channels).length, 0);
  // With a plan, untouched categories fold away so the changes are what you see.
  const openAll = !planned && total <= 60;
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
      <div className="sp__body">
        <div className="sp__pane">
          <div className="g-label sp__title">Channels</div>
          {preview.loose.length ? (
            <ul className="sp-list">
              {preview.loose.map((c) => (
                <Channel c={c} key={c.key} linked={linked} />
              ))}
            </ul>
          ) : null}
          {preview.categories.map((cat) => (
            <details
              className={rowClass("sp-cat", cat.isNew, cat.moved)}
              key={`${cat.moved ?? ""}${cat.key}`}
              open={openAll || cat.touched}
            >
              <summary>
                <span className="sp-cat__name">{cat.name}</span>
                {cat.isNew || cat.moved === "to" ? (
                  <Tag isNew={cat.isNew} moved={cat.moved} />
                ) : (
                  <span className="sp-cat__count">
                    {cat.channels.filter((c) => !c.isNew).length}
                  </span>
                )}
              </summary>
              {cat.channels.length ? (
                <ul className="sp-list">
                  {cat.channels.map((c) => (
                    <Channel c={c} key={`${c.moved ?? ""}${c.key}`} linked={linked} />
                  ))}
                </ul>
              ) : (
                <p className="sp-empty">Empty</p>
              )}
            </details>
          ))}
          {total === 0 && preview.categories.length === 0 ? (
            <p className="sp-empty">Garrison can't see any channels.</p>
          ) : null}
        </div>
        <div className="sp__pane sp__pane--roles">
          <div className="g-label sp__title">Roles</div>
          <ul className="sp-list">
            {preview.roles.map((r) => (
              <li className={rowClass("sp-row", r.isNew, r.moved)} key={`${r.moved ?? ""}${r.key}`}>
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
                  <span className="sp-row__name">{r.name}</span>
                  {r.details.length ? (
                    <span className="sp-row__detail">{r.details.join(" · ")}</span>
                  ) : null}
                </span>
                <Tag isNew={r.isNew} moved={r.moved} />
                {linked && r.moved !== "from" ? <Open id={r.key} name={r.name} /> : null}
              </li>
            ))}
            <li className="sp-row sp-row--quiet">
              <svg className="sp-dot" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                <circle
                  cx="5"
                  cy="5"
                  r="4.25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="sp-row__main">
                <span className="sp-row__name">@everyone</span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
