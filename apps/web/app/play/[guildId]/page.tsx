import {
  getActiveGuild,
  getCalendarToken,
  getOpsTimezone,
  listActiveMembers,
  listOpenLfg,
  listOpsForCalendar,
  listSignups,
  listUpcomingOps,
} from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatTime } from "@/components/format";
import { OpsCalendar } from "@/components/OpsCalendar";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { isGuildMember } from "@/lib/discord";
import { env } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import { playRequest } from "./actions";

export const metadata: Metadata = { title: "Groups and raids" };

/**
 * For players: a server's open groups (Rally) and upcoming raids (Ops), joined or
 * signed up for from the web. Any member of the server; everyone else gets a 404.
 */
export default async function PlayPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (!isSnowflake(guildId)) notFound();
  const session = await requireSession(`/play/${guildId}`);
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  if (!guild || !(await isGuildMember(guild.id, session.userId))) notFound();
  const [groups, raids, tz, flash, calendarRaids, feed] = await Promise.all([
    listOpenLfg(db, guild.id),
    listUpcomingOps(db, guild.id),
    getOpsTimezone(db, guild.id),
    readFlash(),
    listOpsForCalendar(db, guild.id, new Date(Date.now() - 14 * 86_400_000)),
    getCalendarToken(db, guild.id),
  ]);
  const feedUrl = feed ? `${env().APP_URL}/calendar/${guild.id}/${feed}.ics` : null;
  const [members, signups] = await Promise.all([
    Promise.all(groups.map((g) => listActiveMembers(db, g.id))),
    Promise.all(raids.slice(0, 20).map((r) => listSignups(db, r.id))),
  ]);
  const me = session.userId;
  const hidden = (kind: string, id: string) => (
    <>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
    </>
  );

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back={`/play/${guild.id}`} />
      <main className="shell">
        <div className="main">
          <div className="page-head">
            <div>
              <h1>{guild.name}: groups and raids</h1>
              <p>Join a group or sign up for a raid here; Garrison updates the cards in Discord.</p>
            </div>
          </div>
          {flash?.ok ? (
            <div className="notice notice--ok" role="status">
              {flash.ok}
            </div>
          ) : null}
          {flash?.error ? (
            <div className="notice" role="alert">
              {flash.error}
            </div>
          ) : null}

          <section className="g-card queue" aria-labelledby="groups-title">
            <h2 className="card-title" id="groups-title">
              Open groups <span className="count">{groups.length}</span>
            </h2>
            {groups.length ? (
              <ul className="queue__list">
                {groups.map((g, i) => {
                  const here = members[i] ?? [];
                  const mine = here.find((m) => m.userId === me);
                  return (
                    <li key={g.id} className="gw-row">
                      <span className="gw-row__main">
                        <span className="ticket-row__topic">{g.title}</span>
                        <span className="ticket-row__who">
                          {formatTime(g.startsAt, tz)} ·{" "}
                          {g.slots
                            .map(
                              (s) =>
                                `${s.name || "Players"} ${here.filter((m) => m.slotName === s.name).length}/${s.count}`,
                            )
                            .join(" · ")}
                        </span>
                      </span>
                      <span
                        className={`g-badge ${g.status === "full" ? "g-badge--off" : "g-badge--go"}`}
                      >
                        {mine ? "You're in" : g.status === "full" ? "Full" : "Open"}
                      </span>
                      <span className="gw-row__actions">
                        {mine ? (
                          <form action={playRequest}>
                            {hidden("lfg_leave", g.id)}
                            <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                              Leave
                            </button>
                          </form>
                        ) : g.status === "open" ? (
                          <form action={playRequest} className="row-between">
                            {hidden("lfg_join", g.id)}
                            <select className="g-input g-input--sm" name="role" aria-label="Role">
                              {g.slots.map((s) => (
                                <option key={s.name} value={s.name}>
                                  {s.name || "Player"}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                              Join
                            </button>
                          </form>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="queue__empty muted">No open groups. Post one with /lfg in Discord.</p>
            )}
          </section>

          <section className="g-card queue" aria-labelledby="raids-title">
            <h2 className="card-title" id="raids-title">
              Upcoming raids <span className="count">{raids.length}</span>
            </h2>
            {raids.length ? (
              <ul className="queue__list">
                {raids.slice(0, 20).map((r, i) => {
                  const list = signups[i] ?? [];
                  const mine = list.find((s) => s.userId === me);
                  return (
                    <li key={r.id} className="gw-row">
                      <span className="gw-row__main">
                        <span className="ticket-row__topic">{r.title}</span>
                        <span className="ticket-row__who">
                          {formatTime(r.startsAt, r.timezone)} ·{" "}
                          {r.slots
                            .map(
                              (s) =>
                                `${s.name} ${list.filter((x) => x.role === s.name && !x.bench).length}/${s.count}`,
                            )
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={`g-badge ${mine ? "g-badge--go" : "g-badge--off"}`}>
                        {mine ? (mine.bench ? `Bench · ${mine.role}` : mine.role) : "Not signed up"}
                      </span>
                      <span className="gw-row__actions">
                        <form action={playRequest} className="row-between">
                          {hidden("raid_signup", r.id)}
                          <select
                            className="g-input g-input--sm"
                            name="role"
                            aria-label="Role"
                            defaultValue={mine?.role}
                          >
                            {r.slots.map((s) => (
                              <option key={s.name} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                            {mine ? "Switch" : "Sign up"}
                          </button>
                        </form>
                        {mine ? (
                          <form action={playRequest}>
                            {hidden("raid_withdraw", r.id)}
                            <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                              Leave
                            </button>
                          </form>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="queue__empty muted">No raids scheduled.</p>
            )}
          </section>

          <section className="g-card card-col" aria-labelledby="calendar-title">
            <div className="queue__head">
              <h2 className="card-title" id="calendar-title">
                Calendar
              </h2>
              {feedUrl ? (
                <a
                  className="g-btn g-btn--secondary g-btn--sm"
                  href={feedUrl.replace(/^https?:/, "webcal:")}
                >
                  Add to your calendar
                </a>
              ) : null}
            </div>
            <OpsCalendar raids={calendarRaids} timeZone={tz} />
            {feedUrl ? (
              <p className="g-help">
                Or paste this link into Google Calendar (Other calendars → From URL):{" "}
                <span className="mono">{feedUrl}</span>
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}
