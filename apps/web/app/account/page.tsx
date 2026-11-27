import {
  listActiveGuilds,
  listAgencyPlans,
  listLinks,
  listMySignIns,
  listPlansIPay,
  listSharesForUser,
  RANK_CARD_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { GameMark, linkDetail, providerLabel } from "@/components/GameMark";
import { MemberAvatar } from "@/components/MemberAvatar";
import { PageTabs, TabPanel } from "@/components/PageTabs";
import { Topbar } from "@/components/Topbar";
import { WOW_FLAVORS, WOW_REGIONS } from "@/lib/barracks";
import { battlenetConfigured } from "@/lib/battlenet";
import { billingReady } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { LEGAL } from "@/lib/legal";
import { rankDetailsForms } from "@/lib/rank-details";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import {
  agencyBilling,
  eraseMine,
  removeAccountLink,
  saveMyRankDetails,
  signOutOthers,
  stopSharing,
} from "./actions";

export const metadata: Metadata = { title: "Your account" };

const MESSAGES: Record<string, string> = {
  "linked=discord": "Linked the game accounts from your Discord Connections.",
  "linked=wow": "Linked your World of Warcraft characters.",
  "linked=wow-none":
    "Battle.net found no characters for that version and region. Pick the version and region you play on and try again. A new Forever character shows up once it reaches level 10 and you log out.",
  "removed=1": "Removed, and its name and details wiped.",
  "unshared=1": "That server's roster no longer shows your accounts.",
  "rank=saved": "Saved. /rank shows them on your card.",
  "signedout=others": "Signed out everywhere else. This browser stays signed in.",
  "error=state": "That link expired or was tampered with. Try again.",
  "error=battlenet": "Battle.net didn't answer, or the link was refused. Try again.",
  "error=billing": "Stripe didn't answer. Try again in a moment.",
  "error=invalid": "That didn't match anything of yours.",
};

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

/**
 * The signed-in person's own settings: their game accounts, the servers they're in and what
 * each one sees, what they pay for, and their data (sign-ins, download, what's kept, erase).
 * Only ever their own: every read is scoped to the session's user ID.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession("/account");
  const q = await searchParams;
  const key = Object.keys(MESSAGES).find((k) => {
    const [name, value] = k.split("=");
    return name && q[name] === value;
  });
  const db = await getDb();
  const [links, shares, rankForms, agency, proPlans, signIns, memberOf] = await Promise.all([
    listLinks(db, session.userId),
    listSharesForUser(db, session.userId),
    rankDetailsForms(session.userId).catch(() => []),
    listAgencyPlans(db, session.userId),
    listPlansIPay(db, session.userId),
    listMySignIns(db, session.userId),
    listActiveGuilds(db, session.memberGuildIds),
  ]);
  const wow = battlenetConfigured();
  const canBill = billingReady();

  // One row per server: ones you're in with Garrison, plus any you still share with.
  const shared = new Set(shares.map((s) => s.guildId));
  const inServer = new Set(memberOf.map((g) => g.id));
  const servers = [
    ...memberOf.map((g) => ({ id: g.id, name: g.name })),
    ...shares
      .filter((s) => !inServer.has(s.guildId))
      .map((s) => ({ id: s.guildId, name: s.guildName })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const others = signIns.filter((s) => s.tokenHash !== session.tokenHash);
  const thisOne = signIns.find((s) => s.tokenHash === session.tokenHash);
  const paysFor = agency.length + proPlans.length;
  // The page's tabs, the first being the plain address; Billing only for someone who pays.
  const TABS = paysFor
    ? ["accounts", "servers", "billing", "data"]
    : ["accounts", "servers", "data"];

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back="/account" />
      <main id="content" className="shell account">
        <div className="main">
          <div className="page-head account-head">
            <div className="account-head__id">
              <MemberAvatar name={session.username} src={null} size="lg" />
              <div>
                <h1>Your account</h1>
                <p>
                  Signed in with Discord as <strong>{session.username}</strong>. Garrison never
                  keeps your Discord or Battle.net token.
                </p>
              </div>
            </div>
            {/* On phones the top bar drops Sign out (too easy to hit); it lives here too. */}
            <form method="post" action="/auth/logout">
              <button type="submit" className="g-btn g-btn--secondary">
                Sign out
              </button>
            </form>
          </div>

          {key ? (
            <div
              className={`notice ${key.startsWith("error") ? "" : "notice--ok"}`}
              role={key.startsWith("error") ? "alert" : "status"}
            >
              {MESSAGES[key]}
            </div>
          ) : null}

          <PageTabs
            label="Your account"
            tabs={[
              { id: "accounts", label: "Game accounts", count: links.length },
              { id: "servers", label: "Servers", count: servers.length },
              ...(paysFor ? [{ id: "billing", label: "Billing", count: paysFor }] : []),
              { id: "data", label: "Privacy" },
            ]}
          />

          {/* --- Game accounts ------------------------------------------------------- */}
          <TabPanel id="accounts" tabs={TABS} className="accounts-layout">
            <section className="g-card table-card" id="linked" aria-labelledby="linked-title">
              <div className="table-card__head card-head">
                <h2 className="card-title" id="linked-title">
                  Linked <span className="count">{links.length}</span>
                </h2>
                <span className="g-help">Verified means Discord or Battle.net proved it.</span>
              </div>
              {links.length ? (
                <ul className="game-list">
                  {links.map((l) => (
                    <li className="game-row" key={l.id}>
                      <GameMark provider={l.provider} />
                      <span className="game-row__name">
                        <strong>{l.displayName}</strong>
                        <span>
                          {[providerLabel(l.provider), linkDetail(l.details)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span
                        className={`g-badge ${l.verified ? "g-badge--go" : "g-badge--caution"}`}
                      >
                        {l.verified ? "Verified" : "Claimed"}
                      </span>
                      <form action={removeAccountLink}>
                        <input type="hidden" name="linkId" value={l.id} />
                        <button
                          type="submit"
                          className="g-btn g-btn--ghost g-btn--sm"
                          aria-label={`Remove ${l.displayName}`}
                        >
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-block">
                  <p>
                    Nothing linked yet. Discord Connections brings in everything you've already
                    connected there, in one go.
                  </p>
                </div>
              )}
              <p className="account-foot g-help">
                A server sees these only after you run /link there. See which ones on{" "}
                <Link href="/account?tab=servers">Servers</Link>.
              </p>
            </section>

            <section className="g-card table-card" id="link-game" aria-labelledby="link-more">
              <div className="table-card__head card-head">
                <h2 className="card-title" id="link-more">
                  Link a game
                </h2>
              </div>
              <div className="link-option">
                <span className="link-option__title">
                  Discord Connections <span className="g-badge g-badge--go">Verified</span>
                </span>
                <p>
                  Steam, Battle.net, Riot, Xbox, PlayStation and more: whatever is under Settings →
                  Connections in Discord. Run it again after you connect something new.
                </p>
                <a className="g-btn g-btn--primary" href="/auth/login?purpose=connections">
                  Link from Discord Connections
                </a>
              </div>
              {wow ? (
                <form className="link-option" method="get" action="/auth/battlenet/login">
                  <span className="link-option__title">
                    World of Warcraft <span className="g-badge g-badge--go">Verified</span>
                  </span>
                  <p>
                    Sign in with Battle.net for your characters' level, class and realm, Forever
                    included. Link each version you play; linking one never removes another.
                  </p>
                  <div className="field-row">
                    <label className="g-field" htmlFor="flavor">
                      <span>Version</span>
                      <select className="g-input" id="flavor" name="flavor" defaultValue="retail">
                        {Object.entries(WOW_FLAVORS).map(([k, f]) => (
                          <option key={k} value={k}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="g-field" htmlFor="region">
                      <span>Region</span>
                      <select className="g-input" id="region" name="region" defaultValue="us">
                        {WOW_REGIONS.map((r) => (
                          <option key={r} value={r}>
                            {r.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="g-btn g-btn--secondary">
                    Link WoW characters
                  </button>
                </form>
              ) : null}
              <div className="link-option">
                <span className="link-option__title">
                  RuneScape and Old School RuneScape{" "}
                  <span className="g-badge g-badge--caution">Claimed</span>
                </span>
                <p>
                  Use /link rs3 or /link osrs in Discord. RuneScape can't prove an account is yours,
                  so these show as claimed.
                </p>
              </div>
            </section>
          </TabPanel>

          {/* --- Servers ------------------------------------------------------------- */}
          <TabPanel id="servers" tabs={TABS} className="card-col">
            <section className="g-card table-card" id="your-servers" aria-labelledby="srv-title">
              <div className="table-card__head card-head">
                <h2 className="card-title" id="srv-title">
                  Your servers <span className="count">{servers.length}</span>
                </h2>
                <span className="g-help">Servers with Garrison that you're in.</span>
              </div>
              {servers.length ? (
                <ul className="game-list">
                  {servers.map((g) => {
                    const sees = shared.has(g.id);
                    return (
                      <li className="game-row acct-server" key={g.id}>
                        <span className="guild-icon guild-icon--text" aria-hidden="true">
                          {(g.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "G").toUpperCase()}
                        </span>
                        <span className="game-row__name">
                          <strong>{g.name}</strong>
                          <span>
                            {sees
                              ? "Sees your linked game accounts"
                              : inServer.has(g.id)
                                ? "Doesn't see your game accounts. Run /link there to share."
                                : "You've left; it still sees your game accounts"}
                          </span>
                        </span>
                        <span className="acct-server__actions">
                          {inServer.has(g.id) ? (
                            <Link
                              className="g-btn g-btn--secondary g-btn--sm"
                              href={`/play/${g.id}`}
                            >
                              Your space
                            </Link>
                          ) : null}
                          {sees ? (
                            <form action={stopSharing}>
                              <input type="hidden" name="guildId" value={g.id} />
                              <button
                                type="submit"
                                className="g-btn g-btn--ghost g-btn--sm"
                                aria-label={`Stop sharing with ${g.name}`}
                              >
                                Stop sharing
                              </button>
                            </form>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="empty-block">
                  <p>
                    None of your servers has Garrison yet, or you joined one after signing in. Sign
                    out and in again to refresh the list.
                  </p>
                </div>
              )}
            </section>

            {rankForms.length ? (
              <section className="g-card card-col" id="rank-cards" aria-labelledby="rank-title">
                <h2 className="card-title" id="rank-title">
                  Rank card details <span className="count">{rankForms.length}</span>
                </h2>
                <p className="g-help">
                  What these servers' rank cards show about you, the same as /rankcard in Discord.
                  Your space in each server shows the card as you type.
                </p>
                {rankForms.map((r) => (
                  <form
                    className="card-col rank-details"
                    action={saveMyRankDetails}
                    key={r.guildId}
                    id={`card-${r.guildId}`}
                  >
                    <input type="hidden" name="guildId" value={r.guildId} />
                    <strong>{r.guildName}</strong>
                    <div className="field-row">
                      {r.fields.map((f) => (
                        <label className="g-field" key={f.id} htmlFor={`${r.guildId}-${f.id}`}>
                          <span>{f.label}</span>
                          <input
                            className="g-input"
                            id={`${r.guildId}-${f.id}`}
                            name={`f_${f.id}`}
                            defaultValue={r.answers[f.id] ?? ""}
                            placeholder={f.hint ?? undefined}
                            maxLength={RANK_CARD_LIMITS.value}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="form-foot">
                      <button type="submit" className="g-btn g-btn--secondary">
                        Save for {r.guildName}
                      </button>
                    </div>
                  </form>
                ))}
              </section>
            ) : null}
          </TabPanel>

          {/* --- Billing ------------------------------------------------------------- */}
          {paysFor ? (
            <TabPanel id="billing" tabs={TABS} className="card-col">
              {agency.map((plan) => (
                // An Agency plan: Pro on up to N servers. Seats are filled from each server's Plan page.
                <section
                  key={plan.id}
                  className="g-card card-col"
                  id="agency"
                  aria-labelledby={`agency-${plan.id}`}
                >
                  <div className="card-head">
                    <h2 className="card-title" id={`agency-${plan.id}`}>
                      <span className="tier__foil">Agency</span>{" "}
                      <span className="count">
                        {plan.servers.length} of {plan.seats} seats used
                      </span>
                    </h2>
                    {plan.source === "stripe" && plan.stripeCustomerId && canBill ? (
                      <form action={agencyBilling}>
                        <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                          Manage billing
                        </button>
                      </form>
                    ) : null}
                  </div>
                  <p className="g-help">
                    {plan.source === "comp"
                      ? `Given by Garrison staff${plan.note ? `: ${plan.note}` : "."}`
                      : plan.currentPeriodEnd
                        ? `${plan.cancelAtPeriodEnd ? "Ends" : "Renews"} ${day(plan.currentPeriodEnd)}.`
                        : "Your subscription."}
                  </p>
                  <ol className="seats-list">
                    {Array.from({ length: plan.seats }, (_, i) => {
                      const server = plan.servers[i];
                      return (
                        <li
                          key={server?.guildId ?? `empty-${i}`}
                          className={server ? "" : "is-empty"}
                        >
                          <span className="seats-list__num">{i + 1}</span>
                          {server ? (
                            <Link href={`/servers/${server.guildId}/plan`}>{server.name}</Link>
                          ) : (
                            <span className="muted">Free seat</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <p className="g-help">
                    To fill a seat, open a server's Plan page and press "Use a seat on this server".
                    To move a seat, free it there first.
                  </p>
                </section>
              ))}
              {proPlans.length ? (
                <section className="g-card table-card" id="pro-plans" aria-labelledby="pro-title">
                  <div className="table-card__head card-head">
                    <h2 className="card-title" id="pro-title">
                      Pro you pay for <span className="count">{proPlans.length}</span>
                    </h2>
                    <span className="g-help">Change card, plan or cancel on each Plan page.</span>
                  </div>
                  <ul className="game-list">
                    {proPlans.map((p) => (
                      <li className="game-row acct-server" key={p.guildId}>
                        <span className="guild-icon guild-icon--text" aria-hidden="true">
                          {(p.guildName.match(/[\p{L}\p{N}]/u)?.[0] ?? "G").toUpperCase()}
                        </span>
                        <span className="game-row__name">
                          <strong>{p.guildName}</strong>
                          <span>
                            {p.currentPeriodEnd
                              ? `${p.cancelAtPeriodEnd ? "Ends" : "Renews"} ${day(p.currentPeriodEnd)}`
                              : "Pro"}
                          </span>
                        </span>
                        <span className="acct-server__actions">
                          <Link
                            className="g-btn g-btn--secondary g-btn--sm"
                            href={`/servers/${p.guildId}/plan`}
                          >
                            Plan page
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </TabPanel>
          ) : null}

          {/* --- Privacy ---------------------------------------------------- */}
          <TabPanel id="data" tabs={TABS} className="card-col">
            <section className="g-card table-card" id="sign-ins" aria-labelledby="signins-title">
              <div className="table-card__head card-head">
                <h2 className="card-title" id="signins-title">
                  Sign-ins <span className="count">{signIns.length}</span>
                </h2>
                {others.length ? (
                  <form action={signOutOthers}>
                    <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                      Sign out everywhere else
                    </button>
                  </form>
                ) : null}
              </div>
              <ul className="game-list">
                {thisOne ? (
                  <li className="game-row acct-signin">
                    <span className="acct-signin__dot is-here" aria-hidden="true" />
                    <span className="game-row__name">
                      <strong>This browser</strong>
                      <span>
                        Signed in {day(thisOne.createdAt)} · ends {day(thisOne.expiresAt)}
                      </span>
                    </span>
                    <span className="g-badge g-badge--go">Here now</span>
                  </li>
                ) : null}
                {others.map((s) => (
                  <li className="game-row acct-signin" key={s.tokenHash.slice(0, 12)}>
                    <span className="acct-signin__dot" aria-hidden="true" />
                    <span className="game-row__name">
                      <strong>Another browser</strong>
                      <span>
                        Signed in {day(s.createdAt)} · last used {day(s.lastSeenAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="account-foot g-help">
                A sign-in lasts 7 days. Garrison keeps no device or location details.
              </p>
            </section>

            <section className="g-card card-col" id="download" aria-labelledby="dl-title">
              <div className="card-head">
                <h2 className="card-title" id="dl-title">
                  Download your data
                </h2>
                <a className="g-btn g-btn--primary g-btn--sm" href="/account/export" download>
                  Download
                </a>
              </div>
              <p>
                One JSON file with everything that's yours: linked accounts (removed ones too),
                which servers see them, rank card details, levels, wallets, giveaway entries, group
                and raid sign-ups, suggestions, appeals, birthdays, plans you pay for and your AI
                assistant use.
              </p>
            </section>

            <section className="g-card table-card" id="kept" aria-labelledby="kept-title">
              <div className="table-card__head card-head">
                <h2 className="card-title" id="kept-title">
                  What Garrison keeps
                </h2>
                <span className="g-help">
                  The full list is in the <Link href="/privacy#keep">Privacy Policy</Link>.
                </span>
              </div>
              <div className="table-wrap">
                <table className="g-table acct-kept">
                  <thead>
                    <tr>
                      <th scope="col">What</th>
                      <th scope="col">Kept for</th>
                      <th scope="col">Who can remove it</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Linked game accounts</th>
                      <td data-label="Kept for">Until you remove them</td>
                      <td data-label="Removed by">You, on Game accounts</td>
                    </tr>
                    <tr>
                      <th scope="row">Which servers see them</th>
                      <td data-label="Kept for">Until you stop sharing</td>
                      <td data-label="Removed by">You, on Servers</td>
                    </tr>
                    <tr>
                      <th scope="row">Rank card details</th>
                      <td data-label="Kept for">While the server has Garrison</td>
                      <td data-label="Removed by">You, on Servers</td>
                    </tr>
                    <tr>
                      <th scope="row">Dashboard sign-ins</th>
                      <td data-label="Kept for">7 days, or until you sign out</td>
                      <td data-label="Removed by">You, above</td>
                    </tr>
                    <tr>
                      <th scope="row">XP, levels and wallets</th>
                      <td data-label="Kept for">While the server has Garrison</td>
                      <td data-label="Removed by">The server's staff</td>
                    </tr>
                    <tr>
                      <th scope="row">Cases, staff notes, tickets, event log</th>
                      <td data-label="Kept for">Set by each server</td>
                      <td data-label="Removed by">The server's staff, or us on request</td>
                    </tr>
                    <tr>
                      <th scope="row">Billing records</th>
                      <td data-label="Kept for">Up to 7 years, for tax law</td>
                      <td data-label="Removed by">No one, until then</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              className="g-card card-col acct-erase"
              id="erase"
              aria-labelledby="erase-title"
            >
              <h2 className="card-title" id="erase-title">
                Erase your data
              </h2>
              <p>
                Removes every linked game account and wipes its name and details, stops every server
                seeing them, clears your rank card details everywhere, forgets the birthdays you
                saved and signs you out on every browser. Your XP and anything a server's staff keep
                about you stay with that server.
              </p>
              <p className="g-help">
                To have those deleted too, email{" "}
                <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a> from the Discord account
                it's about. We answer within 30 days.
              </p>
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--danger">Erase my data…</summary>
                <form action={eraseMine} className="acct-erase__confirm">
                  <input type="hidden" name="confirm" value="erase" />
                  <p>This can't be undone. You'll need to link your games again.</p>
                  <button type="submit" className="g-btn g-btn--danger">
                    Yes, erase it and sign me out
                  </button>
                </form>
              </details>
            </section>
          </TabPanel>
        </div>
      </main>
    </>
  );
}
