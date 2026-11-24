import {
  attendanceTracked,
  describeCharacter,
  entitlements,
  FEATURES,
  getGuildPlan,
  isRosterGame,
  listRosterCharacters,
  listRosterMembers,
  listRosterTeams,
  memberNames,
  ROSTER_GAMES,
  ROSTER_NOTE_MAX,
  ROSTER_STATUS_LABELS,
  ROSTER_STATUSES,
  type RosterCharacter,
  rosterAttendance,
  rosterCandidates,
  STANDARD_ROLES,
  WOW_CLASSES,
} from "@garrison/db";
import { ProTag } from "@/components/cards/CardEditor";
import { EmptyState } from "@/components/EmptyState";
import { getDb } from "@/lib/db";
import { searchMembers } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import {
  addCharacter,
  addMember,
  createTeam,
  removeCharacter,
  removeMember,
  removeTeam,
  saveCharacter,
  saveMember,
  saveTeam,
} from "./roster-actions";

const WOW_SPECS = [...new Set(Object.values(WOW_CLASSES).flatMap((s) => Object.keys(s)))].sort();

/** A character's fields, as inputs (class and spec suggest the game's names when it has a preset). */
function CharacterFields({ c }: { c?: RosterCharacter }) {
  return (
    <>
      <label className="g-field">
        <span>Name</span>
        <input className="g-input" name="name" maxLength={32} required defaultValue={c?.name} />
      </label>
      <label className="g-field">
        <span>Class</span>
        <input
          className="g-input"
          name="className"
          maxLength={24}
          list="roster-classes"
          defaultValue={c?.className ?? ""}
        />
      </label>
      <label className="g-field">
        <span>Spec</span>
        <input
          className="g-input"
          name="spec"
          maxLength={24}
          list="roster-specs"
          defaultValue={c?.spec ?? ""}
        />
      </label>
      <label className="g-field">
        <span>Role</span>
        <input
          className="g-input"
          name="role"
          maxLength={20}
          list="roster-roles"
          placeholder="From the spec"
          defaultValue={c?.role ?? ""}
        />
      </label>
    </>
  );
}

/**
 * The Roster tab of Groups and raids: teams, who is on each and where they stand, and their
 * characters. The page around it has already checked access; every change re-checks it.
 */
