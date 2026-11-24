import {
  CHARACTERS_PER_MEMBER,
  describeCharacter,
  isRosterGame,
  listLinks,
  listMemberTeams,
  listRosterCharacters,
  ROSTER_STATUS_LABELS,
  type RosterCharacter,
  rosterGame,
  STANDARD_ROLES,
  WOW_CLASSES,
} from "@garrison/db";
import { getDb } from "@/lib/db";
import { contentKey } from "@/lib/flash";
import {
  addMyCharacter,
  importMyWow,
  removeMyCharacter,
  saveMyCharacter,
  setMyMain,
} from "./actions";

const WOW_SPECS = [...new Set(Object.values(WOW_CLASSES).flatMap((s) => Object.keys(s)))].sort();

function Fields({ c }: { c?: RosterCharacter }) {
  return (
    <div className="char-row__fields">
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
          list="my-classes"
          defaultValue={c?.className ?? ""}
        />
      </label>
      <label className="g-field">
        <span>Spec</span>
        <input
          className="g-input"
          name="spec"
          maxLength={24}
          list="my-specs"
          defaultValue={c?.spec ?? ""}
        />
      </label>
      <label className="g-field">
        <span>Role</span>
        <input
          className="g-input"
          name="role"
          maxLength={20}
          list="my-roles"
          placeholder="From the spec"
          defaultValue={c?.role ?? ""}
        />
      </label>
    </div>
  );
}

/**
 * The member's own characters on this server's raid roster (main and alts), the teams they're on
 * and where they stand (never an officer's note), and their linked WoW characters to add.
 * The page around it has already checked they're a member; every change checks again.
 */
export async function MyCharacters({ guildId, userId }: { guildId: string; userId: string }) {
  const db = await getDb();
  const [mine, teams, game, links] = await Promise.all([
    listRosterCharacters(db, guildId, [userId]),
    listMemberTeams(db, guildId, userId),
    rosterGame(db, guildId),
    listLinks(db, userId),
  ]);
  const wow = isRosterGame(game);
  const have = new Set(mine.map((c) => c.name.toLowerCase()));
  const importable = wow
    ? links
        .filter((l) => l.provider === "wow" && l.verified && !have.has(l.displayName.toLowerCase()))
        .slice(0, 20)
    : [];
  const hidden = (id?: string) => (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      {id ? <input type="hidden" name="characterId" value={id} /> : null}
    </>
  );

  return (
    <section className="g-card card-col" id="characters" aria-labelledby="characters-title">
      <h2 className="card-title" id="characters-title">
        Your characters <span className="count">{mine.length}</span>
      </h2>
      <p className="g-help">
        {teams.length
          ? `You're on ${teams
              .map(
                (t) => `${t.team.name} (${ROSTER_STATUS_LABELS[t.status as "core"] ?? t.status})`,
              )
              .join(", ")}. `
          : "You're not on a raid team here yet. "}
        Officers see your characters on the raid roster. You can keep {CHARACTERS_PER_MEMBER}, one
        of them your main. /roster add does the same in Discord.
      </p>
      <datalist id="my-classes">
        {wow ? Object.keys(WOW_CLASSES).map((c) => <option key={c} value={c} />) : null}
      </datalist>
      <datalist id="my-specs">
        {wow ? WOW_SPECS.map((s) => <option key={s} value={s} />) : null}
      </datalist>
      <datalist id="my-roles">
        {STANDARD_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {mine.map((c) => (
        <div className="char-row" key={`${c.id}-${contentKey(c)}`}>
          <form
            action={saveMyCharacter}
            className="char-row__form"
            aria-label={describeCharacter(c)}
          >
            {hidden(c.id)}
            <Fields c={c} />
            <div className="char-row__actions">
              {c.main ? <span className="g-badge g-badge--go">Main</span> : null}
              <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                Save
              </button>
              {c.main ? null : (
                <button
                  type="submit"
                  form={`main-${c.id}`}
                  className="g-btn g-btn--ghost g-btn--sm"
                >
                  Make main
                </button>
              )}
              <button
                type="submit"
                form={`remove-${c.id}`}
                className="g-btn g-btn--ghost g-btn--sm"
                aria-label={`Remove ${c.name}`}
              >
                Remove
              </button>
            </div>
          </form>
          {/* The buttons above submit these: forms can't nest. */}
          <form action={setMyMain} id={`main-${c.id}`} hidden>
            {hidden(c.id)}
          </form>
          <form action={removeMyCharacter} id={`remove-${c.id}`} hidden>
            {hidden(c.id)}
          </form>
        </div>
      ))}

      {mine.length < CHARACTERS_PER_MEMBER ? (
        <form
          action={addMyCharacter}
          className="char-row char-row__form"
          aria-label="Add a character"
        >
          {hidden()}
          <Fields />
          <div className="char-row__actions">
            <label className="check">
              <input type="checkbox" name="main" />
              <span>My main</span>
            </label>
            <button type="submit" className="g-btn g-btn--primary g-btn--sm">
              Add character
            </button>
          </div>
        </form>
      ) : null}

      {importable.length ? (
        <form action={importMyWow} className="card-col char-row">
          {hidden()}
          <span className="g-label">From your Battle.net link</span>
          {importable.map((l) => (
            <label className="check" key={l.id}>
              <input type="checkbox" name="linkId" value={l.id} />
              <span>
                {l.displayName}
                <span className="muted">
                  {[
                    typeof l.details.className === "string" ? l.details.className : null,
                    typeof l.details.level === "number" ? `level ${l.details.level}` : null,
                    typeof l.details.realm === "string" ? l.details.realm : null,
                  ]
                    .filter(Boolean)
                    .map((x) => ` · ${x}`)
                    .join("")}
                </span>
              </span>
            </label>
          ))}
          <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
            Add the ones ticked
          </button>
        </form>
      ) : null}
    </section>
  );
}
