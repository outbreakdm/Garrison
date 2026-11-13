import { ledgerTypeLabels } from "@garrison/brand";
import {
  entitlements,
  getGuildPlan,
  getLedgerSettings,
  searchLedger,
  topInviters,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { formatTime } from "@/components/format";
import {
  ChannelSelect,
  FormFoot,
  isEditing,
  SettingsNotice,
  SettingsPanel,
  Switch,
} from "@/components/settings";
import { getDb } from "@/lib/db";
import { listTextChannels, memberNames, searchMembers } from "@/lib/discord";
import { isSnowflake } from "@/lib/security";
import { requireGuildAccess } from "@/lib/session";
import { saveLedger } from "../settings/actions";

export const metadata: Metadata = { title: "Logs" };

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
  // A member by name or ID: a name is looked up in the server, its first match is used.
  const userQuery = (q.user ?? "").trim().replace(/^@/, "").slice(0, 32);
  let user = isSnowflake(userQuery) ? userQuery : undefined;
  if (!user && userQuery) user = (await searchMembers(guild.id, userQuery).catch(() => []))[0]?.id;
  const userNotFound = Boolean(userQuery && !user);
  const type = q.type && Object.hasOwn(ledgerTypeLabels, q.type) ? q.type : undefined;
  const before = q.before && /^\d{1,15}$/.test(q.before) ? Number(q.before) : undefined;
  const db = await getDb();
  const [settings, events, channels, inviters, plan] = await Promise.all([
    getLedgerSettings(db, guild.id),
    searchLedger(db, { guildId: guild.id, userId: user, type, before, limit: PAGE }),
    listTextChannels(guild.id).catch(() => []),
    topInviters(db, guild.id),
    getGuildPlan(db, guild.id),
  ]);
  const names = await memberNames(
    guild.id,
    events.flatMap((e) => [e.actorId, e.targetId]).filter((id): id is string => Boolean(id)),
  );
  const canExport = entitlements(plan)["ledger.export"];
  const exportQuery = new URLSearchParams({ ...(user ? { user } : {}), ...(type ? { type } : {}) });
  const ledgerChannel = channels.find((c) => c.id === settings.channelId);
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
          <h1>Logs</h1>
          <p>
            Who did what, kept {settings.retentionDays} days.{" "}
            {settings.keepMessageText
              ? "The text of deleted and edited messages is kept too."
              : "Message text isn't kept."}
          </p>
        </div>
      </div>
      <SettingsNotice query={q} />
      {userNotFound ? (
        <div className="notice" role="status">
          No member here matches “{userQuery}”. Showing every event; try their user ID.
        </div>
      ) : null}

      <SettingsPanel
        title="Log settings"
        open={isEditing(q, "settings")}
        facts={[
          {
            label: "Channel",
            value: ledgerChannel
              ? `#${ledgerChannel.name}`
              : settings.channelId
                ? "Deleted"
                : "Dashboard only",
          },
          { label: "Kept for", value: `${settings.retentionDays} days` },
          { label: "Message text", value: settings.keepMessageText ? "Kept" : "Not kept" },
        ]}
      >
        <form action={saveLedger} className="settings-form" key={settings.updatedAt.getTime()}>
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="settings-grid">
            <label className="g-field" htmlFor="channelId">
              <span>Log channel</span>
              <ChannelSelect
                name="channelId"
                value={settings.channelId}
                channels={channels}
                none="Dashboard only"
              />
              <span className="g-help">Each event also gets a line here.</span>
            </label>
            <label className="g-field" htmlFor="retentionDays">
              <span>Keep events for (days)</span>
              <input
                className="g-input"
                id="retentionDays"
                name="retentionDays"
                type="number"
                min={7}
                max={365}
                defaultValue={settings.retentionDays}
              />
              <span className="g-help">7 to 365. Older events are removed automatically.</span>
            </label>
          </div>
          <Switch
            name="keepMessageText"
            defaultChecked={settings.keepMessageText}
            label="Keep the text of deleted and edited messages"
            help="Lets moderators see what was removed or changed. Garrison only has the text of messages it saw since its last restart, and the text goes with the event when it expires."
          />
          <FormFoot label="Save log settings" guildId={guild.id} />
        </form>
      </SettingsPanel>

      <form className="g-card filter-row" method="get">
        <label className="g-field" htmlFor="user">
          <span>Member</span>
          <input
            className="g-input"
            id="user"
            name="user"
            type="search"
            defaultValue={userQuery}
            placeholder="Name or user ID"
            maxLength={32}
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

      {inviters.length ? (
        <section className="g-card card-col" aria-labelledby="inviters-title">
          <h2 className="card-title" id="inviters-title">
            Top inviters, last 30 days
          </h2>
          <p className="chip-row">
            {inviters.map((i) => (
              <Link
                className="g-badge"
                key={i.inviterId}
                href={`/servers/${guild.id}/ledger?user=${i.inviterId}`}
              >
                {i.inviterName ?? i.inviterId} · {i.joins}
              </Link>
            ))}
          </p>
        </section>
      ) : null}

      <div className="row-between">
        <span className="g-help">
          {canExport
            ? "Download what this filter shows, up to 20,000 events."
            : "Downloading the log as a spreadsheet is part of Garrison Pro."}
        </span>
        {canExport ? (
          <a
            className="g-btn g-btn--secondary"
            href={`/servers/${guild.id}/ledger/export${exportQuery.size ? `?${exportQuery}` : ""}`}
            download
          >
            Download CSV
          </a>
        ) : (
          <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/plan`}>
            See Pro
          </Link>
        )}
      </div>

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
                  <td className="mono">{formatTime(e.createdAt)}</td>
                  <td>
                    <span className="g-badge">{ledgerTypeLabels[e.type] ?? e.type}</span>
                  </td>
                  <td className="ledger-what">
                    {e.summary}
                    {typeof e.data.reason === "string" ? (
                      <div className="muted">Reason: {e.data.reason}</div>
                    ) : null}
                    {typeof e.data.text === "string" ? (
                      <blockquote className="ledger-text">{e.data.text}</blockquote>
                    ) : null}
                    {typeof e.data.before === "string" && typeof e.data.after === "string" ? (
                      <div className="ledger-edit">
                        <blockquote className="ledger-text ledger-text--before">
                          {e.data.before}
                        </blockquote>
                        <blockquote className="ledger-text">{e.data.after}</blockquote>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {e.actorId ? (
                      <Link href={`/servers/${guild.id}/ledger?user=${e.actorId}`}>
                        {names.get(e.actorId) ?? e.actorId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {e.targetId ? (
                      <Link href={`/servers/${guild.id}/ledger?user=${e.targetId}`}>
                        {names.get(e.targetId) ?? e.targetId}
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
            <EmptyState
              compact
              mark="log"
              title={user || type ? "No events match these filters" : "No events yet"}
              action={
                user || type
                  ? { label: "Clear filters", href: `/servers/${guild.id}/ledger` }
                  : undefined
              }
            >
              {user || type
                ? "Try another member or event type."
                : "Joins, leaves, bans, role and channel changes appear here as they happen."}
            </EmptyState>
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
