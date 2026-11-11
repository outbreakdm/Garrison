import { getRoster } from "@garrison/db";
import type { Metadata } from "next";
import { Art } from "@/components/Art";
import { GameMark, linkDetail, providerLabel } from "@/components/GameMark";
import { MemberAvatar } from "@/components/MemberAvatar";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Barracks" };

export default async function BarracksPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const roster = await getRoster(await getDb(), guild.id);
  const accounts = roster.reduce((n, m) => n + m.links.length, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Roster</h1>
          <p>
            Game accounts members chose to share here with /link. Verified accounts were proven
            through Discord or Battle.net; claimed ones weren't.
          </p>
        </div>
        {roster.length ? (
          <span className="mono">
            {roster.length} {roster.length === 1 ? "member" : "members"} · {accounts}{" "}
            {accounts === 1 ? "account" : "accounts"}
          </span>
        ) : null}
      </div>
      {roster.length ? (
        <ul className="roster-cards">
          {roster.map((m) => {
            const name = m.username || `Member ${m.userId.slice(-4)}`;
            return (
              <li className="g-card roster-card" key={m.userId}>
                <div className="roster-card__head">
                  <MemberAvatar name={name} src={null} />
                  <strong>{name}</strong>
                  <span className="mono">{m.links.length}</span>
                </div>
                <ul className="game-list">
                  {m.links.map((l) => (
                    <li className="game-row" key={l.id}>
                      <GameMark provider={l.provider} small />
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
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="g-card picker__empty">
          <Art slot="empty" className="empty-art" decorative />
          <div>
            <h2 className="card-title">Nobody has shared accounts here yet</h2>
            <p>
              Members run /link in this server to share the game accounts on their Account page.
              They can stop sharing at any time.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
