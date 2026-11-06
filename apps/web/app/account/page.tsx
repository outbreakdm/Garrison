import { type LinkProvider, linkProviders } from "@garrison/brand";
import { listLinks, listSharesForUser } from "@garrison/db";
import type { Metadata } from "next";
import { Topbar } from "@/components/Topbar";
import { WOW_REGIONS } from "@/lib/barracks";
import { battlenetConfigured } from "@/lib/battlenet";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { removeAccountLink, stopSharing } from "./actions";

export const metadata: Metadata = { title: "Your accounts" };

const MESSAGES: Record<string, string> = {
  "linked=discord": "Linked the game accounts from your Discord Connections.",
  "linked=wow": "Linked your World of Warcraft characters.",
  "removed=1": "Removed.",
  "unshared=1": "That server's roster no longer shows your accounts.",
  "error=state": "That link expired or was tampered with. Try again.",
  "error=battlenet": "Battle.net didn't answer, or the link was refused. Try again.",
  "error=invalid": "That didn't match anything of yours.",
};

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
  const db = getDb();
  const [links, shares] = await Promise.all([
    listLinks(db, session.userId),
    listSharesForUser(db, session.userId),
  ]);
  const wow = battlenetConfigured();

  return (
    <>
      <Topbar username={session.username} />
      <main className="shell">
        <div className="main">
          <div className="page-head">
            <div>
              <span className="g-label">Barracks · Members</span>
              <h1>Your game accounts</h1>
              <p>
                Servers see these only after you share with them (/link in that server). Garrison
                never keeps your Discord or Battle.net token.
              </p>
            </div>
          </div>
          {key ? (
            <div className={`notice ${key.startsWith("error") ? "" : "notice--ok"}`} role="status">
              {MESSAGES[key]}
            </div>
          ) : null}

          <div className="grid-cards">
            <div className="g-card card-col">
              <span className="g-label">Verified, from Discord</span>
              <p className="muted">
                Steam, Battle.net, Riot, Xbox, PlayStation and more: whatever you've connected in
                Discord under Settings → Connections. Run it again after you connect something new.
              </p>
              <a className="g-btn g-btn--primary" href="/auth/login?purpose=connections">
                Link from Discord Connections
              </a>
            </div>
            {wow ? (
              <form className="g-card card-col" method="get" action="/auth/battlenet/login">
                <span className="g-label">Verified, World of Warcraft</span>
                <p className="muted">
                  Sign in with Battle.net to link your characters with level, class and realm.
                </p>
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
                <button type="submit" className="g-btn g-btn--secondary">
                  Link WoW characters
                </button>
              </form>
            ) : null}
            <div className="g-card card-col">
              <span className="g-label">Claimed, Old School RuneScape</span>
              <p className="muted">
                Use /link osrs in Discord. OSRS can't prove an account is yours, so it shows as
                claimed.
              </p>
            </div>
          </div>

          <div className="g-card table-card">
            <div className="table-card__head">
              <span className="g-label">Linked</span>
            </div>
            <div className="table-wrap">
              <table className="g-table">
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>{linkProviders[l.provider as LinkProvider]?.label ?? l.provider}</td>
                      <td>{l.displayName}</td>
                      <td>
                        <span
                          className={`g-badge ${l.verified ? "g-badge--go" : "g-badge--caution"}`}
                        >
                          {l.verified ? "verified" : "claimed"}
                        </span>
                      </td>
                      <td>
                        <form action={removeAccountLink}>
                          <input type="hidden" name="linkId" value={l.id} />
                          <button type="submit" className="g-btn g-btn--ghost">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {links.length === 0 ? (
                <div className="table-card__head muted">Nothing linked yet.</div>
              ) : null}
            </div>
          </div>

          <div className="g-card card-col">
            <span className="g-label">Shared with</span>
            {shares.length ? (
              shares.map((s) => (
                <form className="list-row" key={s.guildId} action={stopSharing}>
                  <input type="hidden" name="guildId" value={s.guildId} />
                  <span>{s.guildName}</span>
                  <button type="submit" className="g-btn g-btn--ghost">
                    Stop sharing
                  </button>
                </form>
              ))
            ) : (
              <span className="muted">No servers. Share with one by running /link in it.</span>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
