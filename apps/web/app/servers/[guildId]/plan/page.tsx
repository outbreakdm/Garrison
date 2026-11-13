import {
  FEATURES,
  getPlanDetails,
  isStaff,
  listAgencyPlans,
  PAID_PLANS_LIVE,
  type PlanTier,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanCards } from "@/components/PlanCards";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";
import { seatAction, setCompAction } from "./actions";

export const metadata: Metadata = { title: "Plan" };

const show = (value: number | boolean) =>
  typeof value === "boolean" ? (value ? "Yes" : "—") : String(value);

const DONE: Record<string, { text: string; ok: boolean }> = {
  comp: { text: "This server now has Pro for free.", ok: true },
  free: { text: "This server is back on Free.", ok: true },
  paid: { text: "This server already has Pro another way, so nothing changed.", ok: false },
  seat_assigned: { text: "This server now takes one of your Agency seats. Pro is on.", ok: true },
  seat_free: {
    text: "Freed the seat. This server is on Free; anything over the limits pauses.",
    ok: true,
  },
  seat_full: {
    text: "Every seat is in use. Free one from another server first (your account lists them).",
    ok: false,
  },
  seat_paid: { text: "This server already has Pro another way, so it needs no seat.", ok: false },
  seat_taken: { text: "Another Agency plan already covers this server.", ok: false },
  seat_not_owner: { text: "That Agency plan isn't yours, so nothing changed.", ok: false },
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
  const [details, staff, agency] = await Promise.all([
    getPlanDetails(db, guild.id),
    isStaff(db, session.userId),
    listAgencyPlans(db, session.userId),
  ]);
  const pro = details.plan === "pro";
  const source = details.source;
  const mySeat = source === "bundle" ? agency.find((a) => a.id === details.bundleId) : undefined;
  const current: PlanTier = !pro ? "free" : source === "bundle" ? "agency" : "pro";
  const plan = agency[0];
  const used = plan?.servers.length ?? 0;
  const outcome = done ? DONE[done] : undefined;

  const where = !pro
    ? "This server is on Free. Nothing you set up is lost when you upgrade or go back to Free."
    : source === "comp"
      ? `Garrison staff gave this server Pro for free${details.note ? `: ${details.note}` : "."}`
      : source === "bundle"
        ? mySeat
          ? `Pro comes from one of your Agency seats (${mySeat.servers.length} of ${mySeat.seats} used).`
          : "Pro comes from someone's Agency plan. Its owner can move the seat."
        : "This server pays for Pro itself.";

  // An Agency owner manages seats right here, on the server they're about.
  const seatControl = plan ? (
    mySeat ? (
      <form action={seatAction}>
        <input type="hidden" name="guildId" value={guild.id} />
        <input type="hidden" name="op" value="release" />
        <button type="submit" className="g-btn g-btn--secondary">
          Free this seat
        </button>
      </form>
    ) : pro ? (
      <p className="g-help">This server has Pro another way, so it needs no seat.</p>
    ) : used >= plan.seats ? (
      <p className="g-help">
        All {plan.seats} seats are in use. Free one from another server, or from{" "}
        <Link href="/account#agency">your account</Link>.
      </p>
    ) : (
      <form action={seatAction}>
        <input type="hidden" name="guildId" value={guild.id} />
        <input type="hidden" name="op" value="assign" />
        <input type="hidden" name="bundleId" value={plan.id} />
        <button type="submit" className="g-btn g-btn--primary">
          Use a seat on this server
        </button>
        <span className="g-help tier__note">
          {plan.seats - used} of {plan.seats} seats free
        </span>
      </form>
    )
  ) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plan</h1>
          <p>
            What this server has, and what each plan adds. Everything a server needs to stay safe is
            free, on every plan.
          </p>
        </div>
      </div>
      {outcome ? (
        <div className={`notice${outcome.ok ? " notice--ok" : ""}`} role="status">
          {outcome.text}
        </div>
      ) : null}

      <section className="g-card plan-now" aria-labelledby="now">
        <div>
          <h2 className="card-title" id="now">
            {current === "free" ? "Free" : current === "agency" ? "Pro, from Agency" : "Pro"}{" "}
            <span className={`g-badge ${pro ? "g-badge--go" : "g-badge--off"}`}>
              {pro ? (source === "comp" ? "Complimentary" : "Active") : "No paid plan"}
            </span>
          </h2>
          <p className="card-sub">{where}</p>
        </div>
        {plan ? <div className="plan-now__seat">{seatControl}</div> : null}
      </section>

      <section className="block" aria-labelledby="plans">
        <div className="card-head">
          <h2 className="block-title" id="plans">
            Plans
          </h2>
          <p>
            {PAID_PLANS_LIVE
              ? "Prices in US dollars, before tax. Cancel any time."
              : "Garrison is free during early access. These are the prices at launch; nothing costs money until they go live."}
          </p>
        </div>
        <PlanCards current={current} />
      </section>

      <details className="g-card panel" id="limits">
        <summary className="panel__summary">
          <span className="panel__title panel__title--lg">Every limit, side by side</span>
          <span className="panel__hint">
            {Object.keys(FEATURES).length} features. Agency has Pro on each server.
          </span>
          <span className="panel__cue" aria-hidden="true" />
        </summary>
        <div className="panel__body table-wrap">
          <table className="g-table g-table--fit limits-table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Free</th>
                <th scope="col">Pro and Agency</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(FEATURES).map((f) => (
                <tr key={f.about}>
                  <td>{f.about}</td>
                  <td>{show(f.free)}</td>
                  <td className={f.pro !== f.free ? "limits-table__up" : undefined}>
                    {show(f.pro)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {staff ? (
        <form action={setCompAction} className="g-card card-col" aria-labelledby="staff">
          <input type="hidden" name="guildId" value={guild.id} />
          <h2 className="card-title" id="staff">
            Staff <span className="g-badge g-badge--intel">Only you see this</span>
          </h2>
          {pro && source !== "comp" ? (
            <p className="g-help">This server has Pro another way, so there's nothing to change.</p>
          ) : source === "comp" ? (
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
                <button type="submit" className="g-btn g-btn--secondary">
                  Give this server Pro for free
                </button>
              </div>
            </>
          )}
          <p className="g-help">
            Agency plans for a person are given on the <Link href="/staff#agency">staff page</Link>.
          </p>
        </form>
      ) : null}
    </>
  );
}
