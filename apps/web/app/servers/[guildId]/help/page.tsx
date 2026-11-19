import { HELP, HELP_TOPICS, type HelpEntry, helpPlanLines } from "@garrison/db";
import type { Metadata } from "next";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Help" };

/**
 * How every Garrison feature works, from the same help file the AI assistant answers from
 * (packages/db/src/help.ts), so the page and the assistant never disagree.
 */
export default async function HelpPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const base = `/servers/${guild.id}`;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Help</h1>
          <p>
            What each feature does, where it lives and how to set it up. The AI assistant answers
            from the same pages.
          </p>
        </div>
      </div>
      <nav className="help-toc" aria-label="Features">
        {HELP_TOPICS.map((t) => (
          <a key={t} href={`#${t}`} className="chip">
            {HELP[t].title}
          </a>
        ))}
      </nav>
      <div className="help-list">
        {HELP_TOPICS.map((t) => {
          const e: HelpEntry = HELP[t];
          const plan = helpPlanLines(e);
          return (
            <section className="g-card help-entry" id={t} key={t} aria-labelledby={`${t}-title`}>
              <div className="help-entry__head">
                <h2 className="help-entry__title" id={`${t}-title`}>
                  {e.title}
                </h2>
                <a className="g-btn g-btn--ghost g-btn--sm" href={`${base}${e.path}`}>
                  Open {e.page}
                </a>
              </div>
              <p className="help-entry__about">{e.about}</p>
              <ol className="help-entry__steps">
                {e.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {e.commands?.length ? (
                <p className="help-entry__commands">
                  <span className="g-label">Commands</span>{" "}
                  {e.commands.map((c) => (
                    <code key={c}>{c}</code>
                  ))}
                </p>
              ) : null}
              {plan.length ? (
                <dl className="help-entry__plan">
                  {plan.map((line) => {
                    const at = line.lastIndexOf(": Free ");
                    return (
                      <div className="help-entry__row" key={line}>
                        <dt>{line.slice(0, at)}</dt>
                        <dd className="help-entry__value">{line.slice(at + 2)}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
