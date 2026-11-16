import Link from "next/link";

/**
 * The head of every list page (giveaways, feeds, menus, panels): filter pills on the left,
 * how many against the plan's limit and the white Create on the right. Pills are links
 * (?show=…), so a filtered list has its own address and works without scripts.
 */
export interface ListFilter {
  key: string;
  label: string;
  /** How many the pill would show; left off when it isn't worth counting. */
  n?: number;
  href: string;
}

export function ListHead({
  filters,
  current,
  count,
  create,
}: {
  filters: ListFilter[];
  current: string;
  /** "1 of 2 running": where the list stands against the plan. */
  count?: string;
  /** The one white button; `disabled` names why it's resting (a limit reached). */
  create?: { label: string; href: string; disabled?: string };
}) {
  return (
    <div className="list-head">
      <nav className="list-head__filters" aria-label="Filter">
        {filters.map((f) => (
          <Link
            key={f.key}
            className="list-pill"
            href={f.href}
            scroll={false}
            aria-current={f.key === current ? "true" : undefined}
          >
            {f.label}
            {f.n !== undefined ? <span className="list-pill__n">{f.n}</span> : null}
          </Link>
        ))}
      </nav>
      {count || create ? (
        <span className="list-head__end">
          {count ? <span className="list-head__count">{count}</span> : null}
          {create ? (
            create.disabled ? (
              <span className="g-btn g-btn--secondary" aria-disabled="true" title={create.disabled}>
                <PlusIcon />
                {create.label}
              </span>
            ) : (
              <Link className="g-btn g-btn--primary" href={create.href}>
                <PlusIcon />
                {create.label}
              </Link>
            )
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
