import { getFunSettings, getFunState, listBirthdays } from "@garrison/db";
import type { Metadata } from "next";
import { HowItWorks } from "@/components/HowItWorks";
import { HeadStatus } from "@/components/ModuleHead";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels, memberNames } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { saveFun } from "./actions";

export const metadata: Metadata = { title: "Fun" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function FunPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = await getDb();
  const [settings, state, birthdays, channels, allRoles, flash] = await Promise.all([
    getFunSettings(db, guild.id),
    getFunState(db, guild.id),
    listBirthdays(db, guild.id, 200),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    readFlash(),
  ]);
  const now = new Date();
  const today = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const next = [...birthdays]
    .sort(
      (a, b) =>
        ((a.month * 100 + a.day - today + 1300) % 1300) -
        ((b.month * 100 + b.day - today + 1300) % 1300),
    )
    .slice(0, 8);
  const names = await memberNames(
    guild.id,
    next.map((b) => b.userId),
  ).catch(() => new Map<string, string>());
  const roles = allRoles.filter((r) => !r.managed && !isDangerousRole(r.permissions));
  const on = [settings.birthdaysEnabled, settings.countingEnabled].filter(Boolean).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fun</h1>
          <p>Birthdays, a counting channel and trivia: small things that keep a server talking.</p>
          <HowItWorks>
            Members save their birthday with <code>/birthday set</code> and Garrison greets them on
            the day. In the counting channel, members count up one at a time. Anyone can start a
            round of <code>/trivia</code>.
          </HowItWorks>
        </div>
        <HeadStatus
          on={on > 0}
          word={null}
          text={on ? `${on} of 2 on` : "Nothing on yet"}
          href={on ? undefined : "#settings"}
          action="Turn one on"
        />
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

      <form action={saveFun} className="appl" id="settings">
        <input type="hidden" name="guildId" value={guild.id} />
        <section className="g-card appl" aria-labelledby="bday-title">
          <h2 className="card-title" id="bday-title">
            Birthdays
          </h2>
          <p className="card-sub">
            On a member's birthday, at midnight in the server's time zone (Settings → Server),
            Garrison posts a greeting that pings them, and gives the birthday role for the day.{" "}
            {birthdays.length} saved.
          </p>
          <label className="switch">
            <input
              type="checkbox"
              name="birthdaysEnabled"
              defaultChecked={settings.birthdaysEnabled}
            />
            <span className="switch__text">
              <span>Birthday greetings</span>
            </span>
          </label>
          <div className="appl__pair">
            <label className="g-field">
              <span className="g-label">Post them in</span>
              <select
                className="g-input"
                name="birthdayChannelId"
                defaultValue={settings.birthdayChannelId ?? ""}
              >
                <option value="">Pick a channel</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="g-field">
              <span className="g-label">Birthday role (optional)</span>
              <select
                className="g-input"
                name="birthdayRoleId"
                defaultValue={settings.birthdayRoleId ?? ""}
              >
                <option value="">None</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {next.length ? (
            <ul className="appl__done">
              {next.map((b) => (
                <li key={b.userId}>
                  <strong>
                    {MONTHS[b.month - 1]} {b.day}
                  </strong>{" "}
                  {names.get(b.userId) ?? "a member"}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="g-card appl" aria-labelledby="count-title">
          <h2 className="card-title" id="count-title">
            Counting
          </h2>
          <p className="card-sub">
            Members count up one number at a time, never twice in a row. A wrong number starts it
            again from 1. Messages that don't start with a number are left alone. Now at{" "}
            <strong>{state.count}</strong>, best {state.best}.
          </p>
          <label className="switch">
            <input
              type="checkbox"
              name="countingEnabled"
              defaultChecked={settings.countingEnabled}
            />
            <span className="switch__text">
              <span>Counting channel</span>
            </span>
          </label>
          <label className="g-field">
            <span className="g-label">Channel</span>
            <select
              className="g-input"
              name="countingChannelId"
              defaultValue={settings.countingChannelId ?? ""}
            >
              <option value="">Pick a channel</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <span className="g-help">A channel of its own works best.</span>
          </label>
        </section>

        <div className="appl__do">
          <button type="submit" className="g-btn g-btn--primary">
            Save
          </button>
        </div>
      </form>

      <section className="g-card appl" aria-labelledby="trivia-title">
        <h2 className="card-title" id="trivia-title">
          Trivia
        </h2>
        <p className="card-sub">
          Anyone runs <code>/trivia</code>: a question with four answers, 30 seconds, one guess
          each, and the first right answer wins. Questions are in English for now.
        </p>
      </section>
    </>
  );
}
