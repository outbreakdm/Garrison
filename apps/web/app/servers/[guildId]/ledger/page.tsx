import { ledgerTypeLabels } from "@garrison/brand";
import { getLedgerSettings, searchLedger } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import {
  ChannelSelect,
  FormFoot,
  GearIcon,
  isEditing,
  SettingsNotice,
  SettingsPanel,
  Switch,
} from "@/components/settings";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { isSnowflake } from "@/lib/security";
import { requireGuildAccess } from "@/lib/session";
import { saveLedger } from "../settings/actions";

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
  const [settings, events, channels] = await Promise.all([
    getLedgerSettings(db, guild.id),
    searchLedger(db, { guildId: guild.id, userId: user, type, before, limit: PAGE }),
    listTextChannels(guild.id).catch(() => []),
  ]);
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
          <h1>Event log</h1>
          <p>
            Who did what, kept {settings.retentionDays} days.{" "}
            {settings.keepMessageText
              ? "The text of deleted and edited messages is kept too."
              : "Message text isn't kept."}
          </p>
        </div>
        <a className="g-btn g-btn--secondary" href="?edit=settings#settings">
          <GearIcon />
          Ledger settings
        </a>
      </div>
      <SettingsNotice query={q} />

      <SettingsPanel
        title="Ledger settings"
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
              <span>Ledger channel</span>
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
          <FormFoot label="Save Ledger settings" guildId={guild.id} />
        </form>
      </SettingsPanel>

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
              <Art slot="empty" className="empty-art" decorative />
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
