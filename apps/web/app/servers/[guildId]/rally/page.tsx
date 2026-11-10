import {
  capacity,
  checkTemplates,
  getGuildPlan,
  getOpsTimezone,
  getRallyTemplates,
  listActiveMembers,
  listDashboardActions,
  listOpenLfg,
  listSignups,
  listUpcomingOps,
  memberNames,
} from "@garrison/db";
import type { Metadata } from "next";
import { formatTime, When } from "@/components/format";
import { Outcome } from "@/components/Outcome";
import { PageHead } from "@/components/PageHead";
import { RequestsHistory, RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { errorAt, latestOutcome, payloadField } from "@/lib/outcome";
import { PAGES } from "@/lib/pages";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { requestCallSignups, requestCreateRaid, requestMoveSignup } from "./actions";

/** Everything asked from this page. Moderation and builds show on their own pages. */
const KINDS = [
  "create_raid",
  "move_signup",
  "call_signups",
  "cancel_raid",
  "close_lfg",
  "create_lfg",
  "lfg_join",
  "lfg_leave",
  "raid_signup",
  "raid_withdraw",
];
const GROUP_KINDS = ["lfg_join", "lfg_leave", "close_lfg"];
const RAID_KINDS = ["raid_signup", "raid_withdraw", "move_signup", "call_signups", "cancel_raid"];

export const metadata: Metadata = { title: PAGES.rally.title };

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
  const { guild, session } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [posts, raids, allActions, timezone, channels, rawTemplates, plan] = await Promise.all([
    listOpenLfg(db, guild.id),
    listUpcomingOps(db, guild.id),
    listDashboardActions(db, guild.id, 30),
    getOpsTimezone(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    getRallyTemplates(db, guild.id),
    getGuildPlan(db, guild.id),
  ]);
  const checked = checkTemplates(rawTemplates, plan);
  const templates = checked.ok ? checked.value : [];
  const defaultTemplate = templates.find((t) => t.isDefault);
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
  /** Your last request about this group or raid, shown on its card. */
  const outcomeFor = (kinds: string[], id: string) =>
    latestOutcome(allActions, {
      userId: session.userId,
      kinds,
      match: (p) => payloadField(p, "id") === id || payloadField(p, "eventId") === id,
    });

  return (
    <>
      <PageHead
        title={PAGES.rally.title}
        description="Groups are quick pick-up squads members join right away. Raids are scheduled, with role signups and a bench."
      >
        <a className="g-btn g-btn--ghost" href={`/servers/${guild.id}/rally/templates`}>
          LFG templates
        </a>
        <a className="g-btn g-btn--secondary" href="?post=1#post-group">
          Post a group
        </a>
        <a className="g-btn g-btn--primary" href="?create=1#create-raid">
          Create raid
        </a>
      </PageHead>
      <RequestsPanel kinds={KINDS} query={query} actions={allActions} />

      <details className="g-card raid-create form-card" id="post-group" open={query.post === "1"}>
        <summary className="form-card__head">
          <h2>Post a group</h2>
          <span className="g-btn g-btn--ghost">Close</span>
        </summary>
        <form action={requestAction} className="card-col create-raid">
          <input type="hidden" name="guildId" value={guild.id} />
          <input type="hidden" name="page" value="rally" />
          <input type="hidden" name="kind" value="create_lfg" />
          <div className="field-row">
            <label className="g-field">
              <span>Title</span>
              <input
                className="g-input"
                name="title"
                maxLength={80}
                required
                placeholder="Ranked duos, Gold+"
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
            {templates.length ? (
              <label className="g-field">
                <span>Template</span>
                <select className="g-input" name="templateId" defaultValue="">
                  <option value="">{defaultTemplate ? defaultTemplate.name : "None"}</option>
                  {templates
                    .filter((t) => t !== defaultTemplate)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.game ? `${t.name} · ${t.game}` : t.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <label className="g-field">
              <span>Starts</span>
              <select className="g-input" name="starts" defaultValue="now">
                <option value="now">Now</option>
                <option value="10m">In 10 minutes</option>
                <option value="30m">In 30 minutes</option>
                <option value="1h">In 1 hour</option>
                <option value="2h">In 2 hours</option>
                <option value="4h">In 4 hours</option>
                <option value="8h">In 8 hours</option>
                <option value="1d">Tomorrow, this time</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="g-field">
              <span>Roles and caps</span>
              <input
                className="g-input"
                name="roles"
                maxLength={120}
                placeholder="Tank 1, Healer 1, DPS 3"
              />
              <span className="g-help">
                Leave blank for a plain group, or to use the template's.
              </span>
            </label>
            <label className="g-field">
              <span>Or just a size</span>
              <input
                className="g-input"
                name="size"
                type="number"
                min={2}
                max={40}
                placeholder="5"
              />
            </label>
          </div>
          <div className="field-row">
            <label className="g-field">
              <span>Your role</span>
              <input className="g-input" name="myRole" maxLength={40} placeholder="Tank" />
              <span className="g-help">Only when the group has roles. Blank takes the first.</span>
            </label>
            <label className="g-field">
              <span>Note</span>
              <input className="g-input" name="note" maxLength={120} placeholder="Mic required" />
            </label>
          </div>
          <p className="g-help">
            Garrison posts the group as you, with Join buttons. You can host one open group at a
            time.
          </p>
          <button type="submit" className="g-btn g-btn--primary">
            Post group
          </button>
        </form>
      </details>
      <details
        className="g-card raid-create form-card"
        id="create-raid"
        open={query.create === "1"}
      >
        <summary className="form-card__head">
          <h2>Create a raid</h2>
          <span className="g-btn g-btn--ghost">Close</span>
        </summary>
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
            <span className="g-help">Role names and how many of each.</span>
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
            Garrison posts it as you, with a signup card. Times are in {timezone}, the server's time
            zone (change it in Settings). You must be able to post in that channel yourself.
          </p>
          <button type="submit" className="g-btn g-btn--primary">
            Create raid
          </button>
        </form>
      </details>
      <div className="grid-cards">
        <section aria-labelledby="groups-title" className="card-col">
          <div className="section-head">
            <h2 id="groups-title">Open groups</h2>
            <p>{posts.length ? `${posts.length} open` : ""}</p>
          </div>
          {posts.length ? (
            posts.map((p, i) => {
              const members = postMembers[i] ?? [];
              const total = capacity(p.slots);
              return (
                <div className="g-lfg g-lfg--wide" id={`group-${p.id}`} key={p.id}>
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
                  <div className="g-lfg__meta">
                    {p.note ? `${p.note} · ` : ""}
                    {p.startsAt.getTime() <= Date.now() ? "Started " : "Starts "}
                    <When date={p.startsAt} />
                  </div>
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
                  <div className="row-between lfg-actions">
                    {members.some((m) => m.userId === session.userId) ? (
                      <form action={requestAction}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="rally" />
                        <input type="hidden" name="kind" value="lfg_leave" />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="at" value={`group-${p.id}`} />
                        <button type="submit" className="g-btn g-btn--secondary">
                          Leave
                        </button>
                      </form>
                    ) : p.status === "open" ? (
                      <form action={requestAction} className="act-row">
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="rally" />
                        <input type="hidden" name="kind" value="lfg_join" />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="at" value={`group-${p.id}`} />
                        {p.slots.length > 1 || p.slots[0]?.name ? (
                          <select
                            className="g-input g-input--sm"
                            name="role"
                            aria-label={`Role in ${p.title}`}
                          >
                            {p.slots.map((g) => (
                              <option key={g.name} value={g.name}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input type="hidden" name="role" value="" />
                        )}
                        <button type="submit" className="g-btn g-btn--secondary">
                          Join
                        </button>
                      </form>
                    ) : (
                      <span />
                    )}
                    <form action={requestAction}>
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="rally" />
                      <input type="hidden" name="kind" value="close_lfg" />
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="at" value={`group-${p.id}`} />
                      <button type="submit" className="g-btn g-btn--ghost">
                        Close group
                      </button>
                    </form>
                  </div>
                  <Outcome
                    action={outcomeFor(GROUP_KINDS, p.id)}
                    error={errorAt(query, `group-${p.id}`)}
                  />
                </div>
              );
            })
          ) : (
            <div className="g-card empty">
              <span className="muted">No open groups right now.</span>
              <a className="g-btn g-btn--secondary" href="?post=1#post-group">
                Post a group
              </a>
            </div>
          )}
        </section>
        <section aria-labelledby="raids-title" className="card-col">
          <div className="section-head">
            <h2 id="raids-title">Upcoming raids</h2>
            <p>{raids.length ? `${raids.length} scheduled` : ""}</p>
          </div>
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
              const short = missing.filter((m) => m.n > 0).map((m) => `${m.n} ${m.name}`);
              const mine = signups.find((s) => s.userId === session.userId);
              return (
                <div className="g-card g-card--hud card-col" id={`raid-${r.id}`} key={r.id}>
                  <div className="row-between raid-head">
                    <div>
                      <h3>{r.title}</h3>
                      <div className="muted">
                        {formatTime(r.startsAt, r.timezone)} · <When date={r.startsAt} />
                      </div>
                    </div>
                    {r.repeatWeekly ? <span className="g-badge">Repeats weekly</span> : null}
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
                          <input type="hidden" name="at" value={`raid-${r.id}`} />
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
                  {mine ? (
                    <form action={requestAction} className="act-row">
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="rally" />
                      <input type="hidden" name="kind" value="raid_withdraw" />
                      <input type="hidden" name="eventId" value={r.id} />
                      <input type="hidden" name="at" value={`raid-${r.id}`} />
                      <span>
                        You're {mine.bench ? "on the bench" : "signed up"}{" "}
                        <span className="mono">
                          {mine.role}
                          {mine.spec ? ` · ${mine.spec}` : ""}
                        </span>
                      </span>
                      <button type="submit" className="g-btn g-btn--ghost">
                        Withdraw
                      </button>
                    </form>
                  ) : (
                    <form action={requestAction} className="act-row">
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="rally" />
                      <input type="hidden" name="kind" value="raid_signup" />
                      <input type="hidden" name="eventId" value={r.id} />
                      <input type="hidden" name="at" value={`raid-${r.id}`} />
                      <span className="g-label">Sign up</span>
                      <select
                        className="g-input g-input--sm"
                        name="role"
                        aria-label={`Your role in ${r.title}`}
                        defaultValue={open[0] ?? r.slots[0]?.name}
                      >
                        {r.slots.map((g) => (
                          <option key={g.name} value={g.name}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="g-input g-input--sm"
                        name="spec"
                        maxLength={20}
                        placeholder="Class or spec"
                        aria-label="Class or spec, optional"
                      />
                      <button type="submit" className="g-btn g-btn--secondary">
                        Sign up
                      </button>
                    </form>
                  )}
                  <Outcome
                    action={outcomeFor(RAID_KINDS, r.id)}
                    error={errorAt(query, `raid-${r.id}`)}
                  />
                  <div className="raid-foot">
                    <span className={short.length ? "muted" : "tone-go"}>
                      {seated.length} of {capacity(r.slots)} signed up.{" "}
                      {short.length ? `Still needs ${short.join(", ")}.` : "Every role is full."}
                    </span>
                    <div className="raid-foot__actions">
                      {short.length ? (
                        <form action={requestCallSignups}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="eventId" value={r.id} />
                          <input type="hidden" name="at" value={`raid-${r.id}`} />
                          <button type="submit" className="g-btn g-btn--secondary">
                            Post a call for signups
                          </button>
                        </form>
                      ) : null}
                      <details className="confirm">
                        <summary className="confirm__toggle g-btn g-btn--ghost">
                          Cancel raid…
                        </summary>
                        <form action={requestAction}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value="rally" />
                          <input type="hidden" name="kind" value="cancel_raid" />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="at" value={`raid-${r.id}`} />
                          <button type="submit" className="g-btn g-btn--danger">
                            Yes, cancel {r.title}
                          </button>
                        </form>
                      </details>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="g-card empty">
              <span className="muted">No raids scheduled.</span>
              <a className="g-btn g-btn--secondary" href="?create=1#create-raid">
                Create a raid
              </a>
            </div>
          )}
        </section>
      </div>

      <RequestsHistory kinds={KINDS} actions={allActions} />
    </>
  );
}
