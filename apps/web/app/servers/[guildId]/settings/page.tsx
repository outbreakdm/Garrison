import {
  getLedgerSettings,
  getOpsTimezone,
  getOverview,
  getRanksSettings,
  listSettingsChanges,
  type SettingsChange,
} from "@garrison/db";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";
import { FIELD_LABELS } from "@/lib/settings-schema";
import { saveGatehouse, saveLedger, saveOps, saveRanks, saveWatch, undoChange } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const SAVED: Record<string, string> = {
  watch: "Saved Watch settings.",
  gatehouse: "Saved Gatehouse settings.",
  ops: "Saved the raid time zone.",
  ranks: "Saved Ranks settings.",
  ledger: "Saved Ledger settings.",
  undo: "Undone.",
};
const ERRORS: Record<string, string> = {
  invalid: "Some values were out of range. Nothing was saved.",
  channel: "That channel isn't a text channel in this server. Nothing was saved.",
  timezone: "That isn't a time zone. Use a name like America/Chicago.",
  unchanged: "Nothing changed.",
  not_ready: "Garrison hasn't finished setting up this server. Try again in a minute.",
  not_found: "That change doesn't exist.",
  already_undone: "That change was already undone.",
  is_undo: "That's an undo. Change the setting again instead.",
  conflict: "Someone changed these settings since. Undo the newer change first.",
};

function describe(field: string, value: unknown, channels: Map<string, string>) {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (field === "announce") return ANNOUNCE[String(value)] ?? String(value);
  if (/channelId$/i.test(field)) return `#${channels.get(String(value)) ?? "deleted-channel"}`;
  return String(value);
}

const ANNOUNCE: Record<string, string> = {
  off: "off",
  same_channel: "where they posted",
  channel: "a set channel",
};

