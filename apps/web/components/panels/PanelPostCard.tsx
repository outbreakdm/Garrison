import { requestAction } from "@/app/servers/[guildId]/requests";

/**
 * Where a panel is and the form that posts it (Suggestions, LFG). Posting is a request to the
 * bot, which takes the old panel down: one panel per module per server.
 */
export function PanelPostCard({
  id,
  guildId,
  page,
  kind,
  channels,
  posted,
  suggested,
  blocked,
}: {
  id: string;
  guildId: string;
  /** The page the request reports back to. */
  page: string;
  kind: string;
  channels: { id: string; name: string }[];
  /** Where it's posted now, if it is. */
  posted: { channelId: string; messageId: string } | null;
  /** Where it would usually go, picked to start with. */
  suggested: string | null;
  /** Why it can't be posted yet (said under the button, which rests), or null. */
  blocked: string | null;
}) {
  const name = (c: string) => channels.find((x) => x.id === c)?.name ?? null;
  const start = posted?.channelId ?? suggested ?? "";
  return (
    <section className="g-card panel-post" id={id} aria-labelledby={`${id}-title`}>
      <h2 className="card-title" id={`${id}-title`}>
        Post the panel
      </h2>
      <p className="card-sub">
        {posted ? (
          <>
            It's in #{name(posted.channelId) ?? "a deleted channel"}.{" "}
            <a
              href={`https://discord.com/channels/${guildId}/${posted.channelId}/${posted.messageId}`}
            >
              Open in Discord
            </a>
            . Posting again moves it and takes the old one down.
          </>
        ) : (
          "Not posted yet."
        )}
      </p>
      {/* Keyed by where it would go, so a channel saved elsewhere on the page shows at once. */}
      <form action={requestAction} className="panel-post__form" key={start}>
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="kind" value={kind} />
        <label className="g-field" htmlFor={`${id}-channel`}>
          <span className="g-label">Post it in</span>
          <select
            className="g-input"
            id={`${id}-channel`}
            name="channelId"
            required
            defaultValue={start}
          >
            <option value="" disabled>
              Pick a channel
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="g-btn g-btn--primary g-btn--sm"
          disabled={Boolean(blocked)}
        >
          {posted ? "Post again" : "Post the panel"}
        </button>
      </form>
      {blocked ? <p className="g-help">{blocked}</p> : null}
    </section>
  );
}
