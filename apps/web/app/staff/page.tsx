import { isStaff, listServerPlans } from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import { staffCompAction } from "./actions";

export const metadata: Metadata = { title: "Staff" };

const DONE: Record<string, string> = {
  comp: "Gave that server Pro for free.",
  free: "Put that server back on Free.",
  paid: "That server pays for Pro through Stripe, so nothing changed.",
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
  const [servers, { done }] = await Promise.all([listServerPlans(db), searchParams]);
  const pro = servers.filter((s) => s.plan === "pro");
  const paid = pro.filter((s) => s.source === "stripe").length;

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back="/staff" />
      <main className="picker">
        <div className="picker__head">
          <h1>Staff</h1>
          <p>
            Every server Garrison is in: {servers.length}{" "}
            {servers.length === 1 ? "server" : "servers"}, {paid} paying for Pro,{" "}
            {pro.length - paid} on free Pro.
          </p>
        </div>
        {done && DONE[done] ? (
          <p className="g-card" role="status">
            {DONE[done]}
          </p>
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
                        {s.source === "comp" ? "Pro · free" : "Pro · paid"}
                      </span>
                    ) : (
                      <span className="g-badge">Free</span>
                    )}
                  </td>
                  <td>{s.note ?? ""}</td>
                  <td>
                    {s.plan === "pro" && s.source === "stripe" ? null : (
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
      </main>
    </>
  );
}
