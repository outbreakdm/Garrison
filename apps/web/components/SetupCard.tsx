import { SETUP_PRESET_KEYS, SETUP_PRESETS, type SetupStep } from "@garrison/db";
import { runSetupStep } from "@/app/servers/[guildId]/setup-actions";

/**
 * "Set up in three clicks" on a new server's Overview: protect it, welcome people, then let
 * the AI assistant build the rest from a preset. Each step ticks itself off from the server's
 * real settings; the card goes once all three are done, or when it's hidden.
 */
export function SetupCard({
  guildId,
  done,
  channels,
}: {
  guildId: string;
  done: Record<SetupStep, boolean>;
  channels: { id: string; name: string }[];
}) {
  const left = Object.values(done).filter((d) => !d).length;
  return (
    <section className="g-card setup" id="setup" aria-labelledby="setup-title">
      <div className="setup__head">
        <div>
          <h2 className="setup__title" id="setup-title">
            Set up in three clicks
          </h2>
          <p className="setup__sub">
            {left === 3
              ? "Protect the server, welcome people, then let the AI assistant build the rest."
              : `${3 - left} of 3 done.`}
          </p>
        </div>
        <form action={runSetupStep}>
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="step" value="hide" />
          <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
            Hide
          </button>
        </form>
      </div>
      <ol className="setup__steps">
        <li className={`setup__step${done.protect ? " is-done" : ""}`}>
          <span className="setup__n" aria-hidden="true">
            {done.protect ? "✓" : "1"}
          </span>
          <div className="setup__body">
            <h3 className="setup__name">Protect</h3>
            <p className="setup__about">
              Automod removes scam links and invites, AI moderation reads for harassment and hate,
              and anti-raid watches the join rate.
            </p>
          </div>
          {done.protect ? (
            <span className="setup__state">On</span>
          ) : (
            <form action={runSetupStep} className="setup__do" data-need="manager">
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="step" value="protect" />
              <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                Turn on protection
              </button>
            </form>
          )}
        </li>
        <li className={`setup__step${done.welcome ? " is-done" : ""}`}>
          <span className="setup__n" aria-hidden="true">
            {done.welcome ? "✓" : "2"}
          </span>
          <div className="setup__body">
            <h3 className="setup__name">Welcome</h3>
            <p className="setup__about">
              A welcome card for everyone who joins, in a channel you pick.
            </p>
          </div>
          {done.welcome ? (
            <span className="setup__state">On</span>
          ) : (
            <form action={runSetupStep} className="setup__do" data-need="manager">
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="step" value="welcome" />
              <label className="sr-only" htmlFor="setup-welcome-channel">
                Welcome channel
              </label>
              <select
                id="setup-welcome-channel"
                name="channelId"
                className="g-select setup__select"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Pick a channel
                </option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                Turn on
              </button>
            </form>
          )}
        </li>
        <li className={`setup__step${done.build ? " is-done" : ""}`}>
          <span className="setup__n" aria-hidden="true">
            {done.build ? "✓" : "3"}
          </span>
          <div className="setup__body">
            <h3 className="setup__name">Build</h3>
            <p className="setup__about">
              Pick what kind of server it is. The AI assistant drafts channels, roles and order for
              it, and nothing changes until you apply.
            </p>
          </div>
          {done.build ? (
            <span className="setup__state">Built</span>
          ) : (
            <form action={runSetupStep} className="setup__do setup__do--presets">
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="step" value="build" />
              <fieldset className="setup__presets">
                <legend className="sr-only">Kind of server</legend>
                {SETUP_PRESET_KEYS.map((k, i) => (
                  <label key={k} className="setup__preset">
                    <input type="radio" name="preset" value={k} defaultChecked={i === 0} />
                    <span className="setup__preset-name">{SETUP_PRESETS[k].label}</span>
                    <span className="setup__preset-about">{SETUP_PRESETS[k].about}</span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                Open the AI assistant
              </button>
            </form>
          )}
        </li>
      </ol>
    </section>
  );
}
