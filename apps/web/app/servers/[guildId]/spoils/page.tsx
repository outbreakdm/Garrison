import {
  entitlements,
  GIVEAWAY_DURATIONS,
  GIVEAWAY_LIMITS,
  getGuildPlan,
  giveawayEntryCounts,
  listGiveaways,
  RUNNING_HARD_MAX,
  STANDARD_ACCENT,
} from "@garrison/db";
import type { Metadata } from "next";
import { ProTag } from "@/components/cards/CardEditor";
import { RequestsPanel } from "@/components/RequestsPanel";
import { FormPanel } from "@/components/settings";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { requestAction } from "../requests";

export const metadata: Metadata = { title: "Giveaways" };

/** "in 3 h", for a time still ahead. */
function until(date: Date, now = Date.now()) {
  const s = Math.max(0, Math.round((date.getTime() - now) / 1000));
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 172_800) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86_400)} d`;
}

export default async function GiveawaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [plan, list, channels, roles] = await Promise.all([
    getGuildPlan(db, guild.id),
    listGiveaways(db, guild.id, 30),
    listTextChannels(guild.id).catch(() => []),
    listNotifiableRoles(guild.id).catch(() => []),
  ]);
  const ent = entitlements(plan);
  const counts = await giveawayEntryCounts(
    db,
    list.map((g) => g.id),
  );
  const running = list.filter((g) => g.status === "running");
  const limit = ent["giveaways.running"];
  const full = running.length >= limit;
  // Winners by name, for the finished giveaways on screen (a handful of lookups at most).
  const winnerIds = [...new Set(list.flatMap((g) => g.winnerIds))].slice(0, 20);
  const names = new Map(
    (
      await Promise.all(winnerIds.map((id) => fetchMemberCard(guild.id, id).catch(() => null)))
    ).flatMap((m) => (m ? [[m.id, m.name] as const] : [])),
  );
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const pro = ent["giveaways.rules"];

  const act = (id: string, op: "end" | "reroll" | "cancel", label: string, ghost = false) => (
    <form action={requestAction}>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="page" value="spoils" />
      <input type="hidden" name="kind" value="giveaway_action" />
      <input type="hidden" name="giveawayId" value={id} />
      <input type="hidden" name="op" value={op} />
      <button
        type="submit"
        className={`g-btn ${ghost ? "g-btn--ghost" : "g-btn--secondary"} g-btn--sm`}
      >
        {label}
      </button>
    </form>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Giveaways</h1>
          <p>
            Post a prize with an Enter button. When time's up, Garrison draws the winners at random
            and announces them.
          </p>
        </div>
        <span className="mono">
          {plan === "pro" ? "Pro" : "Free"} · {running.length} of {limit} running
        </span>
      </div>

      <RequestsPanel
        guildId={guild.id}
        kinds={["start_giveaway", "giveaway_action"]}
        query={query}
      />

      <FormPanel
        id="new"
        title="New giveaway"
        hint={
          full
            ? `${limit} of ${limit} running${plan === "pro" ? "" : `. Pro runs ${RUNNING_HARD_MAX}.`}`
            : "A prize, how many win, and how long it runs"
        }
        open={list.length === 0 || query.edit === "new"}
      >
        <form action={requestAction} className="card-col">
          <input type="hidden" name="guildId" value={guild.id} />
          <input type="hidden" name="page" value="spoils" />
          <input type="hidden" name="kind" value="start_giveaway" />
          <div className="field-row">
            <label className="g-field" htmlFor="prize">
              <span>Prize</span>
              <input
                className="g-input"
                id="prize"
                name="prize"
                required
                maxLength={GIVEAWAY_LIMITS.prize}
                placeholder="Nitro for a month"
              />
            </label>
            <label className="g-field" htmlFor="channelId">
              <span>Post in</span>
              <select className="g-input" id="channelId" name="channelId" required>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="g-field" htmlFor="description">
            <span>Details (optional)</span>
            <textarea
              className="g-input"
              id="description"
              name="description"
              rows={2}
              maxLength={GIVEAWAY_LIMITS.description}
              placeholder="Discord formatting works."
            />
          </label>
          <div className="field-row">
            <label className="g-field" htmlFor="winners">
              <span>Winners</span>
              <input
                className="g-input"
                id="winners"
                name="winners"
                type="number"
                min={1}
                max={GIVEAWAY_LIMITS.winners}
                defaultValue={1}
                required
              />
            </label>
            <label className="g-field" htmlFor="durationMinutes">
              <span>Runs for</span>
              <select
                className="g-input"
                id="durationMinutes"
                name="durationMinutes"
                defaultValue="1440"
              >
                {GIVEAWAY_DURATIONS.map((d) => (
                  <option key={d.minutes} value={d.minutes}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="editor-group" disabled={!pro}>
            <legend className="g-label">
              Who can enter <ProTag on={pro} />
            </legend>
            <div className="field-row">
              <label className="g-field" htmlFor="requiredRoleId">
                <span>Open to</span>
                <select
                  className="g-input"
                  id="requiredRoleId"
                  name="requiredRoleId"
                  defaultValue=""
                >
                  <option value="">Everyone</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      Only @{r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="g-field" htmlFor="minLevel">
                <span>Minimum level to enter</span>
                <input
                  className="g-input"
                  id="minLevel"
                  name="minLevel"
                  type="number"
                  min={1}
                  max={GIVEAWAY_LIMITS.minLevel}
                  placeholder="Any"
                />
              </label>
            </div>
            <div className="bonus-rows">
              <span className="g-help">Bonus entries for roles, like boosters (up to 3).</span>
              {[0, 1, 2].map((i) => (
                <div className="bonus-row" key={i}>
                  <select
                    className="g-input"
                    name={`bonusRole${i}`}
                    aria-label={`Bonus role ${i + 1}`}
                    defaultValue=""
                  >
                    <option value="">No bonus role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="g-input"
                    name={`bonusExtra${i}`}
                    aria-label={`Extra entries for bonus role ${i + 1}`}
                    defaultValue="1"
                  >
                    {Array.from({ length: GIVEAWAY_LIMITS.extra }, (_, k) => k + 1).map((n) => (
                      <option key={n} value={n}>
                        +{n} {n === 1 ? "entry" : "entries"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <label className="switch">
              <input type="checkbox" name="repeat" />
              <span className="switch__text">
                <span>Run again when it ends</span>
                <span className="g-help">
                  A new one with the same prize and length starts as soon as winners are drawn.
                  Cancel one to stop.
                </span>
              </span>
            </label>
            <label className="g-field" htmlFor="accent">
              <span>Color</span>
              <input
                className="color-field__swatch"
                id="accent"
                name="accent"
                type="color"
                defaultValue={STANDARD_ACCENT}
              />
            </label>
          </fieldset>
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary" disabled={full}>
              {full ? `${limit} of ${limit} running` : "Start giveaway"}
            </button>
            <span className="g-help">
              {pro
                ? "Garrison posts it as itself; winners are drawn with a secure random draw."
                : `Free servers run ${limit} at once, open to everyone. Pro runs ${RUNNING_HARD_MAX}, with entry rules, bonus entries and your color.`}
            </span>
          </div>
        </form>
      </FormPanel>

      {list.length ? (
        <section className="g-card queue" aria-labelledby="gw-title">
          <h2 className="card-title" id="gw-title">
            Recent giveaways
          </h2>
          <ul className="queue__list">
            {list.map((g) => {
              const entries = counts.get(g.id) ?? 0;
              const winners = g.winnerIds.map((id) => `@${names.get(id) ?? "member"}`).join(", ");
              return (
                <li key={g.id} className="gw-row">
                  <span className="gw-row__main">
                    <span className="ticket-row__topic">{g.prize}</span>
                    <span className="ticket-row__who">
                      #{channelName.get(g.channelId) ?? "deleted-channel"} · {entries}{" "}
                      {entries === 1 ? "entry" : "entries"} · {g.winners}{" "}
                      {g.winners === 1 ? "winner" : "winners"}
                      {g.status === "ended"
                        ? ` · won by ${winners || "nobody"}`
                        : g.status === "cancelled"
                          ? " · canceled"
                          : ""}
                      {g.repeat && g.status === "running" ? " · runs again when drawn" : ""}
                    </span>
                  </span>
                  <span
                    className={`g-badge ${g.status === "running" ? "g-badge--go" : g.status === "cancelled" ? "g-badge--caution" : "g-badge--off"}`}
                  >
                    {g.status === "running"
                      ? `Draws ${until(g.endsAt)}`
                      : g.status === "ended"
                        ? `Drawn ${ago(g.endedAt ?? g.endsAt)}`
                        : "Canceled"}
                  </span>
                  <span className="gw-row__actions">
                    {g.status === "running" ? (
                      <>
                        {act(g.id, "end", "Draw now")}
                        {act(g.id, "cancel", "Cancel", true)}
                      </>
                    ) : g.status === "ended" &&
                      entries > new Set([...g.drawnIds, ...g.winnerIds]).size ? (
                      act(g.id, "reroll", "Draw again")
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
