import { ledgerTypeLabels } from "@garrison/brand";
import { getLedgerSettings, memberNames, searchLedger, searchMembers } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import { When } from "@/components/format";
import { PageHead } from "@/components/PageHead";
import {
  ChannelSelect,
  FormFoot,
  GearIcon,
  isEditing,
  SettingsNotice,
  SettingsPanel,
} from "@/components/settings";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { PAGES } from "@/lib/pages";
import { isSnowflake } from "@/lib/security";
import { requireGuildAccess } from "@/lib/session";
import { saveLedger } from "../settings/actions";

export const metadata: Metadata = { title: PAGES.ledger.title };

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
  // The member filter takes a name or an ID. A name is looked up among the members
  // Garrison knows by name; one match filters, several are offered as choices.
  const asked = (q.user ?? "").trim().slice(0, 32);
  const db = await getDb();
  const matches = asked && !isSnowflake(asked) ? await searchMembers(db, guild.id, asked, 6) : [];
  const user = isSnowflake(asked) ? asked : matches.length === 1 ? matches[0]?.userId : undefined;
  const type = q.type && Object.hasOwn(ledgerTypeLabels, q.type) ? q.type : undefined;
  const before = q.before && /^\d{1,15}$/.test(q.before) ? Number(q.before) : undefined;
  const [settings, events, channels] = await Promise.all([
    getLedgerSettings(db, guild.id),
    searchLedger(db, { guildId: guild.id, userId: user, type, before, limit: PAGE }),
    listTextChannels(guild.id).catch(() => []),
  ]);
  const ledgerChannel = channels.find((c) => c.id === settings.channelId);
  const names = await memberNames(
    db,
    guild.id,
    [...events.flatMap((e) => [e.actorId, e.targetId]), user].filter((id): id is string =>
      Boolean(id),
    ),
  );
  for (const m of matches) names.set(m.userId, m.name);
  /** A member by the name Garrison knows them by; their ID shows on hover. */
  const who = (id: string | null) =>
    id ? (
      <Link
        className="nowrap"
        href={`/servers/${guild.id}/ledger?user=${id}`}
        title={`Show only ${names.get(id) ?? "this member"}'s events · ID ${id}`}
      >
        {names.get(id) ?? `Member …${id.slice(-4)}`}
      </Link>
    ) : (
      <span className="muted">—</span>
    );
  const last = events.at(-1);
  const older = new URLSearchParams({
    ...(user ? { user } : {}),
    ...(type ? { type } : {}),
    ...(last ? { before: String(last.id) } : {}),
  });

  return (
    <>
      <PageHead
        title={PAGES.ledger.title}
        description={`Who did what in the server, kept ${settings.retentionDays} days. Message content is never stored.`}
      >
        <a className="g-btn g-btn--ghost" href="?edit=settings#settings">
          <GearIcon />
          Settings
        </a>
      </PageHead>
      <SettingsNotice query={q} />

      <form className="g-card filter-row" method="get">
        <label className="g-field" htmlFor="user">
          <span>Member</span>
          <input
            className="g-input"
            id="user"
            name="user"
            defaultValue={user ? (names.get(user) ?? user) : asked}
            placeholder="Name or user ID"
            maxLength={32}
          />
        </label>
        <label className="g-field" htmlFor="type">
          <span>Kind of event</span>
          <select className="g-input" id="type" name="type" defaultValue={type ?? ""}>
            <option value="">Every kind</option>
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
        {asked || type ? (
          <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/ledger`}>
            Show everything
          </Link>
        ) : null}
        {asked && !user ? (
          <p className="filter-row__note" role="status">
            {matches.length > 1 ? (
              <>
                Several members match “{asked}”. Pick one:{" "}
                {matches.map((m) => (
                  <Link
                    className="chip"
                    key={m.userId}
                    href={`/servers/${guild.id}/ledger?${new URLSearchParams({
                      user: m.userId,
                      ...(type ? { type } : {}),
                    })}`}
                  >
                    {m.name}
                  </Link>
                ))}
              </>
            ) : (
              <>
                Garrison doesn't know anyone called “{asked}”, so events aren't filtered by member.
                Paste their user ID instead.
              </>
            )}
          </p>
        ) : null}
      </form>

      <div className="g-card table-card">
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["When", "Kind", "What happened", "By", "To"].map((h) => (
                  <th key={h} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <When date={e.createdAt} mono />
                  </td>
                  <td>
                    <span className="g-badge nowrap">{ledgerTypeLabels[e.type] ?? e.type}</span>
                  </td>
                  <td>
                    {e.summary}
                    {typeof e.data.reason === "string" ? (
                      <div className="muted">Reason: {e.data.reason}</div>
                    ) : null}
                  </td>
                  <td>{who(e.actorId)}</td>
                  <td>
                    {e.targetId === e.actorId ? <span className="muted">—</span> : who(e.targetId)}
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

      <SettingsPanel
        title="Event log settings"
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
        ]}
      >
        <form action={saveLedger} className="settings-form" key={settings.updatedAt.getTime()}>
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="settings-grid">
            <label className="g-field" htmlFor="channelId">
              <span>Post events in</span>
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
          <FormFoot label="Save event log settings" guildId={guild.id} />
        </form>
      </SettingsPanel>
    </>
  );
}
