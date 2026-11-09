import { type LinkProvider, linkProviders } from "@garrison/brand";
import { getRoster } from "@garrison/db";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Barracks" };

function detail(d: Record<string, unknown>) {
  if (typeof d.totalLevel === "number") return `total ${d.totalLevel} · combat ${d.combatLevel}`;
  if (typeof d.level === "number")
    return [d.level, d.className, d.realm].filter(Boolean).join(" · ");
  return "";
}

export default async function BarracksPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const roster = await getRoster(await getDb(), guild.id);
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
      </div>
      <div className="g-card table-card">
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["Member", "Game", "Account", "Details", ""].map((h) => (
                  <th key={h || "status"} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.flatMap((m) =>
                m.links.map((l) => (
                  <tr key={l.id}>
                    <td>{m.username || <span className="mono">{m.userId}</span>}</td>
                    <td>{linkProviders[l.provider as LinkProvider]?.label ?? l.provider}</td>
                    <td>{l.displayName}</td>
                    <td className="mono">{detail(l.details)}</td>
                    <td>
                      <span
                        className={`g-badge ${l.verified ? "g-badge--go" : "g-badge--caution"}`}
                      >
                        {l.verified ? "verified" : "claimed"}
                      </span>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {roster.length === 0 ? (
            <div className="table-card__head muted">Nobody has shared accounts here yet.</div>
          ) : null}
        </div>
      </div>
    </>
  );
}
