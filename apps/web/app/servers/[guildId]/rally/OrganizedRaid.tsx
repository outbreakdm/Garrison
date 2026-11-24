import {
  AVAILABILITY,
  AVAILABILITY_LABELS,
  describeCharacter,
  type OpsEvent,
  type OpsSignup,
  type RosterCharacter,
} from "@garrison/db";
import { formatTime } from "@/components/format";
import { requestAction } from "../requests";

const counted = (s: OpsSignup) => s.availability === "coming" || s.availability === "late";

/** The answer form: Coming, Tentative, Late or Can't, with a character or a role. */
export function AnswerForm({
  action,
  hidden,
  raid,
  mine,
  characters,
}: {
  action: (form: FormData) => Promise<void>;
  hidden: React.ReactNode;
  raid: OpsEvent;
  mine: OpsSignup | undefined;
  characters: RosterCharacter[];
}) {
  const main = characters.find((c) => c.main);
  return (
    <form action={action} className="act-row raid-signup">
      {hidden}
      <select
        className="g-input g-input--sm"
        name="availability"
        aria-label={`Your answer for ${raid.title}`}
        defaultValue={mine?.availability ?? "coming"}
      >
        {AVAILABILITY.map((a) => (
          <option key={a} value={a}>
            {AVAILABILITY_LABELS[a]}
          </option>
        ))}
      </select>
      {characters.length ? (
        <select
          className="g-input g-input--sm"
          name="characterId"
          aria-label="Character"
          defaultValue={mine?.characterId ?? main?.id}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {describeCharacter(c)}
            </option>
          ))}
        </select>
      ) : null}
      <select
        className="g-input g-input--sm"
        name="role"
        aria-label="Role"
        defaultValue={mine?.role || ""}
      >
        <option value="">{characters.length ? "Character's role" : "Pick a role"}</option>
        {raid.slots.map((g) => (
          <option key={g.name} value={g.name}>
            {g.name}
          </option>
        ))}
      </select>
      <button type="submit" className="g-btn g-btn--secondary">
        {mine ? "Change answer" : "Answer"}
      </button>
    </form>
  );
}

/**
 * An organized raid on the Raids tab: who's coming with which character, by role; tentative
 * and late; how many can't; who on its team hasn't answered; and your own answer.
 */
export function OrganizedRaid({
  guildId,
  raid,
  signups,
  waiting,
  teamName,
  me,
  myCharacters,
  nameOf,
}: {
  guildId: string;
  raid: OpsEvent;
  signups: OpsSignup[];
  waiting: string[];
  teamName: string | null;
  me: string;
  myCharacters: RosterCharacter[];
  nameOf: (id: string) => string;
}) {
  const cant = signups.filter((s) => s.availability === "cant");
  const missing = raid.slots.reduce(
    (t, g) =>
      t + Math.max(0, g.count - signups.filter((s) => s.role === g.name && counted(s)).length),
    0,
  );
  const mine = signups.find((s) => s.userId === me);
  const hidden = (kind: string) => (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="page" value="rally" />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="eventId" value={raid.id} />
    </>
  );
  return (
    <article className="g-card card-col" aria-label={raid.title}>
      <div className="lfg__head">
        <div>
          <h3 className="card-title">{raid.title}</h3>
          <div className="raid-card__when">
            <span className="mono">{formatTime(raid.startsAt, raid.timezone)}</span>
            <span className="g-badge g-badge--accent">Organized</span>
            {teamName ? <span className="g-badge">{teamName}</span> : null}
            {raid.repeatWeekly ? <span className="g-badge">Weekly</span> : null}
          </div>
          {raid.note ? <p className="card-sub">{raid.note}</p> : null}
        </div>
        <span className={`g-badge ${missing ? "g-badge--caution" : "g-badge--go"}`}>
          {missing ? `${missing} short` : "Ready"}
        </span>
      </div>
      <div className="roster">
        {raid.slots.map((g) => {
          const inRole = signups.filter((s) => s.role === g.name && s.availability !== "cant");
          const n = inRole.filter(counted).length;
          const tone = n >= g.count ? "tone-go" : n ? "tone-caution" : "";
          return (
            <div className="roster__col" key={g.name}>
              <div className="roster__head">
                <span className="g-label">{g.name}</span>
                <span className={`mono ${tone}`}>
                  {n} / {g.count}
                </span>
              </div>
              {inRole.slice(0, 8).map((s) => (
                <div
                  className={`roster__slot ${s.userId === me ? "roster__slot--you" : ""}`}
                  key={s.userId}
                >
                  <span>
                    {s.userId === me ? "You" : nameOf(s.userId)}
                    {s.availability !== "coming" ? (
                      <span className="muted">
                        {" "}
                        · {AVAILABILITY_LABELS[s.availability as "late"].toLowerCase()}
                      </span>
                    ) : null}
                  </span>
                  {s.spec ? <span className="mono">{s.spec}</span> : null}
                </div>
              ))}
              {inRole.length > 8 ? <span className="g-help">+{inRole.length - 8} more</span> : null}
            </div>
          );
        })}
      </div>
      {cant.length || waiting.length ? (
        <p className="g-help">
          {cant.length ? `Can't: ${cant.map((s) => nameOf(s.userId)).join(", ")}. ` : ""}
          {waiting.length
            ? `No reply yet: ${waiting
                .slice(0, 12)
                .map(nameOf)
                .join(", ")}${waiting.length > 12 ? ` and ${waiting.length - 12} more` : ""}.`
            : ""}
        </p>
      ) : null}
      <AnswerForm
        action={requestAction}
        hidden={hidden("raid_answer")}
        raid={raid}
        mine={mine}
        characters={myCharacters}
      />
      <div className="row-between raid-foot">
        <span className="mono">
          {signups.filter(counted).length} coming ·{" "}
          {signups.filter((s) => s.availability === "tentative").length} tentative · {cant.length}{" "}
          can't
        </span>
        <a className="g-btn g-btn--primary" href={`/servers/${guildId}/rally/lineup/${raid.id}`}>
          {raid.lineupPostedAt ? "Edit the lineup" : "Pick the lineup"}
        </a>
        <details className="confirm">
          <summary className="confirm__toggle g-btn g-btn--ghost">Cancel raid…</summary>
          <form action={requestAction}>
            <input type="hidden" name="guildId" value={guildId} />
            <input type="hidden" name="page" value="rally" />
            <input type="hidden" name="kind" value="cancel_raid" />
            <input type="hidden" name="id" value={raid.id} />
            <button type="submit" className="g-btn g-btn--danger">
              Yes, cancel {raid.title}
            </button>
          </form>
        </details>
      </div>
    </article>
  );
}