function ChannelSelect({
  name,
  value,
  channels,
  none,
}: {
  name: string;
  value: string | null;
  channels: { id: string; name: string }[];
  none: string;
}) {
  return (
    <select className="g-input" name={name} defaultValue={value ?? ""} id={name}>
      <option value="">{none}</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
    </select>
  );
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = getDb();
  const [overview, timezone, ranks, ledger, history, channels] = await Promise.all([
    getOverview(db, guild.id),
    getOpsTimezone(db, guild.id),
    getRanksSettings(db, guild.id),
    getLedgerSettings(db, guild.id),
    listSettingsChanges(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
  ]);
  const w = overview.watch;
  const g = overview.gatehouse;
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const undone = new Set(history.map((h) => h.revertsChangeId).filter(Boolean));
  const message = query.saved ? SAVED[query.saved] : undefined;
  const error = query.error ? ERRORS[query.error] : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Configure</span>
          <h1>Settings</h1>
          <p>
            Every change is recorded with who made it, and can be undone. Garrison picks changes up
            within a minute.
          </p>
        </div>
      </div>
      {message ? (
        <div className="notice notice--ok" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="notice" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid-cards">
        {/* Keyed by last update: after a save or undo the form re-mounts with the stored
            values, instead of keeping stale browser state that a later save would re-apply. */}
        <form
          action={saveWatch}
          id="watch"
          className="g-card card-col"
          key={`watch-${w?.updatedAt.getTime() ?? 0}`}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <span className="g-label">Watch · Moderation</span>
          <label className="g-field" htmlFor="logChannelId">
            <span>Log channel</span>
            <ChannelSelect
              name="logChannelId"
              value={w?.logChannelId ?? null}
              channels={channels}
              none="Don't log cases"
            />
            <span className="g-help">Every case is posted here.</span>
          </label>
          <label className="check">
            <input type="checkbox" name="dmMembers" defaultChecked={w?.dmMembers ?? true} />
            <span>DM members when they're moderated</span>
          </label>
          <label className="g-field" htmlFor="appealText">
            <span>How to appeal</span>
            <textarea
              className="g-input"
              id="appealText"
              name="appealText"
              maxLength={300}
              rows={3}
              defaultValue={w?.appealText ?? ""}
            />
            <span className="g-help">Shown in moderation DMs. Leave blank for the default.</span>
          </label>
          <button type="submit" className="g-btn g-btn--secondary">
            Save Watch
          </button>
        </form>

        <form
          action={saveGatehouse}
          id="gatehouse"
          className="g-card card-col"
          key={`gate-${g?.updatedAt.getTime() ?? 0}`}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <span className="g-label">Gatehouse · Anti-raid</span>
          <label className="check">
            <input
              type="checkbox"
              name="antiRaidEnabled"
              defaultChecked={g?.antiRaidEnabled ?? true}
            />
            <span>Watch the join rate for raids</span>
          </label>
          <div className="field-row">
            <label className="g-field" htmlFor="raidJoinCount">
              <span>Joins</span>
              <input
                className="g-input"
                id="raidJoinCount"
                name="raidJoinCount"
                type="number"
                min={3}
                max={200}
                defaultValue={g?.raidJoinCount ?? 10}
              />
            </label>
            <label className="g-field" htmlFor="raidWindowSeconds">
              <span>Within (s)</span>
              <input
                className="g-input"
                id="raidWindowSeconds"
                name="raidWindowSeconds"
                type="number"
                min={5}
                max={600}
                defaultValue={g?.raidWindowSeconds ?? 30}
              />
            </label>
          </div>
          <label className="g-field" htmlFor="raidResponse">
            <span>On a raid</span>
            <select
              className="g-input"
              id="raidResponse"
              name="raidResponse"
              defaultValue={g?.raidResponse ?? "lockdown"}
            >
              <option value="lockdown">Lock the server and pause invites</option>
              <option value="alert">Alert only</option>
            </select>
          </label>
          <div className="field-row">
            <label className="g-field" htmlFor="autoUnlockMinutes">
              <span>Auto-unlock (min)</span>
              <input
                className="g-input"
                id="autoUnlockMinutes"
                name="autoUnlockMinutes"
                type="number"
                min={0}
                max={1440}
                defaultValue={g?.autoUnlockMinutes ?? 15}
              />
            </label>
            <label className="g-field" htmlFor="flagAccountAgeDays">
              <span>Flag accounts under (days)</span>
              <input
                className="g-input"
                id="flagAccountAgeDays"
                name="flagAccountAgeDays"
                type="number"
                min={0}
                max={365}
                defaultValue={g?.flagAccountAgeDays ?? 7}
              />
            </label>
          </div>
          <label className="g-field" htmlFor="alertChannelId">
            <span>Alert channel</span>
            <ChannelSelect
              name="alertChannelId"
              value={g?.alertChannelId ?? null}
              channels={channels}
              none="Use the Watch log channel"
            />
          </label>
          <p className="g-help">
            Anti-nuke and trusted users stay owner-only: change them with /security in Discord.
          </p>
          <button type="submit" className="g-btn g-btn--secondary">
            Save Gatehouse
          </button>
        </form>

        <form action={saveOps} id="ops" className="g-card card-col" key={`ops-${timezone}`}>
          <input type="hidden" name="guildId" value={guild.id} />
          <span className="g-label">Ops · Events</span>
          <label className="g-field" htmlFor="timezone">
            <span>Raid time zone</span>
            <input
              className="g-input"
              id="timezone"
              name="timezone"
              maxLength={64}
              defaultValue={timezone}
              placeholder="America/Chicago"
            />
            <span className="g-help">Used when /raid create gets a date without a time zone.</span>
          </label>
          <button type="submit" className="g-btn g-btn--secondary">
            Save time zone
          </button>
        </form>

        <form
          action={saveRanks}
          id="ranks"
          className="g-card card-col"
          key={`ranks-${ranks.updatedAt.getTime()}`}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <span className="g-label">Ranks · Leveling</span>
          <label className="check">
            <input type="checkbox" name="enabled" defaultChecked={ranks.enabled} />
            <span>Give XP for messages</span>
          </label>
          <label className="g-field" htmlFor="announce">
            <span>Level-up messages</span>
            <select className="g-input" id="announce" name="announce" defaultValue={ranks.announce}>
              <option value="same_channel">Where the member posted</option>
              <option value="channel">In one channel</option>
              <option value="off">Don't announce</option>
            </select>
          </label>
          <label className="g-field" htmlFor="announceChannelId">
            <span>Level-up channel</span>
            <ChannelSelect
              name="announceChannelId"
              value={ranks.announceChannelId}
              channels={channels}
              none="Pick a channel"
            />
            <span className="g-help">Only used when level-ups go to one channel.</span>
          </label>
          <p className="g-help">
            Garrison counts who posted and when, never what they wrote. Set level rewards with
            /ranks reward in Discord.
          </p>
          <button type="submit" className="g-btn g-btn--secondary">
            Save Ranks
          </button>
        </form>

        <form
          action={saveLedger}
          id="ledger"
          className="g-card card-col"
          key={`ledger-${ledger.updatedAt.getTime()}`}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <span className="g-label">Ledger · Logs</span>
          <label className="g-field" htmlFor="channelId">
            <span>Ledger channel</span>
            <ChannelSelect
              name="channelId"
              value={ledger.channelId}
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
              defaultValue={ledger.retentionDays}
            />
            <span className="g-help">7 to 365. Older events are removed automatically.</span>
          </label>
          <button type="submit" className="g-btn g-btn--secondary">
            Save Ledger
          </button>
        </form>
      </div>

      <div className="g-card table-card">
        <div className="table-card__head">
          <span className="g-label">History</span>
        </div>
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["When", "Who", "Change", ""].map((h) => (
                  <th key={h || "actions"} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h: SettingsChange) => (
                <tr key={h.id} className={undone.has(h.id) ? "revoked" : undefined}>
                  <td className="mono">
                    {h.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </td>
                  <td>{h.username}</td>
                  <td>
                    {h.revertsChangeId ? <span className="muted">Undo: </span> : null}
                    {Object.entries(h.changes).map(([field, { from, to }]) => (
                      <div key={field}>
                        {FIELD_LABELS[field] ?? field}: {describe(field, from, names)} →{" "}
                        {describe(field, to, names)}
                      </div>
                    ))}
                  </td>
                  <td>
                    {!h.revertsChangeId && !undone.has(h.id) ? (
                      <form action={undoChange}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="changeId" value={h.id} />
                        <button type="submit" className="g-btn g-btn--ghost">
                          Undo
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 ? (
            <div className="table-card__head muted">No changes yet.</div>
          ) : null}
        </div>
      </div>
    </>
  );
}
