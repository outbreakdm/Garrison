import { listRecentCases } from "@garrison/db";
import type { Metadata } from "next";
import { ActionBadge, formatDuration } from "@/components/format";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const cases = await listRecentCases(getDb(), guild.id, 50);
  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Watch · Moderation</span>
          <h1>Cases</h1>
          <p>The latest 50 cases. Undo a case from Discord with /case.</p>
        </div>
      </div>
      <div className="g-card table-card">
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["Case", "Action", "Member", "Reason", "By", "When"].map((h) => (
                  <th key={h} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className={c.revokedAt ? "revoked" : undefined}>
                  <td className="mono">#{c.caseNumber}</td>
                  <td>
                    <ActionBadge action={c.action} />{" "}
                    <span className="mono">{formatDuration(c.durationSeconds)}</span>
                  </td>
                  {/* React escapes all of this: user-typed reasons can't inject markup. */}
                  <td>{c.targetTag ?? "—"}</td>
                  <td>
                    {c.reason ?? <span className="muted">No reason given</span>}
                    {c.revokedAt ? <span className="muted"> · undone</span> : null}
                  </td>
                  <td className="muted">
                    {c.source === "manual"
                      ? c.moderatorTag
                      : c.source === "escalation"
                        ? "Escalation rule"
                        : "Automod"}
                  </td>
                  <td className="mono">
                    {c.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cases.length === 0 ? <div className="table-card__head muted">No cases yet.</div> : null}
        </div>
      </div>
    </>
  );
}
