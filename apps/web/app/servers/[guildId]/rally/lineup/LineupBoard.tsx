"use client";

import { checkGroups, fillByRole, LINEUP_LIMITS, type Placement } from "@garrison/db/cards";
import { type DragEvent, useState } from "react";

export interface LineupPlayer {
  userId: string;
  name: string;
  role: string;
  character: string | null;
  availability: string;
}

type Where = Placement;
const keyOf = (w: Where) => (w === null ? "pool" : w === "bench" ? "bench" : `g${w}`);

/**
 * The lineup board: members who answered, dragged (or moved with each one's menu, which also
 * works on phones and keyboards) into a group, onto the bench, or back to Not placed. Fill by
 * role does a first pass. Saving sends the whole board; the server checks it again.
 */
export function LineupBoard({
  guildId,
  eventId,
  players,
  slots,
  initialGroups,
  initialPlaces,
  canEdit,
  save,
}: {
  guildId: string;
  eventId: string;
  players: LineupPlayer[];
  slots: { name: string; count: number }[];
  initialGroups: { count: number; size: number };
  initialPlaces: Record<string, Where>;
  canEdit: boolean;
  save: (form: FormData) => Promise<void>;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [places, setPlaces] = useState<Record<string, Where>>(initialPlaces);
  const [dragging, setDragging] = useState<string | null>(null);
  const answered = players.filter((p) => p.availability !== "cant");
  const cant = players.filter((p) => p.availability === "cant");

  const placeOf = (userId: string): Where => {
    const w = places[userId] ?? null;
    return typeof w === "number" && w > groups.count ? null : w;
  };
  const inPlace = (w: Where) => answered.filter((p) => placeOf(p.userId) === w);
  const move = (userId: string, w: Where) => {
    if (typeof w === "number" && inPlace(w).length >= groups.size && placeOf(userId) !== w) return;
    setPlaces((prev) => ({ ...prev, [userId]: w }));
  };
  const fill = () =>
    setPlaces(
      Object.fromEntries(
        fillByRole(
          answered.map((p) => ({ userId: p.userId, role: p.role, availability: p.availability })),
          slots,
          groups,
        ),
      ),
    );
  const sent = JSON.stringify(
    Object.fromEntries(answered.map((p) => [p.userId, placeOf(p.userId)])),
  );

  const drop = (w: Where) => (e: DragEvent) => {
    e.preventDefault();
    const userId = e.dataTransfer.getData("text/plain") || dragging;
    if (userId) move(userId, w);
    setDragging(null);
  };
  const zones: { where: Where; title: string }[] = [
    { where: null, title: "Not placed" },
    ...Array.from({ length: groups.count }, (_, i) => ({ where: i + 1, title: `Group ${i + 1}` })),
    { where: "bench", title: "Bench" },
  ];

  const chip = (p: LineupPlayer) => (
    <li
      key={p.userId}
      className={`lineup-chip${dragging === p.userId ? " lineup-chip--drag" : ""}`}
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", p.userId);
        setDragging(p.userId);
      }}
      onDragEnd={() => setDragging(null)}
    >
      <span className="lineup-chip__who">
        <strong>{p.name}</strong>
        {p.availability !== "coming" ? (
          <span className="g-badge g-badge--caution">{p.availability}</span>
        ) : null}
      </span>
      <span className="lineup-chip__what muted">
        {[p.character, p.role].filter(Boolean).join(" · ")}
      </span>
      {canEdit ? (
        <select
          className="g-input g-input--sm"
          aria-label={`Move ${p.name}`}
          value={keyOf(placeOf(p.userId))}
          onChange={(e) => {
            const v = e.target.value;
            move(p.userId, v === "pool" ? null : v === "bench" ? "bench" : Number(v.slice(1)));
          }}
        >
          {zones.map((z) => (
            <option key={keyOf(z.where)} value={keyOf(z.where)}>
              {z.title}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );

  return (
    <form action={save} className="card-col">
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="places" value={sent} />
      <div className="lineup-tools">
        <label className="g-field">
          <span>Groups</span>
          <input
            className="g-input"
            name="count"
            type="number"
            min={1}
            max={LINEUP_LIMITS.groups}
            value={groups.count}
            disabled={!canEdit}
            onChange={(e) => {
              const next = checkGroups({ count: e.target.value, size: groups.size });
              if (next) setGroups(next);
            }}
          />
        </label>
        <label className="g-field">
          <span>Players in each</span>
          <input
            className="g-input"
            name="size"
            type="number"
            min={1}
            max={LINEUP_LIMITS.size}
            value={groups.size}
            disabled={!canEdit}
            onChange={(e) => {
              const next = checkGroups({ count: groups.count, size: e.target.value });
              if (next) setGroups(next);
            }}
          />
        </label>
        {canEdit ? (
          <div className="lineup-tools__buttons">
            <button type="button" className="g-btn g-btn--secondary" onClick={fill}>
              Fill by role
            </button>
            <button type="button" className="g-btn g-btn--ghost" onClick={() => setPlaces({})}>
              Clear
            </button>
            <button type="submit" className="g-btn g-btn--secondary">
              Save lineup
            </button>
            <button type="submit" name="post" value="1" className="g-btn g-btn--primary">
              Save and post
            </button>
          </div>
        ) : null}
      </div>
      <p className="g-help">
        Drag people between columns, or use the menu under each name. Fill by role puts Coming
        first, then Late, then Tentative, up to each role's count, and spreads each role across the
        groups. Save and post shows the groups on the raid's card and pings the players picked;
        anyone not in a group sits on the bench.
      </p>
      <div className="lineup-board">
        {zones.map((z) => {
          const here = inPlace(z.where);
          const roles = slots
            .map((s) => ({ name: s.name, n: here.filter((p) => p.role === s.name).length }))
            .filter((r) => r.n);
          return (
            <section
              key={keyOf(z.where)}
              className={`lineup-zone${typeof z.where === "number" ? "" : " lineup-zone--side"}`}
              aria-label={z.title}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={drop(z.where)}
            >
              <div className="row-between lineup-zone__head">
                <span className="g-label">{z.title}</span>
                <span className="mono">
                  {here.length}
                  {typeof z.where === "number" ? ` / ${groups.size}` : ""}
                </span>
              </div>
              {roles.length ? (
                <span className="g-help">{roles.map((r) => `${r.n} ${r.name}`).join(" · ")}</span>
              ) : null}
              <ul className="lineup-zone__list">{here.map(chip)}</ul>
            </section>
          );
        })}
      </div>
      {cant.length ? (
        <p className="g-help">Can't make it: {cant.map((p) => p.name).join(", ")}.</p>
      ) : null}
    </form>
  );
}
