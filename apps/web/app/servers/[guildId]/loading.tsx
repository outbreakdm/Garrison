/**
 * The page's frame while the server reads it. It shows the instant a nav item is
 * picked (Next prefetches it with the link), under the still top bar and menu.
 */
export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">Loading the page…</span>
      <div className="skeleton__head" aria-hidden="true">
        <span className="skeleton__bar skeleton__bar--title" />
        <span className="skeleton__bar skeleton__bar--line" />
      </div>
      <div className="skeleton__cells" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div className="skeleton__cell" key={i}>
            <span className="skeleton__bar skeleton__bar--short" />
            <span className="skeleton__bar skeleton__bar--title" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div className="skeleton__card" key={i} aria-hidden="true">
          <span className="skeleton__bar skeleton__bar--short" />
          <span className="skeleton__bar skeleton__bar--line" />
          <span className="skeleton__bar skeleton__bar--line" />
        </div>
      ))}
    </div>
  );
}
