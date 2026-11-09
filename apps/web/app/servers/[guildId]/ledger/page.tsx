import { ledgerTypeLabels } from "@garrison/brand";
import { getLedgerSettings, searchLedger } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { isSnowflake } from "@/lib/security";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Ledger" };

const PAGE = 50;

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const q = await searchParams;
  // Filters come from the URL: accept only known shapes, ignore anything else.
  const user = q.user && isSnowflake(q.user.trim()) ? q.user.trim() : undefined;
  const type = q.type && Object.hasOwn(ledgerTypeLabels, q.type) ? q.type : undefined;
  const before = q.before && /^\d{1,15}$/.test(q.before) ? Number(q.before) : undefined;
  const db = await getDb();
  const [settings, events] = await Promise.all([
    getLedgerSettings(db, guild.id),
    searchLedger(db, { guildId: guild.id, userId: user, type, before, limit: PAGE }),
  ]);
  const last = events.at(-1);
  const older = new URLSearchParams({
    ...(user ? { user } : {}),
    ...(type ? { type } : {}),
    ...(last ? { before: String(last.id) } : {}),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Ledger · Logs</span>
          <h1>Event log</h1>
          <p>
            Who did what, kept {settings.retentionDays} days. Message content is never stored.
            <a href={`/servers/${guild.id}/settings#ledger`}>Change retention or the log channel</a>
          </p>
        </div>
      </div>

      <form className="g-card filter-row" method="get">
        <label className="g-field" htmlFor="user">
          <span>Member ID</span>
          <input
            className="g-input"
            id="user"
            name="user"
            defaultValue={user ?? ""}
            placeholder="e.g. 123456789012345678"
            inputMode="numeric"
            maxLength={20}
          />
        </label>
        <label className="g-field" htmlFor="type">
          <span>Event</span>
          <select className="g-input" id="type" name="type" defaultValue={type ?? ""}>
            <option value="">All events</option>
            {Object.entries(ledgerTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="g-btn g-btn--secondary">
          Filter
        </button>
        {user || type ? (
          <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/ledger`}>
            Clear
          </Link>
        ) : null}
      </form>

      <div className="g-card table-card">
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["#", "When", "Event", "What", "By", "Target"].map((h) => (
                  <th key={h} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.id}</td>
                  <td className="mono">
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </td>
                  <td>
                    <span className="g-badge">{ledgerTypeLabels[e.type] ?? e.type}</span>
                  </td>
                  <td>
                    {e.summary}
                    {typeof e.data.reason === "string" ? (
                      <div className="muted">Reason: {e.data.reason}</div>
                    ) : null}
                  </td>
                  <td className="mono">
                    {e.actorId ? (
                      <Link href={`/servers/${guild.id}/ledger?user=${e.actorId}`}>
                        {e.actorId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="mono">
                    {e.targetId ? (
                      <Link href={`/servers/${guild.id}/ledger?user=${e.targetId}`}>
                        {e.targetId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 ? (
            <div className="table-card__head muted">
              No events{user || type ? " match these filters" : " yet"}.
            </div>
          ) : null}
        </div>
      </div>
      {events.length === PAGE ? (
        <Link
          className="g-btn g-btn--secondary pager"
          href={`/servers/${guild.id}/ledger?${older}`}
        >
          Older events
        </Link>
      ) : null}
    </>
  );
}
