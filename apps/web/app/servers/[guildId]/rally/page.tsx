import {
  capacity,
  getOpsTimezone,
  listActiveMembers,
  listDashboardActions,
  listOpenLfg,
  listSignups,
  listUpcomingOps,
  memberNames,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { ACTION_KIND, ACTION_STATUS } from "@/lib/rally-schema";
import { requireGuildAccess } from "@/lib/session";
import { requestCallSignups, requestCreateRaid, requestMoveSignup } from "./actions";

const QUEUED: Record<string, string> = {
  create_raid: "Queued. Garrison posts the raid in a few seconds.",
  move_signup: "Queued. Garrison moves them and updates the card.",
  call_signups: "Queued. Garrison posts the call in the raid's channel.",
};
const ERRORS: Record<string, string> = {
  invalid: "Some fields weren't valid. Nothing was queued.",
  channel: "That channel isn't a text channel in this server.",
  not_found: "That raid or signup has changed. Refresh and try again.",
  busy: "Garrison has 10 requests waiting for this server. Try again shortly.",
  too_fast: "That's a lot of requests at once. Wait a minute and try again.",
  cooldown: "A call for signups for this raid went out in the last hour.",
};

export const metadata: Metadata = { title: "Rally" };

/** Slot numbers 1..n, capped at 10 for the card. */
const slotNumbers = (n: number) => Array.from({ length: Math.min(n, 10) }, (_, i) => i + 1);

export default async function RallyPage({
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
  const [posts, raids, actions, timezone, channels] = await Promise.all([
    listOpenLfg(db, guild.id),
    listUpcomingOps(db, guild.id),
    listDashboardActions(db, guild.id, 8),
    getOpsTimezone(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
  ]);
  const [postMembers, raidSignups] = await Promise.all([
    Promise.all(posts.map((p) => listActiveMembers(db, p.id))),
    Promise.all(raids.map((r) => listSignups(db, r.id))),
  ]);
  const names = await memberNames(
    db,
    guild.id,
    raidSignups.flat().map((s) => s.userId),
  );
  const nameOf = (id: string) => names.get(id) ?? `Member ${id.slice(-4)}`;
  const working = actions.some((a) => a.status === "pending" || a.status === "running");
  const queued = typeof query.queued === "string" ? QUEUED[query.queued] : undefined;
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Rally · LFG and events</span>
          <h1>Rally and Ops</h1>
          <p>Open groups, upcoming raids and who's signed up. Members post groups with /lfg.</p>
        </div>
        <div className="row-between">
          <a className="g-btn g-btn--secondary" href={`/servers/${guild.id}/rally/templates`}>
            LFG templates
          </a>
          <a className="g-btn g-btn--primary" href="?create=1#create-raid">
            Create raid
          </a>
        </div>
      </div>
      {working ? <AutoRefresh /> : null}
      {queued ? (
        <div className="notice notice--ok" role="status">
          {queued}
        </div>
      ) : null}
      {error ? (
        <div className="notice" role="alert">
          {error}
        </div>
      ) : null}

      <details className="g-card raid-create" id="create-raid" open={query.create === "1"}>
        <summary className="g-label">Create raid</summary>
        <form action={requestCreateRaid} className="card-col create-raid">
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="field-row">
            <label className="g-field">
              <span>Title</span>
              <input
                className="g-input"
                name="title"
                maxLength={80}
                required
                placeholder="Molten Core"
              />
            </label>
            <label className="g-field">
              <span>Post in</span>
              <select className="g-input" name="channelId" required defaultValue="">
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
          </div>
          <div className="field-row">
            <label className="g-field">
              <span>Date</span>
              <input className="g-input" name="date" type="date" required />
            </label>
            <label className="g-field">
              <span>Time ({timezone})</span>
              <input className="g-input" name="time" type="time" required />
            </label>
          </div>
          <label className="g-field">
            <span>Roles and caps</span>
            <input
              className="g-input"
              name="roles"
              maxLength={120}
              required
              defaultValue="Tank 2, Healer 4, DPS 14"
            />
            <span className="g-help">Like /raid create: names and how many of each.</span>
          </label>
          <label className="g-field">
            <span>Note</span>
            <input className="g-input" name="note" maxLength={200} placeholder="Requirements" />
          </label>
          <label className="check">
            <input type="checkbox" name="repeatWeekly" />
            <span>Post it again every week</span>
          </label>
          <p className="g-help">
            Garrison posts it as you, with a signup card, in the time zone set in Settings. You must
            be able to post in that channel yourself.
          </p>
          <button type="submit" className="g-btn g-btn--primary">
            Create raid
          </button>
        </form>
      </details>
      <div className="grid-cards">
        <section aria-label="Open groups" className="card-col">
          <div className="g-label">Open groups</div>
          {posts.length ? (
            posts.map((p, i) => {
              const members = postMembers[i] ?? [];
              const total = capacity(p.slots);
              return (
                <div className="g-lfg g-lfg--wide" key={p.id}>
                  <div className="g-lfg__head">
                    <span className="g-lfg__title">{p.title}</span>
                    <span
                      className={`g-badge ${p.status === "full" ? "g-badge--go" : "g-badge--accent"}`}
                    >
                      {p.status === "full"
                        ? "Full"
                        : total - members.length === 1
                          ? "1 left"
                          : "Open"}
                    </span>
                  </div>
                  <div className="g-lfg__meta">{p.note ?? formatTime(p.startsAt)}</div>
                  <div
                    className="g-slots"
                    role="img"
                    aria-label={`${members.length} of ${total} slots filled`}
                  >
                    {slotNumbers(total).map((n) => (
                      <span
                        key={n}
                        className={`g-slot ${n <= members.length ? "g-slot--filled" : ""}`}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="g-card muted">No open groups.</div>
          )}
        </section>
        <section aria-label="Upcoming raids" className="card-col">
          <div className="g-label">Upcoming raids</div>
          {raids.length ? (
            raids.map((r, i) => {
              const signups = raidSignups[i] ?? [];
              const seated = signups.filter((s) => !s.bench);
              const bench = signups.filter((s) => s.bench);
              const missing = r.slots.map((g) => ({
                name: g.name,
                n: g.count - seated.filter((x) => x.role === g.name).length,
              }));
              const open = missing.filter((m) => m.n > 0).map((m) => m.name);
              const short = missing.filter((m) => m.n > 0).map((m) => `${m.n} ${m.name} short`);
              return (
                <div className="g-card g-card--hud card-col" key={r.id}>
                  <div>
                    <div className="g-label">
                      Ops · raid{r.repeatWeekly ? " · repeats weekly" : ""}
                    </div>
                    <h2>{r.title}</h2>
                    <div className="mono">{formatTime(r.startsAt, r.timezone)}</div>
                  </div>
                  <div className="roster">
                    {r.slots.map((g) => {
                      const inRole = seated.filter((x) => x.role === g.name);
                      const tone =
                        inRole.length >= g.count ? "tone-go" : inRole.length ? "tone-caution" : "";
                      return (
                        <div className="roster__col" key={g.name}>
                          <div className="row-between">
                            <span className="g-label">{g.name}</span>
                            <span className={`mono ${tone}`}>
                              {inRole.length} / {g.count}
                            </span>
                          </div>
                          {inRole.slice(0, 6).map((x) => (
                            <div className="roster__slot" key={x.userId}>
                              <span>{nameOf(x.userId)}</span>
                              {x.spec ? <span className="mono">{x.spec}</span> : null}
                            </div>
                          ))}
                          {inRole.length > 6 ? (
                            <span className="g-help">+{inRole.length - 6} more</span>
                          ) : null}
                          {g.count > inRole.length ? (
                            <div className="roster__slot roster__slot--open">
                              {g.count - inRole.length} open
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {bench.length ? (
                    <div className="card-col">
                      <span className="g-label">Bench · {bench.length}</span>
                      {bench.slice(0, 10).map((b) => (
                        <form action={requestMoveSignup} className="bench-row" key={b.userId}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="eventId" value={r.id} />
                          <input type="hidden" name="userId" value={b.userId} />
                          <span>
                            {nameOf(b.userId)}{" "}
                            <span className="mono">
                              {b.role}
                              {b.spec ? ` · ${b.spec}` : ""}
                            </span>
                          </span>
                          <select
                            className="g-input g-input--sm"
                            name="role"
                            aria-label={`Role for ${nameOf(b.userId)}`}
                            defaultValue={open[0] ?? b.role}
                          >
                            {r.slots.map((g) => (
                              <option key={g.name} value={g.name}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="g-btn g-btn--secondary">
                            Move
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                  <div className="row-between raid-foot">
                    <span className="mono">
                      {seated.length} / {capacity(r.slots)}
                      {short.length ? ` · ${short.join(", ")}` : " · full"}
                    </span>
                    {short.length ? (
                      <form action={requestCallSignups}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="eventId" value={r.id} />
                        <button type="submit" className="g-btn g-btn--secondary">
                          Post a call for signups
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="g-card muted">No raids scheduled.</div>
          )}
        </section>
      </div>

      {actions.length ? (
        <div className="g-card table-card">
          <div className="table-card__head row-between">
            <span className="g-label">Recent requests</span>
            <span className="g-help">Garrison does these in Discord, usually within seconds.</span>
          </div>
          <div className="table-wrap">
            <table className="g-table">
              <tbody>
                {actions.map((a) => {
                  const st = ACTION_STATUS[a.status] ?? { label: a.status, tone: "g-badge" };
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className={st.tone}>{st.label}</span>
                      </td>
                      <td>{ACTION_KIND[a.kind] ?? a.kind}</td>
                      <td className="muted">{a.message ?? "Waiting for Garrison"}</td>
                      <td>{a.requestedByName}</td>
                      <td className="mono">{formatTime(a.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
