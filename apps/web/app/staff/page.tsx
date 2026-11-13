import { isStaff, listAllAgencyPlans, listServerPlans } from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import { staffAgencyAction, staffCompAction } from "./actions";

export const metadata: Metadata = { title: "Staff" };

const DONE: Record<string, string> = {
  comp: "Gave that server Pro for free.",
  free: "Put that server back on Free.",
  paid: "That server has Pro another way (paid or an Agency seat), so nothing changed.",
  agency: "Saved that Agency plan.",
  agency_removed: "Removed that Agency plan. Its servers are on Free.",
  agency_bad: "Use a Discord user ID and 1 to 25 seats.",
};

/** Garrison staff only (platform_staff): every server's plan, and free Pro for any of them. */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession("/staff");
  const db = await getDb();
  // Everyone else gets the same 404 as a page that doesn't exist.
  if (!(await isStaff(db, session.userId))) notFound();
  const [servers, agencies, { done }] = await Promise.all([
    listServerPlans(db),
    listAllAgencyPlans(db),
    searchParams,
  ]);
  const pro = servers.filter((s) => s.plan === "pro");
  const paid = pro.filter((s) => s.source === "stripe").length;

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back="/staff" />
      <main id="content" className="picker">
        <div className="picker__head">
          <h1>Staff</h1>
          <p>
            Every server Garrison is in, and who has which plan. Paid plans can't be changed here;
            free ones can.
          </p>
        </div>
        <dl className="staff-counts">
          <div>
            <dt>Servers</dt>
            <dd>{servers.length}</dd>
          </div>
          <div>
            <dt>Paying for Pro</dt>
            <dd>{paid}</dd>
          </div>
          <div>
            <dt>Agency seats</dt>
            <dd>{pro.filter((s) => s.source === "bundle").length}</dd>
          </div>
          <div>
            <dt>Free Pro</dt>
            <dd>{pro.filter((s) => s.source === "comp").length}</dd>
          </div>
          <div>
            <dt>Agency plans</dt>
            <dd>{agencies.length}</dd>
          </div>
        </dl>
        {done && DONE[done] ? (
          <div
            className={`notice${done === "paid" || done === "agency_bad" ? "" : " notice--ok"}`}
            role="status"
          >
            {DONE[done]}
          </div>
        ) : null}

        <section className="g-card table-wrap" aria-label="Servers and plans">
          <table className="g-table">
            <thead>
              <tr>
                <th scope="col">Server</th>
                <th scope="col">Plan</th>
                <th scope="col">Note</th>
                <th scope="col">
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.guildId} id={`g-${s.guildId}`}>
                  <td>
                    {s.name}
                    <br />
                    <span className="g-help mono">{s.guildId}</span>
                  </td>
                  <td>
                    {s.plan === "pro" ? (
                      <span className="g-badge g-badge--go">
                        {s.source === "comp"
                          ? "Pro · free"
                          : s.source === "bundle"
                            ? "Pro · Agency seat"
                            : "Pro · paid"}
                      </span>
                    ) : (
                      <span className="g-badge">Free</span>
                    )}
                  </td>
                  <td>{s.note ?? ""}</td>
                  <td>
                    {s.plan === "pro" && s.source !== "comp" ? null : (
                      <form action={staffCompAction}>
                        <input type="hidden" name="guildId" value={s.guildId} />
                        {s.plan === "pro" ? (
                          <button type="submit" className="g-btn g-btn--secondary">
                            Put back on Free
                          </button>
                        ) : (
                          <>
                            <input type="hidden" name="comp" value="on" />
                            <button type="submit" className="g-btn g-btn--secondary">
                              Give Pro free
                            </button>
                          </>
                        )}
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="g-card card-col" id="agency" aria-labelledby="agency-title">
          <h2 className="card-title" id="agency-title">
            Agency plans <span className="count">{agencies.length}</span>
          </h2>
          <p className="g-help">
            Pro on up to N servers for one person. They fill seats from each server's Plan page.
            Giving the same person a plan again changes its seats; shrinking it frees the newest
            seats first.
          </p>
          {agencies.length ? (
            <ul className="seats-list">
              {agencies.map((a) => (
                <li key={a.id}>
                  <span className="seats-list__who">
                    <span className="g-label">Owner</span>
                    <span className="mono">{a.ownerId}</span>
                  </span>
                  <span>
                    {a.used} of {a.seats} seats used
                    {a.note ? <span className="muted"> · {a.note}</span> : null}
                  </span>
                  <span className={`g-badge${a.source === "comp" ? "" : " g-badge--go"}`}>
                    {a.source === "comp" ? "Given free" : "Paid"}
                  </span>
                  {a.source === "comp" ? (
                    <form action={staffAgencyAction}>
                      <input type="hidden" name="op" value="remove" />
                      <input type="hidden" name="bundleId" value={a.id} />
                      <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <h3 className="card-title staff-sub">Give an Agency plan</h3>
          <form action={staffAgencyAction} className="filter-row">
            <label className="g-field" htmlFor="ownerId">
              <span>Their Discord user ID</span>
              <input
                className="g-input"
                id="ownerId"
                name="ownerId"
                inputMode="numeric"
                maxLength={20}
                required
              />
            </label>
            <label className="g-field" htmlFor="seats">
              <span>Seats</span>
              <input
                className="g-input"
                id="seats"
                name="seats"
                type="number"
                min={1}
                max={25}
                defaultValue={5}
              />
            </label>
            <label className="g-field" htmlFor="agency-note">
              <span>Why (optional)</span>
              <input className="g-input" id="agency-note" name="note" maxLength={200} />
            </label>
            <button type="submit" className="g-btn g-btn--primary">
              Give plan
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
