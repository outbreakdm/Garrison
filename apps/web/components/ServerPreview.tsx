import type { ServerPreview as Preview, PreviewChannel } from "@/lib/qm-preview";

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

function Channel({ c }: { c: PreviewChannel }) {
  const what = `${c.kind === "voice" ? "Voice channel" : "Channel"}${c.locked ? ", private" : ""}`;
  return (
    <li className={`sp-row ${c.isNew ? "is-new" : ""}`}>
      <Glyph kind={c.kind} locked={c.locked} />
      <span className="sp-row__main">
        <span className="sp-row__name">
          <span className="sr-only">{what}: </span>
          {c.name}
        </span>
        {c.details.length ? <span className="sp-row__detail">{c.details.join(" · ")}</span> : null}
      </span>
      {c.isNew ? <span className="sp-new">New</span> : null}
    </li>
  );
}

export function ServerPreview({
  name,
  preview,
  planned,
}: {
  name: string;
  preview: Preview;
  /** A plan is waiting: mark its additions and offer the now / with changes switch. */
  planned: boolean;
}) {
  const total =
    preview.loose.length + preview.categories.reduce((n, c) => n + c.channels.length, 0);
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
              {preview.roles.filter((r) => !r.isNew).length} roles
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
                <Channel c={c} key={c.key} />
              ))}
            </ul>
          ) : null}
          {preview.categories.map((cat) => (
            <details
              className={`sp-cat ${cat.isNew ? "is-new" : ""}`}
              key={cat.key}
              open={openAll || cat.touched}
            >
              <summary>
                <span className="sp-cat__name">{cat.name}</span>
                {cat.isNew ? (
                  <span className="sp-new">New</span>
                ) : (
                  <span className="sp-cat__count">
                    {cat.channels.filter((c) => !c.isNew).length}
                  </span>
                )}
              </summary>
              {cat.channels.length ? (
                <ul className="sp-list">
                  {cat.channels.map((c) => (
                    <Channel c={c} key={c.key} />
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
              <li className={`sp-row ${r.isNew ? "is-new" : ""}`} key={r.key}>
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
                {r.isNew ? <span className="sp-new">New</span> : null}
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
