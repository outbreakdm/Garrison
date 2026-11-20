import { RESPONDER_LIMITS, type Responder } from "@garrison/db";
import { removeResponder, saveResponder } from "@/app/servers/[guildId]/dispatch/responder-actions";

const TRIGGER_WORDS: Record<Responder["trigger"], string> = {
  word: "Says the word",
  phrase: "Says the phrase",
  command: "Runs /tag",
};

/** One responder's fields: blank for a new one, filled for an edit. */
function Fields({
  r,
  channels,
}: {
  r: Responder | null;
  channels: { id: string; name: string }[];
}) {
  const key = r?.id ?? "new";
  return (
    <div className="resp__fields">
      <label className="g-field">
        <span className="g-label">Name</span>
        <input
          className="g-input"
          name="name"
          defaultValue={r?.name ?? ""}
          maxLength={RESPONDER_LIMITS.name}
          placeholder="Server rules"
          required
        />
      </label>
      <div className="resp__trigger">
        <label className="g-field">
          <span className="g-label">When someone</span>
          <select className="g-select" name="trigger" defaultValue={r?.trigger ?? "word"}>
            {(Object.keys(TRIGGER_WORDS) as Responder["trigger"][]).map((t) => (
              <option key={t} value={t}>
                {TRIGGER_WORDS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="g-field">
          <span className="g-label">Word, phrase or tag name</span>
          <input
            className="g-input"
            name="text"
            defaultValue={r?.text ?? ""}
            maxLength={RESPONDER_LIMITS.text}
            placeholder="rules"
            required
          />
        </label>
      </div>
      <label className="g-field">
        <span className="g-label">Garrison replies</span>
        <textarea
          className="g-input"
          name="reply"
          rows={3}
          defaultValue={r?.reply ?? ""}
          maxLength={RESPONDER_LIMITS.reply}
          placeholder="Read the rules in #rules before posting. Mentions show but never ping."
          required
        />
      </label>
      <div className="resp__row">
        <label className="g-field">
          <span className="g-label">Only in (words and phrases)</span>
          <select
            className="g-select resp__channels"
            name="channelIds"
            multiple
            defaultValue={r?.channelIds ?? []}
            aria-describedby={`resp-ch-${key}`}
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <span className="g-help" id={`resp-ch-${key}`}>
            None picked: every channel.
          </span>
        </label>
        <label className="g-field">
          <span className="g-label">Wait between replies</span>
          <select
            className="g-select"
            name="cooldownSeconds"
            defaultValue={String(r?.cooldownSeconds ?? 30)}
          >
            {[0, 10, 30, 60, 300, 900, 3600].map((s) => (
              <option key={s} value={s}>
                {s === 0
                  ? "No wait"
                  : s < 60
                    ? `${s} seconds`
                    : s < 3600
                      ? `${s / 60} min`
                      : "1 hour"}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * Auto-responders and /tag commands on the Messages page: Garrison answers a word or a
 * phrase in chat, or posts a tag when someone runs /tag. Free keeps 10, Pro 100.
 */
export function RespondersPanel({
  guildId,
  list,
  limit,
  channels,
}: {
  guildId: string;
  list: Responder[];
  limit: number;
  channels: { id: string; name: string }[];
}) {
  const full = list.length >= limit;
  return (
    <section className="g-card resp" id="responders" aria-labelledby="resp-title">
      <div className="resp__head">
        <div>
          <h2 className="card-title" id="resp-title">
            Auto-responders and tags
          </h2>
          <p className="card-sub">
            Garrison answers a word or a phrase in chat, or posts a tag when someone runs{" "}
            <code>/tag</code>. {list.length} of {limit} used.
          </p>
        </div>
      </div>
      {list.length ? (
        <ul className="resp__list">
          {list.map((r, i) => (
            <li key={r.id} className={`resp__item${r.enabled ? "" : " is-off"}`}>
              <details>
                <summary className="resp__summary">
                  <span className="resp__name">{r.name}</span>
                  <span className="resp__when">
                    {r.trigger === "command" ? `/tag ${r.text}` : `"${r.text}"`}
                    {i >= limit ? " · paused on this plan" : r.enabled ? "" : " · off"}
                  </span>
                </summary>
                <form action={saveResponder} className="resp__form">
                  <input type="hidden" name="guildId" value={guildId} />
                  <input type="hidden" name="id" value={r.id} />
                  <Fields r={r} channels={channels} />
                  <label className="check">
                    <input type="checkbox" name="enabled" defaultChecked={r.enabled} />
                    <span>On</span>
                  </label>
                  <div className="resp__do">
                    <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                      Save
                    </button>
                  </div>
                </form>
                <form action={removeResponder} className="resp__remove">
                  <input type="hidden" name="guildId" value={guildId} />
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                    Remove
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="resp__empty">
          None yet. A common first one: someone says "rules", Garrison points them to #rules.
        </p>
      )}
      {full ? (
        <p className="resp__empty">
          This server has {limit} responders, its plan's most. Garrison Pro keeps up to{" "}
          {RESPONDER_LIMITS.max}.
        </p>
      ) : (
        <details className="resp__new">
          <summary className="g-btn g-btn--secondary g-btn--sm">Add a responder</summary>
          <form action={saveResponder} className="resp__form">
            <input type="hidden" name="guildId" value={guildId} />
            <Fields r={null} channels={channels} />
            <div className="resp__do">
              <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                Add
              </button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}
