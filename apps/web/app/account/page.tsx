import { listLinks, listSharesForUser, RANK_CARD_LIMITS } from "@garrison/db";
import type { Metadata } from "next";
import { GameMark, linkDetail, providerLabel } from "@/components/GameMark";
import { Topbar } from "@/components/Topbar";
import { WOW_REGIONS } from "@/lib/barracks";
import { battlenetConfigured } from "@/lib/battlenet";
import { getDb } from "@/lib/db";
import { rankDetailsForms } from "@/lib/rank-details";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import { removeAccountLink, saveMyRankDetails, stopSharing } from "./actions";

export const metadata: Metadata = { title: "Your accounts" };

const MESSAGES: Record<string, string> = {
  "linked=discord": "Linked the game accounts from your Discord Connections.",
  "linked=wow": "Linked your World of Warcraft characters.",
  "removed=1": "Removed.",
  "unshared=1": "That server's roster no longer shows your accounts.",
  "rank=saved": "Saved. /rank shows them on your card.",
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
  const db = await getDb();
  const [links, shares, rankForms] = await Promise.all([
    listLinks(db, session.userId),
    listSharesForUser(db, session.userId),
    rankDetailsForms(session.userId).catch(() => []),
  ]);
  const wow = battlenetConfigured();

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back="/account" />
      <main className="shell">
        <div className="main">
          <div className="page-head">
            <div>
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

          <div className="accounts-layout">
            <div className="card-col">
              <section className="g-card table-card" aria-labelledby="linked-title">
                <div className="table-card__head card-head">
                  <h2 className="card-title" id="linked-title">
                    Linked <span className="count">{links.length}</span>
                  </h2>
                  <span className="g-help">
                    Verified means Discord or Battle.net proved it's yours.
                  </span>
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
                            className="g-btn g-btn--ghost"
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
                      Nothing linked yet. Pick a way under Link a game: Discord Connections brings
                      in everything you've already connected there.
                    </p>
                  </div>
                )}
              </section>

              {rankForms.length ? (
                <section className="g-card card-col" id="rank-cards" aria-labelledby="rank-title">
                  <h2 className="card-title" id="rank-title">
                    Your rank cards
                  </h2>
                  <p className="g-help">
                    These servers' rank cards show a few details about you. Same as /rankcard in
                    Discord.
                  </p>
                  {rankForms.map((r) => (
                    <form
                      className="card-col rank-details"
                      action={saveMyRankDetails}
                      key={r.guildId}
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

              <section className="g-card table-card" aria-labelledby="shared-title">
                <div className="table-card__head card-head">
                  <h2 className="card-title" id="shared-title">
                    Shared with <span className="count">{shares.length}</span>
                  </h2>
                  <span className="g-help">These servers' rosters show your linked accounts.</span>
                </div>
                {shares.length ? (
                  <ul className="game-list">
                    {shares.map((s) => (
                      <li key={s.guildId}>
                        <form className="game-row" action={stopSharing}>
                          <input type="hidden" name="guildId" value={s.guildId} />
                          <span className="guild-icon guild-icon--text" aria-hidden="true">
                            {s.guildName.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="game-row__name">
                            <strong>{s.guildName}</strong>
                          </span>
                          <span />
                          <button type="submit" className="g-btn g-btn--ghost">
                            Stop sharing
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-block">
                    <p>No servers yet. Run /link in a server to share your accounts with it.</p>
                  </div>
                )}
              </section>
            </div>

            <section className="g-card table-card" aria-labelledby="link-more">
              <div className="table-card__head">
                <h2 className="card-title" id="link-more">
                  Link a game
                </h2>
              </div>
              <div className="link-option">
                <span className="link-option__title">
                  Discord Connections <span className="g-badge g-badge--go">Verified</span>
                </span>
                <p>
                  Steam, Battle.net, Riot, Xbox, PlayStation and more: whatever you've connected in
                  Discord under Settings → Connections. Run it again after you connect something
                  new.
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
          </div>
        </div>
      </main>
    </>
  );
}
