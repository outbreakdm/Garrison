import {
  AVAILABILITY_LABELS,
  getCalendarToken,
  getOpsTimezone,
  listActiveMembers,
  listOpenLfg,
  listOpsForCalendar,
  listRosterCharacters,
  listSignups,
  listUpcomingOps,
} from "@garrison/db";
import type { Metadata } from "next";
import { formatTime } from "@/components/format";
import { OpsCalendar } from "@/components/OpsCalendar";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { memberSpace } from "@/lib/member";
import { AnswerForm } from "../../servers/[guildId]/rally/OrganizedRaid";
import { playRequest } from "./actions";
import { MyCharacters } from "./MyCharacters";

export const metadata: Metadata = { title: "Groups and raids" };

/**
 * For players: a server's open groups (Rally) and upcoming raids (Ops), joined or
 * signed up for from the web. Any member of the server; everyone else gets a 404.
 */
export default async function PlayPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  // Members only, checked live (shared with the layout, one check per request).
  const { session, guild } = await memberSpace(guildId);
  const db = await getDb();
  const [groups, raids, tz, flash, calendarRaids, feed] = await Promise.all([
    listOpenLfg(db, guild.id),
    listUpcomingOps(db, guild.id),
    getOpsTimezone(db, guild.id),
    readFlash(),
    listOpsForCalendar(db, guild.id, new Date(Date.now() - 14 * 86_400_000)),
    getCalendarToken(db, guild.id),
  ]);
  const feedUrl = feed ? `${env().APP_URL}/calendar/${guild.id}/${feed}.ics` : null;
  const [members, signups, myCharacters] = await Promise.all([
    Promise.all(groups.map((g) => listActiveMembers(db, g.id))),
    Promise.all(raids.slice(0, 20).map((r) => listSignups(db, r.id))),
    listRosterCharacters(db, guild.id, [session.userId]),
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
    <div className="member__page">
      <div className="page-head">
        <div>
          <h1>Groups and raids</h1>
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
              if (r.style === "organized")
                return (
                  <li key={r.id} className="gw-row">
                    <span className="gw-row__main">
                      <span className="ticket-row__topic">{r.title}</span>
                      <span className="ticket-row__who">
                        {formatTime(r.startsAt, r.timezone)} · officers pick the lineup ·{" "}
                        {
                          list.filter(
                            (x) => x.availability === "coming" || x.availability === "late",
                          ).length
                        }{" "}
                        coming
                      </span>
                    </span>
                    <span className={`g-badge ${mine ? "g-badge--go" : "g-badge--off"}`}>
                      {mine?.availability
                        ? `${AVAILABILITY_LABELS[mine.availability as "coming"]}${mine.role ? ` · ${mine.role}` : ""}`
                        : "No answer yet"}
                    </span>
                    <span className="gw-row__actions">
                      <AnswerForm
                        action={playRequest}
                        hidden={
                          <>
                            <input type="hidden" name="guildId" value={guild.id} />
                            <input type="hidden" name="kind" value="raid_answer" />
                            <input type="hidden" name="eventId" value={r.id} />
                          </>
                        }
                        raid={r}
                        mine={mine}
                        characters={myCharacters}
                      />
                    </span>
                  </li>
                );
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

      <MyCharacters guildId={guild.id} userId={me} />

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
  );
}
