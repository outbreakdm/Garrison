import {
  capacity,
  checkTemplates,
  getCalendarToken,
  getGuildPlan,
  getOpsTimezone,
  getRallyTemplates,
  listActiveMembers,
  listDashboardActions,
  listOpenLfg,
  listOpsForCalendar,
  listSignups,
  listUpcomingOps,
  memberNames,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatTime } from "@/components/format";
import { OpsCalendar } from "@/components/OpsCalendar";
import { FormPanel } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { env } from "@/lib/env";
import { ACTION_KIND, ACTION_STATUS } from "@/lib/rally-schema";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import {
  requestCallSignups,
  requestCreateRaid,
  requestMoveSignup,
  setCalendarFeed,
} from "./actions";

const QUEUED: Record<string, string> = {
  create_raid: "Queued. Garrison posts the raid in a few seconds.",
  move_signup: "Queued. Garrison moves them and updates the card.",
  call_signups: "Queued. Garrison posts the call in the raid's channel.",
  cancel_raid: "Queued. Garrison cancels the raid and updates its card.",
  close_lfg: "Queued. Garrison closes the group and updates its card.",
  create_lfg: "Queued. Garrison posts your group in a few seconds.",
  lfg_join: "Queued. Garrison adds you and updates the card.",
  lfg_leave: "Queued. Garrison takes you out and updates the card.",
  raid_signup: "Queued. Garrison signs you up and updates the card.",
  raid_withdraw: "Queued. Garrison withdraws you and updates the card.",
};
const ERRORS: Record<string, string> = {
  invalid: "Some fields weren't valid. Nothing was queued.",
  channel: "That channel isn't a text channel in this server.",
  not_found: "That raid, group or signup has changed. Refresh and try again.",
  busy: "Garrison has 10 requests waiting for this server. Try again shortly.",
  too_fast: "That's a lot of requests at once. Wait a minute and try again.",
  cooldown: "A call for signups for this raid went out in the last hour.",
};

