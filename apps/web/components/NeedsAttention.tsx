import Link from "next/link";
import type { AttentionItem, SetupStep } from "@/lib/attention";
import { plainMentions } from "./format";

/** A link under /servers/:id: "#health" stays on the overview, "rally#x" goes to Rally. */
const under = (guildId: string, href: string) =>
  href.startsWith("#") ? `/servers/${guildId}${href}` : `/servers/${guildId}/${href}`;

/** What needs doing on this server, most urgent first. Renders nothing when nothing does. */
export function NeedsAttention({ guildId, items }: { guildId: string; items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <section className="g-card card-col attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Needs attention</h2>
      <ul className="todo">
        {items.map((i) => (
          <li className={`todo__item todo__item--${i.tone}`} key={i.key}>
            <div className="todo__text">
              <strong>{i.title}</strong>
              <span className="muted">{plainMentions(i.detail)}</span>
            </div>
            <Link className="g-btn g-btn--secondary" href={under(guildId, i.href)}>
              {i.cta}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** First steps for a new server. Hiding it is a setting, so it's in history and can be undone. */
export function SetupChecklist({
  guildId,
  steps,
  hide,
}: {
  guildId: string;
  steps: SetupStep[];
  hide: (form: FormData) => Promise<void>;
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="g-card card-col setup" id="setup" aria-labelledby="setup-title">
      <div className="row-between setup__head">
        <div>
          <h2 id="setup-title">Set up Garrison</h2>
          <p className="g-help">
            {done} of {steps.length} done. Each step opens the page where it's set.
          </p>
        </div>
        <form action={hide}>
          <input type="hidden" name="guildId" value={guildId} />
          <button type="submit" className="g-btn g-btn--ghost">
            Hide checklist
          </button>
        </form>
      </div>
      <ol className="todo">
        {steps.map((s, i) => (
          <li className={`todo__item ${s.done ? "todo__item--done" : ""}`} key={s.key}>
            <span className="todo__mark" aria-hidden="true">
              {s.done ? <Tick /> : i + 1}
            </span>
            <div className="todo__text">
              <strong>{s.title}</strong>
              <span className="muted">{s.done ? (s.doneDetail ?? "Done.") : s.detail}</span>
            </div>
            {s.done ? null : (
              <Link className="g-btn g-btn--secondary" href={under(guildId, s.href)}>
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
