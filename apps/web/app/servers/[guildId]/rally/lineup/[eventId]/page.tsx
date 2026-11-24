import {
  defaultGroups,
  getOpsEvent,
  isRosterGame,
  listLineupLayouts,
  listRosterMembers,
  listRosterTeams,
  listSignups,
  memberNames,
  type Placement,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import {
  applyLayoutAction,
  deleteLayoutAction,
  saveLayoutAction,
  saveLineupAction,
} from "../actions";
import { LineupBoard, type LineupPlayer } from "../LineupBoard";

export const metadata: Metadata = { title: "Lineup" };

/**
 * An organized raid's lineup: officers put the members who answered into groups or on the
 * bench, save lineups to reuse, and post it to the raid's card. Viewers see it; editors change it.
 */
export default async function LineupPage({
  params,
}: {
  params: Promise<{ guildId: string; eventId: string }>;
}) {
  const { guildId, eventId } = await params;
  const { guild, role } = await requireGuildAccess(guildId);
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const db = await getDb();
  const event = await getOpsEvent(db, guild.id, eventId);
  if (!event || event.style !== "organized") notFound();
  const [signups, teams, layouts, flash] = await Promise.all([
    listSignups(db, event.id),
    listRosterTeams(db, guild.id),
    listLineupLayouts(db, guild.id),
    readFlash(),
  ]);
  const team = teams.find((t) => t.id === event.teamId) ?? null;
  const [names, members] = await Promise.all([
    memberNames(
      db,
      guild.id,
      signups.map((s) => s.userId),
    ),
    team ? listRosterMembers(db, guild.id, [team.id]) : Promise.resolve([]),
  ]);
  const nameOf = (id: string) =>
    names.get(id) ??
    members.find((m) => m.userId === id && m.username)?.username ??
    `Member ${id.slice(-4)}`;
  const groups =
    event.groups ?? defaultGroups(event.slots, team && isRosterGame(team.game) ? team.game : null);
  const players: LineupPlayer[] = signups
    .filter((s) => s.availability)
    .map((s) => ({
      userId: s.userId,
      name: nameOf(s.userId),
      role: s.role,
      character: s.spec,
      availability: s.availability ?? "coming",
    }));
  const places: Record<string, Placement> = Object.fromEntries(
    signups.map((s) => [
      s.userId,
      s.groupNo ?? (s.bench && s.availability !== "cant" ? "bench" : null),
    ]),
  );
  const canEdit = role !== "viewer" && event.status === "scheduled";
  const hidden = (
    <>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="eventId" value={event.id} />
    </>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="g-help">
            <Link href={`/servers/${guild.id}/rally?tab=raids`}>Raids</Link> /
          </p>
          <h1>Lineup · {event.title}</h1>
          <p>
            {formatTime(event.startsAt, event.timezone)}
            {team ? ` · ${team.name}` : ""}
            {event.lineupPostedAt
              ? " · posted: changes show on the card when you post again"
              : " · not posted yet"}
          </p>
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
      {players.length ? (
        <LineupBoard
          guildId={guild.id}
          eventId={event.id}
          players={players}
          slots={event.slots}
          initialGroups={groups}
          initialPlaces={places}
          canEdit={canEdit}
          save={saveLineupAction}
        />
      ) : (
        <p className="g-card muted">
          Nobody has answered yet. The lineup fills in as people answer.
        </p>
      )}

      {canEdit ? (
        <section className="g-card card-col" aria-labelledby="layouts-title">
          <h2 className="card-title" id="layouts-title">
            Saved lineups
          </h2>
          <p className="g-help">
            Save this raid's lineup to use again: each member goes back to their group. Save the
            board first.
          </p>
          <form action={saveLayoutAction} className="roster-member__form">
            {hidden}
            <label className="g-field">
              <span>Name</span>
              <input
                className="g-input"
                name="name"
                maxLength={40}
                required
                placeholder="Farm night"
              />
            </label>
            <span />
            <button type="submit" className="g-btn g-btn--secondary">
              Save as a lineup
            </button>
          </form>
          {layouts.map((l) => (
            <div className="row-between" key={l.id}>
              <span>
                <strong>{l.name}</strong>{" "}
                <span className="muted">
                  {l.groups.count} groups of {l.groups.size} · {l.places.length} people
                </span>
              </span>
              <span className="act-row">
                <form action={applyLayoutAction}>
                  {hidden}
                  <input type="hidden" name="layoutId" value={l.id} />
                  <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                    Use it
                  </button>
                </form>
                <form action={deleteLayoutAction}>
                  {hidden}
                  <input type="hidden" name="layoutId" value={l.id} />
                  <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                    Delete
                  </button>
                </form>
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
