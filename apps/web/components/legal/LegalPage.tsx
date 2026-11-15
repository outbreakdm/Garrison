import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { siteUrl } from "@/lib/hosts";
import { LEGAL, LEGAL_PAGES } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * The reading layout for Terms, Privacy and Refunds: the short version first, a
 * contents list, then numbered sections with anchors so support can link one.
 */
export function LegalPage({
  title,
  lead,
  summary,
  sections,
}: {
  title: string;
  lead: ReactNode;
  /** "The short version": a few plain sentences, never a substitute for the sections. */
  summary: ReactNode[];
  sections: LegalSection[];
}) {
  const home = siteUrl(process.env.APP_URL) || "/";
  return (
    <div className="landing">
      <header className="topbar landing__bar">
        <Link href={home} aria-label="Garrison home">
          <Logo />
        </Link>
        <span className="topbar__spacer" />
        <Link className="g-btn g-btn--ghost" href={home}>
          Home
        </Link>
      </header>
      <main className="legal">
        <header className="legal__head">
          <p className="g-label">Last updated {LEGAL.updated}</p>
          <h1>{title}</h1>
          <p className="legal__lead">{lead}</p>
        </header>

        <section className="legal__summary" aria-labelledby="short-version">
          <h2 id="short-version">The short version</h2>
          <ul>
            {summary.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed copy that never reorders
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="legal__fine">
            This summary is here to help you read the rest. The full text below is what applies.
          </p>
        </section>

        <nav className="legal__toc" aria-label="Contents">
          <h2 className="g-label">Contents</h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal__body">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="legal__section" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`}>
                <span className="legal__num">{i + 1}.</span> {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>

        <footer className="legal__foot">
          <p>
            Questions about this page? Email <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>
            .
          </p>
          <nav aria-label="Policies">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href}>
                {p.name}
              </Link>
            ))}
            <Link href="/status">Status</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

/** A mailto link to the support address. */
export function Mail({ subject }: { subject?: string }) {
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return <a href={`mailto:${LEGAL.contact}${q}`}>{LEGAL.contact}</a>;
}
