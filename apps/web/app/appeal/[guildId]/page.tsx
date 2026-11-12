import {
  APPEAL_MAX,
  APPEAL_MIN,
  appealBlock,
  appealsOpen,
  getActiveGuild,
  listAppealsForUser,
  listCasesForTarget,
} from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import { submitAppeal } from "./actions";

export const metadata: Metadata = { title: "Appeal" };

const ACTION: Record<string, string> = {
  warn: "Warning",
  timeout: "Timeout",
  kick: "Kick",
  ban: "Ban",
};

/**
 * The public appeal page for one server. Anyone signed in with Discord who has a
 * case there can write one appeal at a time; the staff decide on the dashboard and
 * the outcome shows here. Servers that haven't turned appeals on are a 404.
 */
export default async function AppealPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (!isSnowflake(guildId)) notFound();
  const session = await requireSession(`/appeal/${guildId}`);
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  if (!guild) notFound();
  if (!(await appealsOpen(db, guild.id))) notFound();
  const [cases, past, flash] = await Promise.all([
    listCasesForTarget(db, guild.id, session.userId, 25),
    listAppealsForUser(db, guild.id, session.userId),
    readFlash(),
  ]);
  const open = cases.filter((c) => !c.revokedAt && c.action !== "purge");
  const block = appealBlock(past);

  return (
    <>
      <Topbar
        username={session.username}
        theme={await currentTheme()}
        back={`/appeal/${guild.id}`}
      />
      <main className="shell">
        <div className="main appeal">
          <div className="page-head">
            <div>
              <h1>Appeal to {guild.name}</h1>
              <p>
                Tell the staff what happened and why the action should be lifted. They read every
                appeal and answer here.
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

          {past.length ? (
            <section className="g-card card-col" aria-labelledby="past-title">
              <h2 className="card-title" id="past-title">
                Your appeals
              </h2>
              <ul className="notes">
                {past.map((a) => (
                  <li key={a.id}>
                    <p>
                      <span
                        className={`g-badge ${a.status === "accepted" ? "g-badge--go" : a.status === "denied" ? "g-badge--alert" : "g-badge--caution"}`}
                      >
                        {a.status === "open"
                          ? "Waiting"
                          : a.status === "accepted"
                            ? "Accepted"
                            : "Denied"}
                      </span>{" "}
                      {a.caseNumber ? `Case #${a.caseNumber}` : "General"}
                    </p>
                    <p>{a.body}</p>
                    {a.response ? (
                      <p>
                        <strong>Staff:</strong> {a.response}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!open.length ? (
            <p className="notice" role="status">
              You have no active cases in {guild.name}, so there's nothing to appeal.
            </p>
          ) : block === "open" ? (
            <p className="notice" role="status">
              Your appeal is with the staff. You'll see their answer here.
            </p>
          ) : block === "cooldown" ? (
            <p className="notice" role="status">
              Your last appeal was denied. You can appeal again a week after that.
            </p>
          ) : (
            <form action={submitAppeal} className="g-card card-col">
              <input type="hidden" name="guildId" value={guild.id} />
              <label className="g-field" htmlFor="caseNumber">
                <span>Which action</span>
                <select
                  className="g-input"
                  id="caseNumber"
                  name="caseNumber"
                  defaultValue={open[0]?.caseNumber}
                >
                  {open.map((c) => (
                    <option key={c.id} value={c.caseNumber}>
                      #{c.caseNumber} · {ACTION[c.action] ?? c.action} ·{" "}
                      {c.createdAt.toISOString().slice(0, 10)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="g-field" htmlFor="body">
                <span>Your appeal</span>
                <textarea
                  className="g-input"
                  id="body"
                  name="body"
                  rows={6}
                  minLength={APPEAL_MIN}
                  maxLength={APPEAL_MAX}
                  required
                />
                <span className="g-help">
                  {APPEAL_MIN} to {APPEAL_MAX} characters. Be specific; one appeal at a time.
                </span>
              </label>
              <div className="form-foot">
                <button type="submit" className="g-btn g-btn--primary">
                  Send appeal
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
