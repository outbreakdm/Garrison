import { getLeaderboard, getRanksSettings, levelForXp, listRankRewards } from "@garrison/db";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Ranks" };

export default async function RanksPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = getDb();
  const [settings, top, rewards] = await Promise.all([
    getRanksSettings(db, guild.id),
    getLeaderboard(db, guild.id, 25),
    listRankRewards(db, guild.id),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Ranks · Leveling</span>
          <h1>Leaderboard</h1>
          <p>
            {settings.enabled
              ? "Members earn XP for chatting, once a minute at most."
              : "Ranks are off. Turn them on with /ranks settings in Discord."}
          </p>
        </div>
      </div>
      <div className="grid-cards">
        <div className="g-card table-card">
          <div className="table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  {["Rank", "Member", "Level", "XP", "Messages"].map((h) => (
                    <th key={h} scope="col">
                      <span className="g-label">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.map((m, i) => (
                  <tr key={m.userId}>
                    <td className="mono">#{i + 1}</td>
                    <td>{m.username || <span className="mono">{m.userId}</span>}</td>
                    <td>
                      {m.level}{" "}
                      <span className="mono">
                        · {Math.floor((levelForXp(m.xp).intoLevel / levelForXp(m.xp).needed) * 100)}
                        %
                      </span>
                    </td>
                    <td className="mono">{m.xp.toLocaleString("en-US")}</td>
                    <td className="mono">{m.messages.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {top.length === 0 ? (
              <div className="table-card__head muted">Nobody has XP yet.</div>
            ) : null}
          </div>
        </div>
        <div className="g-card card-col">
          <span className="g-label">Level rewards</span>
          {rewards.length ? (
            rewards.map((r) => (
              <div className="list-row" key={r.level}>
                <span>Level {r.level}</span>
                <span className="mono">{r.roleId}</span>
              </div>
            ))
          ) : (
            <span className="muted">No rewards. Add one with /ranks reward.</span>
          )}
          <p className="g-help">Rewards can't carry moderation or admin powers.</p>
        </div>
      </div>
    </>
  );
}
