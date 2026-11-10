import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The top of every page: where you are, what the page is for, and its main
 * actions on the right. A sub-page names the page above it, as a way back.
 */
export function PageHead({
  title,
  description,
  back,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** The page this one sits under. */
  back?: { href: string; label: string };
  /** Buttons for the page's main actions. */
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head__text">
        {back ? (
          <Link className="crumb" href={back.href}>
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="page-head__actions">{children}</div> : null}
    </div>
  );
}

/** A card's title row: a real heading, with its state or action on the right. */
export function CardHead({
  title,
  help,
  children,
}: {
  title: ReactNode;
  help?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card-head">
      <div>
        <h2>{title}</h2>
        {help ? <p className="g-help">{help}</p> : null}
      </div>
      {children ? <div className="card-head__side">{children}</div> : null}
    </div>
  );
}