export const metadata: Metadata = { title: "Rally" };

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
  const [posts, raids, allActions, timezone, channels, rawTemplates, plan, calendarRaids, feed] =
    await Promise.all([
      listOpenLfg(db, guild.id),
      listUpcomingOps(db, guild.id),
      listDashboardActions(db, guild.id, 30),
      getOpsTimezone(db, guild.id),
      listTextChannels(guild.id).catch(() => []),
      getRallyTemplates(db, guild.id),
      getGuildPlan(db, guild.id),
      listOpsForCalendar(db, guild.id, new Date(Date.now() - 14 * 86_400_000)),
      getCalendarToken(db, guild.id),
    ]);
  const feedUrl = feed ? `${env().APP_URL}/calendar/${guild.id}/${feed}.ics` : null;
  const checked = checkTemplates(rawTemplates, plan);
  const templates = checked.ok ? checked.value : [];
  const defaultTemplate = templates.find((t) => t.isDefault);
  const [postMembers, raidSignups] = await Promise.all([
    Promise.all(posts.map((p) => listActiveMembers(db, p.id))),
    Promise.all(raids.map((r) => listSignups(db, r.id))),
  ]);
  const names = await memberNames(db, guild.id, [
    ...raidSignups.flat().map((s) => s.userId),
    ...postMembers.flat().map((m) => m.userId),
  ]);
  const nameOf = (id: string) => names.get(id) ?? `Member ${id.slice(-4)}`;
  // Only what was asked from this page: moderation and builds show on their own pages.
  const recent = allActions.filter((a) => a.kind in QUEUED).slice(0, 8);
  const working = recent.some((a) => a.status === "pending" || a.status === "running");
  const queued = typeof query.queued === "string" ? QUEUED[query.queued] : undefined;
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rally and Ops</h1>
          <p>
            Post groups, schedule raids, and join or sign up without leaving the dashboard. Members
            without Manage Server join on the <a href={`/play/${guild.id}`}>player page</a>.
          </p>
        </div>
        <div className="row-between">
          <a className="g-btn g-btn--secondary" href={`/servers/${guild.id}/rally/templates`}>
            LFG templates
          </a>
          <a className="g-btn g-btn--secondary" href="?post=1#post-group">
            Post a group
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

      <FormPanel
        id="post-group"
        title="Post a group"
        hint="Goes up in Discord as you, with Join buttons."
        open={query.post === "1"}
      >
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
      </FormPanel>
      <FormPanel
        id="create-raid"
        title="Create raid"
        hint={`A signup card with role caps and a bench, in ${timezone}.`}
        open={query.create === "1"}
      >
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
            Garrison posts it as you, with a signup card, in the time zone set in Settings. You must
            be able to post in that channel yourself.
          </p>
          <button type="submit" className="g-btn g-btn--primary">
            Create raid
          </button>
        </form>
      </FormPanel>
      <div className="rally-board">
        <section aria-labelledby="open-groups" className="block">
          <h2 className="block-title" id="open-groups">
            Open groups <span className="count">{posts.length}</span>
          </h2>
          {posts.length ? (
            posts.map((p, i) => {
              const members = postMembers[i] ?? [];
              const total = capacity(p.slots);
              const mineHere = members.find((m) => m.userId === session.userId);
              const roleGroups = p.slots.length > 1 || Boolean(p.slots[0]?.name);
              const openRoles = p.slots.filter(
                (s) => members.filter((m) => m.slotName === s.name).length < s.count,
              );
              return (
                <article className="g-card lfg" key={p.id} aria-label={p.title}>
                  <div className="lfg__head">
                    <div>
                      <h3 className="card-title">{p.title}</h3>
                      <div className="lfg__meta">
                        {p.note ? `${p.note} · ` : ""}
                        {formatTime(p.startsAt)}
                      </div>
                    </div>
                    <span
                      className={`g-badge ${p.status === "full" ? "g-badge--go" : "g-badge--accent"}`}
                    >
                      {p.status === "full"
                        ? "Full"
                        : total - members.length === 1
                          ? "1 left"
                          : `${total - members.length} open`}
                    </span>
                  </div>
                  <ul className="seats" aria-label={`${members.length} of ${total} seats taken`}>
                    {p.slots.map((s) => {
                      const inRole = roleGroups
                        ? members.filter((m) => m.slotName === s.name)
                        : members;
                      const open = Math.max(0, s.count - inRole.length);
                      return (
                        <li className="seat-row" key={s.name || "seats"}>
                          <span className="g-label">{s.name || "Squad"}</span>
                          <span className="seat-chips">
                            {inRole.slice(0, 10).map((m) => (
                              <span
                                className={`seat ${m.userId === session.userId ? "seat--you" : ""}`}
                                key={m.userId}
                              >
                                <span className="seat__mark" aria-hidden="true">
                                  {(
                                    nameOf(m.userId).match(/[\p{L}\p{N}]/u)?.[0] ?? "?"
                                  ).toUpperCase()}
                                </span>
                                <span className="seat__name">
                                  {m.userId === session.userId ? "You" : nameOf(m.userId)}
                                </span>
                              </span>
                            ))}
                            {open ? (
                              <span className="seat seat--open">
                                {open === 1 ? "1 open" : `${open} open`}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="lfg__actions">
                    {mineHere ? (
                      <form action={requestAction} className="act-row">
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="rally" />
                        <input type="hidden" name="kind" value="lfg_leave" />
                        <input type="hidden" name="id" value={p.id} />
                        <span className="you-line">
                          You're in
                          {roleGroups && mineHere.slotName ? ` as ${mineHere.slotName}` : ""}
                        </span>
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
                        {roleGroups ? (
                          <select
                            className="g-input g-input--sm"
                            name="role"
                            aria-label={`Role in ${p.title}`}
                            defaultValue={openRoles[0]?.name}
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
                        <button type="submit" className="g-btn g-btn--primary">
                          Join
                        </button>
                      </form>
                    ) : (
                      <span className="muted">This group is full.</span>
                    )}
                    <form action={requestAction}>
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="rally" />
                      <input type="hidden" name="kind" value="close_lfg" />
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="g-btn g-btn--ghost">
                        Close group
                      </button>
                    </form>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="g-card empty-block">
              <p>No open groups right now.</p>
              <a className="g-btn g-btn--secondary" href="?post=1#post-group">
                Post a group
              </a>
            </div>
          )}
        </section>
        <section aria-labelledby="upcoming-raids" className="block">
          <h2 className="block-title" id="upcoming-raids">
            Upcoming raids <span className="count">{raids.length}</span>
          </h2>
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
              const mine = signups.find((s) => s.userId === session.userId);
              return (
                <article className="g-card g-card--hud card-col" key={r.id} aria-label={r.title}>
                  <div className="lfg__head">
                    <div>
                      <h3 className="card-title">{r.title}</h3>
                      <div className="raid-card__when">
                        <span className="mono">{formatTime(r.startsAt, r.timezone)}</span>
                        {r.repeatWeekly ? <span className="g-badge">Weekly</span> : null}
                      </div>
                      {r.note ? <p className="card-sub">{r.note}</p> : null}
                    </div>
                    <span
                      className={`g-badge ${short.length ? "g-badge--caution" : "g-badge--go"}`}
                    >
                      {short.length
                        ? `${missing.reduce((t, m) => t + Math.max(0, m.n), 0)} short`
                        : "Ready"}
                    </span>
                  </div>
                  <div className="roster">
                    {r.slots.map((g) => {
                      const inRole = seated.filter((x) => x.role === g.name);
                      const tone =
                        inRole.length >= g.count ? "tone-go" : inRole.length ? "tone-caution" : "";
                      return (
                        <div className="roster__col" key={g.name}>
                          <div className="roster__head">
                            <span className="g-label">{g.name}</span>
                            <span className={`mono ${tone}`}>
                              {inRole.length} / {g.count}
                            </span>
                          </div>
                          {inRole.slice(0, 6).map((x) => (
                            <div
                              className={`roster__slot ${x.userId === session.userId ? "roster__slot--you" : ""}`}
                              key={x.userId}
                            >
                              <span>{x.userId === session.userId ? "You" : nameOf(x.userId)}</span>
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
                  {mine ? (
                    <form action={requestAction} className="act-row raid-signup">
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="rally" />
                      <input type="hidden" name="kind" value="raid_withdraw" />
                      <input type="hidden" name="eventId" value={r.id} />
                      <span className="you-line">
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
                    <form action={requestAction} className="act-row raid-signup">
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="rally" />
                      <input type="hidden" name="kind" value="raid_signup" />
                      <input type="hidden" name="eventId" value={r.id} />
                      <span className="g-label">Sign up as</span>
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
                      <button type="submit" className="g-btn g-btn--primary">
                        Sign up
                      </button>
                    </form>
                  )}
                  <div className="row-between raid-foot">
                    <span className="mono">
                      {seated.length} / {capacity(r.slots)} signed up
                      {bench.length ? ` · ${bench.length} on the bench` : ""}
                    </span>
                    <details className="confirm">
                      <summary className="confirm__toggle g-btn g-btn--ghost">Cancel raid…</summary>
                      <form action={requestAction}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="rally" />
                        <input type="hidden" name="kind" value="cancel_raid" />
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="g-btn g-btn--danger">
                          Yes, cancel {r.title}
                        </button>
                      </form>
                    </details>
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
                </article>
              );
            })
          ) : (
            <div className="g-card empty-block">
              <p>No raids scheduled.</p>
              <a className="g-btn g-btn--secondary" href="?create=1#create-raid">
                Create a raid
              </a>
            </div>
          )}
        </section>
      </div>

      <section className="g-card card-col" id="calendar" aria-labelledby="calendar-title">
        <div className="queue__head">
          <h2 className="card-title" id="calendar-title">
            Calendar
          </h2>
          <span className="g-help">Times in {timezone}</span>
        </div>
        <OpsCalendar raids={calendarRaids} timeZone={timezone} />
        <div className="card-col">
          <h3 className="field-label">Calendar feed</h3>
          {feedUrl ? (
            <>
              <p className="g-help">
                Add this link in Google Calendar (Other calendars → From URL), Outlook or Apple
                Calendar, and raids show up there. Anyone with the link sees raid names, times and
                notes, not who signed up. Members see it on the{" "}
                <a href={`/play/${guild.id}`}>player page</a>.
              </p>
              <input
                className="g-input mono"
                readOnly
                value={feedUrl}
                aria-label="Calendar feed link"
              />
              <div className="row-between">
                <form action={setCalendarFeed}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                    New link
                  </button>
                </form>
                <form action={setCalendarFeed}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="feed" value="off" />
                  <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                    Turn off
                  </button>
                </form>
              </div>
              <p className="g-help">A new link stops the old one working.</p>
            </>
          ) : (
            <form action={setCalendarFeed} className="row-between">
              <input type="hidden" name="guildId" value={guild.id} />
              <p className="g-help">
                A link calendar apps can subscribe to, so raids show up next to everything else.
              </p>
              <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                Make a link
              </button>
            </form>
          )}
        </div>
      </section>

      {recent.length ? (
        <div className="g-card table-card">
          <div className="table-card__head row-between">
            <h2 className="card-title">Recent requests</h2>
            <span className="g-help">Garrison does these in Discord, usually within seconds.</span>
          </div>
          <div className="table-wrap">
            <table className="g-table">
              <tbody>
                {recent.map((a) => {
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