export async function RosterTab({ guildId, find }: { guildId: string; find: string }) {
  const db = await getDb();
  const [teams, plan, candidates, tracking, found] = await Promise.all([
    listRosterTeams(db, guildId),
    getGuildPlan(db, guildId),
    rosterCandidates(db, guildId),
    attendanceTracked(db, guildId),
    find ? searchMembers(guildId, find).catch(() => null) : Promise.resolve([]),
  ]);
  const ent = entitlements(plan);
  const limit = ent["roster.teams"];
  const members = await listRosterMembers(
    db,
    guildId,
    teams.map((t) => t.id),
  );
  const userIds = [...new Set([...members.map((m) => m.userId), ...candidates.keys()])];
  const [characters, names, attendance] = await Promise.all([
    listRosterCharacters(db, guildId, userIds),
    memberNames(db, guildId, userIds),
    ent["roster.attendance"] && tracking
      ? rosterAttendance(db, guildId, userIds, new Date(Date.now() - 90 * 86_400_000))
      : new Map<string, { shown: number; total: number }>(),
  ]);
  const flash = await readFlash();
  const wow = teams.some((t) => isRosterGame(t.game));
  const nameOf = (userId: string) =>
    members.find((m) => m.userId === userId && m.username)?.username ||
    candidates.get(userId) ||
    names.get(userId) ||
    `Member ${userId.slice(-4)}`;
  const charactersOf = (userId: string) => characters.filter((c) => c.userId === userId);
  const full = teams.length >= limit;

  return (
    <>
      <div className="list-head">
        <p className="g-help">
          Teams for your raids: who's on each, where they stand, and the characters they bring.
          Members add their own with /roster add or on the player page.
        </p>
        <span className="list-head__count">
          {teams.length} of {limit} {limit === 1 ? "team" : "teams"}
        </span>
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
      {teams.length > limit ? (
        <div className="notice" role="alert">
          This server has {teams.length} teams, but its plan includes {limit}. They all still work;
          new ones can't be added until you remove some or upgrade.
        </div>
      ) : null}

      <datalist id="roster-classes">
        {wow ? Object.keys(WOW_CLASSES).map((c) => <option key={c} value={c} />) : null}
      </datalist>
      <datalist id="roster-specs">
        {wow ? WOW_SPECS.map((s) => <option key={s} value={s} />) : null}
      </datalist>
      <datalist id="roster-roles">
        {STANDARD_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <form action={createTeam} className="g-card card-col">
        <input type="hidden" name="guildId" value={guildId} />
        <h2 className="card-title">Add a team {plan === "free" ? <ProTag on={false} /> : null}</h2>
        <div className="field-row">
          <label className="g-field">
            <span>Name</span>
            <input
              className="g-input"
              name="name"
              maxLength={32}
              required
              placeholder="Main raid"
            />
          </label>
          <label className="g-field">
            <span>Game</span>
            <select className="g-input" name="game" defaultValue="">
              <option value="">Any game</option>
              {Object.entries(ROSTER_GAMES).map(([key, g]) => (
                <option key={key} value={key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="g-help">
          A game adds its classes and specs, and each spec's role.
          {plan === "free"
            ? ` Free servers get ${FEATURES["roster.teams"].free} team; Garrison Pro gets ${FEATURES["roster.teams"].pro} and each member's attendance on the roster.`
            : ""}
        </p>
        <button type="submit" className="g-btn g-btn--primary" disabled={full}>
          {full ? `${limit} of ${limit} ${limit === 1 ? "team" : "teams"} used` : "Add team"}
        </button>
      </form>

      {teams.length ? (
        <section className="g-card card-col" id="roster-find" aria-labelledby="roster-find-title">
          <h2 className="card-title" id="roster-find-title">
            Find a member
          </h2>
          <search>
            <form className="side-search" method="get" action="#roster-find">
              <input type="hidden" name="tab" value="roster" />
              <label className="sr-only" htmlFor="roster-find-input">
                Member name or user ID
              </label>
              <input
                id="roster-find-input"
                className="g-input"
                name="find"
                type="search"
                maxLength={32}
                required
                placeholder="Name or user ID"
                defaultValue={find}
              />
              <button type="submit" className="g-btn g-btn--secondary">
                Find
              </button>
            </form>
          </search>
          {find ? (
            found === null ? (
              <span className="notice" role="alert">
                Discord didn't answer. Try again in a moment.
              </span>
            ) : found.filter((m) => !m.bot).length ? (
              <ul className="adjust-list">
                {found
                  .filter((m) => !m.bot)
                  .slice(0, 5)
                  .map((m) => (
                    <li key={m.id}>
                      <span className="adjust-list__who">{m.name}</span>
                      <form action={addMember} className="adjust-list__form">
                        <input type="hidden" name="guildId" value={guildId} />
                        <input type="hidden" name="userId" value={m.id} />
                        <select
                          className="g-input g-input--sm"
                          name="teamId"
                          aria-label={`Team for ${m.name}`}
                        >
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="g-input g-input--sm"
                          name="status"
                          defaultValue="core"
                          aria-label={`Status for ${m.name}`}
                        >
                          {ROSTER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {ROSTER_STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                          Add
                        </button>
                      </form>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted">Nobody's name starts with “{find}”.</p>
            )
          ) : (
            <p className="g-help">
              Put anyone in the server on a team, even before they've raided or added a character.
            </p>
          )}
        </section>
      ) : null}

      {teams.length === 0 ? (
        <EmptyState mark="raids" title="No teams yet">
          Add your raid team, then put people on it. Anyone who has signed up for a raid or added a
          character can be added.
        </EmptyState>
      ) : null}

      {teams.map((team) => {
        const onTeam = members.filter((m) => m.teamId === team.id);
        const addable = [...candidates.keys()]
          .filter((id) => !onTeam.some((m) => m.userId === id))
          .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        return (
          <section
            className="g-card card-col roster-team"
            id={`team-${team.id}`}
            key={`${team.id}-${contentKey(team)}`}
            aria-labelledby={`team-title-${team.id}`}
          >
            <div className="row-between">
              <h2 className="card-title" id={`team-title-${team.id}`}>
                {team.name}{" "}
                {isRosterGame(team.game) ? (
                  <span className="g-badge">{ROSTER_GAMES[team.game].label}</span>
                ) : null}
              </h2>
              <span className="mono">
                {onTeam.length} {onTeam.length === 1 ? "member" : "members"}
              </span>
            </div>

            {onTeam.length === 0 ? (
              <p className="g-help">Nobody on this team yet. Add people below.</p>
            ) : null}
            {ROSTER_STATUSES.map((status) => {
              const rows = onTeam.filter((m) => m.status === status);
              if (!rows.length) return null;
              return (
                <div className="card-col" key={status}>
                  <span className="g-label">
                    {ROSTER_STATUS_LABELS[status]} · {rows.length}
                  </span>
                  {rows.map((m) => {
                    const chars = charactersOf(m.userId);
                    const main = chars.find((c) => c.main);
                    const seen = attendance.get(m.userId);
                    const anchor = `member-${team.id}-${m.userId}`;
                    return (
                      <details
                        className="roster-member"
                        id={anchor}
                        key={`${m.userId}-${contentKey(m)}-${contentKey(chars)}`}
                      >
                        <summary className="row-between">
                          <span>
                            <strong>{nameOf(m.userId)}</strong>{" "}
                            <span className="muted">
                              {main ? describeCharacter(main) : "No characters yet"}
                              {chars.length > 1
                                ? ` · ${chars.length - 1} ${chars.length === 2 ? "alt" : "alts"}`
                                : ""}
                            </span>
                            {m.note ? <span className="g-badge">Note</span> : null}
                          </span>
                          {seen ? (
                            <span className="mono" title="Raids seated for in the last 90 days">
                              {seen.shown}/{seen.total} raids
                            </span>
                          ) : null}
                        </summary>
                        <div className="card-col roster-member__body">
                          <form action={saveMember} className="roster-member__form">
                            <input type="hidden" name="guildId" value={guildId} />
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <label className="g-field">
                              <span>Status</span>
                              <select className="g-input" name="status" defaultValue={m.status}>
                                {ROSTER_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {ROSTER_STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="g-field roster-member__note">
                              <span>Officer note (members never see it)</span>
                              <input
                                className="g-input"
                                name="note"
                                maxLength={ROSTER_NOTE_MAX}
                                defaultValue={m.note ?? ""}
                              />
                            </label>
                            <button type="submit" className="g-btn g-btn--secondary">
                              Save
                            </button>
                          </form>

                          <span className="g-label">Characters · {chars.length}</span>
                          {chars.map((c) => (
                            <div className="char-row" key={`${c.id}-${contentKey(c)}`}>
                              <form action={saveCharacter} className="char-row__form">
                                <input type="hidden" name="guildId" value={guildId} />
                                <input type="hidden" name="characterId" value={c.id} />
                                <input type="hidden" name="anchor" value={anchor} />
                                <div className="char-row__fields">
                                  <CharacterFields c={c} />
                                </div>
                                <div className="char-row__actions">
                                  <label className="check">
                                    <input type="checkbox" name="main" defaultChecked={c.main} />
                                    <span>Main</span>
                                  </label>
                                  <button type="submit" className="g-btn g-btn--secondary">
                                    Save
                                  </button>
                                  {/* Remove submits the form below: forms can't nest. */}
                                  <button
                                    type="submit"
                                    form={`remove-${c.id}`}
                                    className="g-btn g-btn--ghost"
                                    aria-label={`Remove ${c.name}`}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </form>
                              <form action={removeCharacter} id={`remove-${c.id}`} hidden>
                                <input type="hidden" name="guildId" value={guildId} />
                                <input type="hidden" name="characterId" value={c.id} />
                                <input type="hidden" name="anchor" value={anchor} />
                              </form>
                            </div>
                          ))}
                          <form action={addCharacter} className="char-row char-row__form">
                            <input type="hidden" name="guildId" value={guildId} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <input type="hidden" name="anchor" value={anchor} />
                            <div className="char-row__fields">
                              <CharacterFields />
                            </div>
                            <div className="char-row__actions">
                              <label className="check">
                                <input type="checkbox" name="main" />
                                <span>Main</span>
                              </label>
                              <button type="submit" className="g-btn g-btn--secondary">
                                Add character
                              </button>
                            </div>
                          </form>

                          <form action={removeMember}>
                            <input type="hidden" name="guildId" value={guildId} />
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <button type="submit" className="g-btn g-btn--ghost">
                              Remove from {team.name}
                            </button>
                          </form>
                        </div>
                      </details>
                    );
                  })}
                </div>
              );
            })}

            <form action={addMember} className="roster-member__form roster-add">
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="teamId" value={team.id} />
              <label className="g-field">
                <span>Add to {team.name}</span>
                <select className="g-input" name="userId" required defaultValue="">
                  <option value="" disabled>
                    {addable.length ? "Pick a member" : "Nobody else to add yet"}
                  </option>
                  {addable.map((id) => {
                    const main = charactersOf(id).find((c) => c.main);
                    return (
                      <option key={id} value={id}>
                        {nameOf(id)}
                        {main ? ` · ${describeCharacter(main)}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="g-field">
                <span>Status</span>
                <select className="g-input" name="status" defaultValue="core">
                  {ROSTER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ROSTER_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="g-btn g-btn--primary" disabled={!addable.length}>
                Add
              </button>
            </form>
            <p className="g-help">
              This list has everyone who signed up for a raid in the last 90 days or added a
              character here. Find a member adds anyone else.
            </p>

            <details className="roster-team__edit">
              <summary className="g-help">Rename or delete {team.name}</summary>
              <form action={saveTeam} className="field-row">
                <input type="hidden" name="guildId" value={guildId} />
                <input type="hidden" name="teamId" value={team.id} />
                <label className="g-field">
                  <span>Name</span>
                  <input
                    className="g-input"
                    name="name"
                    maxLength={32}
                    required
                    defaultValue={team.name}
                  />
                </label>
                <label className="g-field">
                  <span>Game</span>
                  <select className="g-input" name="game" defaultValue={team.game ?? ""}>
                    <option value="">Any game</option>
                    {Object.entries(ROSTER_GAMES).map(([key, g]) => (
                      <option key={key} value={key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="g-btn g-btn--secondary">
                  Save team
                </button>
              </form>
              <form action={removeTeam}>
                <input type="hidden" name="guildId" value={guildId} />
                <input type="hidden" name="teamId" value={team.id} />
                <button type="submit" className="g-btn g-btn--danger">
                  Delete {team.name}
                </button>
                <span className="g-help"> Members keep their characters.</span>
              </form>
            </details>
          </section>
        );
      })}
    </>
  );
}
