import { FEATURES, getPlanDetails, isStaff } from "@garrison/db";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";
import { setCompAction } from "./actions";

export const metadata: Metadata = { title: "Plan" };

const show = (value: number | boolean) =>
  typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);

const DONE: Record<string, string> = {
  comp: "This server now has Pro for free.",
  free: "This server is back on Free.",
  paid: "This server pays for Pro through Stripe, so nothing changed.",
};

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild, session } = await requireGuildAccess(guildId);
  const { done } = await searchParams;
  const db = await getDb();
  const [details, staff] = await Promise.all([
    getPlanDetails(db, guild.id),
    isStaff(db, session.userId),
  ]);
  const pro = details.plan === "pro";
  const comp = details.source === "comp";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plan</h1>
          <p>
            What this server has, and what Pro adds. Everything a server needs to stay safe is free.
          </p>
        </div>
      </div>
      {done && DONE[done] ? (
        <p className="g-card" role="status">
          {DONE[done]}
        </p>
      ) : null}

      <div className="card-col">
        <section className="g-card card-col" aria-labelledby="current">
          <h2 className="card-title" id="current">
            {pro ? "Garrison Pro" : "Free"}{" "}
            <span className={`g-badge ${pro ? "g-badge--go" : ""}`}>
              {pro ? (comp ? "Complimentary" : "Active") : "Current plan"}
            </span>
          </h2>
          <p className="g-help">
            {pro
              ? comp
                ? `Pro was given to this server for free${details.note ? `: ${details.note}` : "."}`
                : "Pro is paid for through Stripe."
              : "Upgrading opens soon. Nothing you set up now is lost when you upgrade or go back to Free."}
          </p>
        </section>

        <section className="g-card card-col" aria-labelledby="compare">
          <h2 className="card-title" id="compare">
            Free and Pro
          </h2>
          <table className="g-table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Free</th>
                <th scope="col">Pro</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(FEATURES).map((f) => (
                <tr key={f.about}>
                  <td>{f.about}</td>
                  <td>{show(f.free)}</td>
                  <td>{show(f.pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="g-help">More Pro features arrive as each module gets its customization.</p>
        </section>

        {staff ? (
          <form action={setCompAction} className="g-card card-col" aria-labelledby="staff">
            <input type="hidden" name="guildId" value={guild.id} />
            <h2 className="card-title" id="staff">
              Staff <span className="g-badge g-badge--intel">Only you see this</span>
            </h2>
            {pro && !comp ? (
              <p className="g-help">This server pays for Pro, so there's nothing to change.</p>
            ) : comp ? (
              <div className="form-foot">
                <button type="submit" className="g-btn g-btn--secondary">
                  Put back on Free
                </button>
              </div>
            ) : (
              <>
                <input type="hidden" name="comp" value="on" />
                <label className="g-field" htmlFor="note">
                  <span>Why (optional)</span>
                  <input
                    className="g-input"
                    id="note"
                    name="note"
                    maxLength={200}
                    placeholder="My test server"
                  />
                </label>
                <div className="form-foot">
                  <button type="submit" className="g-btn g-btn--primary">
                    Give this server Pro for free
                  </button>
                </div>
              </>
            )}
          </form>
        ) : null}
      </div>
    </>
  );
}
