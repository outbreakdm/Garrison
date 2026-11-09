import { getOverview, listOpenQuarantines } from "@garrison/db";
import type { Metadata } from "next";
import { formatTime } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import {
  ChannelSelect,
  FormFoot,
  GearIcon,
  isEditing,
  SettingsNotice,
  Switch,
} from "@/components/settings";
import { getDb } from "@/lib/db";
import { guildOwnerId, listGuildRoles, listTextChannels } from "@/lib/discord";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { saveAntiRaid, saveVerification } from "../settings/actions";

export const metadata: Metadata = { title: "Gatehouse" };

const KINDS = [
  "lockdown_start",
  "lockdown_end",
  "release_quarantine",
  "post_verify_panel",
  "anti_nuke",
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-row">
      <span className="muted">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function Hidden({ guildId, kind }: { guildId: string; kind: string }) {
  return (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="page" value="gatehouse" />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
}

export default async function GatehousePage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild, session } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [{ gatehouse: g, activeLockdown: l }, quarantines, channels, roles, ownerId] =
    await Promise.all([
      getOverview(db, guild.id),
      listOpenQuarantines(db, guild.id),
      listTextChannels(guild.id).catch(() => []),
      listGuildRoles(guild.id).catch(() => []),
      guildOwnerId(guild.id).catch(() => null),
    ]);
  const isOwner = ownerId === session.userId;
  const roleName = (id: string | null | undefined) =>
    id ? `@${roles.find((r) => r.id === id)?.name ?? "deleted role"}` : "None";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Security</h1>
          <p>Lock the server, verify newcomers, and watch for raids and rogue admins.</p>
        </div>
      </div>

      <RequestsPanel guildId={guild.id} kinds={KINDS} query={query} />
      <SettingsNotice query={query} />

      <div className="grid-cards">
        <div className={`g-card card-col ${l ? "g-card--hud" : ""}`}>
          <span className="g-label">Lockdown</span>
          {l ? (
            <>
              <span className="g-badge g-badge--alert">Active</span>
              <Row label="Started" value={formatTime(l.startedAt)} />
              <Row
                label="Lifts"
                value={l.endsAt ? formatTime(l.endsAt) : "When someone lifts it"}
              />
              <Row label="Invites" value={l.invitesPaused ? "Paused" : "Open"} />
              <Row label="Reason" value={l.reason ?? "No reason given"} />
              <form action={requestAction}>
                <Hidden guildId={guild.id} kind="lockdown_end" />
                <button type="submit" className="g-btn g-btn--primary">
                  Lift lockdown
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="muted">
                Not locked. Locking stops @everyone talking in every channel; staff roles keep
                talking.
              </span>
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--secondary">
                  Lock the server…
                </summary>
                <form action={requestAction} className="card-col">
                  <Hidden guildId={guild.id} kind="lockdown_start" />
                  <label className="g-field">
                    <span>Lift automatically after</span>
                    <select className="g-input" name="durationMinutes" defaultValue="60">
                      <option value="0">Don't: lift it by hand</option>
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="120">2 hours</option>
                      <option value="360">6 hours</option>
                      <option value="1440">24 hours</option>
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" name="pauseInvites" defaultChecked />
                    <span>Pause invites too</span>
                  </label>
                  <label className="g-field">
                    <span>Reason (shown in the alert)</span>
                    <input
                      className="g-input"
                      name="reason"
                      maxLength={200}
                      placeholder="Raid in progress"
                    />
                  </label>
                  <button type="submit" className="g-btn g-btn--danger">
                    Lock the server now
                  </button>
                </form>
              </details>
            </>
          )}
        </div>

        <div className="g-card card-col" id="anti-raid">
          <span className="g-label">Anti-raid</span>
          <Row label="Status" value={g?.antiRaidEnabled ? "Armed" : "Off"} />
          <Row
            label="A raid is"
            value={g ? `${g.raidJoinCount} joins in ${g.raidWindowSeconds} s` : "—"}
          />
          <Row
            label="Response"
            value={g?.raidResponse === "alert" ? "Alert only" : "Lock the server"}
          />
          <Row
            label="Auto-unlock"
            value={g?.autoUnlockMinutes ? `${g.autoUnlockMinutes} min` : "Off"}
          />
          <Row
            label="Flag accounts under"
            value={g?.flagAccountAgeDays ? `${g.flagAccountAgeDays} days` : "Off"}
          />
          <Row
            label="Staff roles"
            value={g?.staffRoleIds.length ? g.staffRoleIds.map(roleName).join(", ") : "None"}
          />
          <details className="card-edit" open={isEditing(query, "anti-raid")}>
            <summary className="g-btn g-btn--secondary">
              <GearIcon />
              Change anti-raid
            </summary>
            {/* Keyed by last update, so the form re-mounts with the stored values after a save. */}
            <form
              action={saveAntiRaid}
              className="card-col"
              key={`raid-${g?.updatedAt.getTime() ?? 0}`}
            >
              <input type="hidden" name="guildId" value={guild.id} />
              <Switch
                name="antiRaidEnabled"
                defaultChecked={g?.antiRaidEnabled ?? true}
                label="Watch the join rate for raids"
              />
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
              <label className="g-field" htmlFor="staffRoleIds">
                <span>Staff roles (keep talking during a lockdown)</span>
                <select
                  className="g-input"
                  id="staffRoleIds"
                  name="staffRoleIds"
                  multiple
                  size={4}
                  defaultValue={g?.staffRoleIds ?? []}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
                </select>
                <span className="g-help">Up to 10. Ctrl/⌘-click to pick several.</span>
              </label>
              <FormFoot label="Save anti-raid" guildId={guild.id} />
            </form>
          </details>
        </div>

        <div className="g-card card-col" id="verification">
          <span className="g-label">Verification</span>
          <Row label="Status" value={g?.verifyRoleId ? "On" : "Off"} />
          <Row label="Gives" value={roleName(g?.verifyRoleId)} />
          <Row
            label="Min account age"
            value={g?.verifyMinAccountAgeDays ? `${g.verifyMinAccountAgeDays} days` : "Any"}
          />
          {g?.verifyRoleId ? (
            <form action={requestAction} className="card-col">
              <Hidden guildId={guild.id} kind="post_verify_panel" />
              <label className="g-field">
                <span>Post the Verify button in</span>
                <select className="g-input" name="channelId" required defaultValue="">
                  <option value="" disabled>
                    Pick a channel
                  </option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="g-btn g-btn--secondary">
                Post Verify button
              </button>
            </form>
          ) : null}
          <details className="card-edit" open={isEditing(query, "verification")}>
            <summary className="g-btn g-btn--secondary">
              <GearIcon />
              {g?.verifyRoleId ? "Change verification" : "Turn on verification"}
            </summary>
            <form
              action={saveVerification}
              className="card-col"
              key={`verify-${g?.updatedAt.getTime() ?? 0}`}
            >
              <input type="hidden" name="guildId" value={guild.id} />
              <label className="g-field" htmlFor="verifyRoleId">
                <span>Verification gives</span>
                <select
                  className="g-input"
                  id="verifyRoleId"
                  name="verifyRoleId"
                  defaultValue={g?.verifyRoleId ?? ""}
                >
                  <option value="">Verification off</option>
                  {roles
                    .filter((r) => !r.managed && !isDangerousRole(r.permissions))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                </select>
                <span className="g-help">
                  Roles with admin or moderation powers can't be the verified role.
                </span>
              </label>
              <label className="g-field" htmlFor="verifyMinAccountAgeDays">
                <span>Min account age (days)</span>
                <input
                  className="g-input"
                  id="verifyMinAccountAgeDays"
                  name="verifyMinAccountAgeDays"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={g?.verifyMinAccountAgeDays ?? 0}
                />
              </label>
              <FormFoot label="Save verification" guildId={guild.id} />
            </form>
          </details>
        </div>

        <div className="g-card card-col">
          <span className="g-label">Anti-nuke · owner only</span>
          {isOwner ? (
            <form action={requestAction} className="card-col" key={JSON.stringify(g)}>
              <Hidden guildId={guild.id} kind="anti_nuke" />
              <label className="check">
                <input type="checkbox" name="enabled" defaultChecked={g?.antiNukeEnabled ?? true} />
                <span>Strip a rogue admin's roles when they mass-delete or mass-ban</span>
              </label>
              <div className="field-row">
                <label className="g-field">
                  <span>Deletions per minute</span>
                  <input
                    className="g-input"
                    name="deleteThreshold"
                    type="number"
                    min={2}
                    max={50}
                    defaultValue={g?.nukeDeleteThreshold ?? 3}
                  />
                </label>
                <label className="g-field">
                  <span>Bans per minute</span>
                  <input
                    className="g-input"
                    name="banThreshold"
                    type="number"
                    min={2}
                    max={100}
                    defaultValue={g?.nukeBanThreshold ?? 5}
                  />
                </label>
              </div>
              <label className="g-field">
                <span>Trusted user IDs (never acted on)</span>
                <textarea
                  className="g-input"
                  name="trustedIds"
                  rows={2}
                  defaultValue={g?.antiNukeTrustedIds.join(", ") ?? ""}
                  placeholder="Up to 10 user IDs, separated by commas"
                />
                <span className="g-help">
                  In Discord: Settings → Advanced → Developer Mode, then right-click a member → Copy
                  User ID.
                </span>
              </label>
              <button type="submit" className="g-btn g-btn--primary">
                Save anti-nuke
              </button>
            </form>
          ) : (
            <>
              <Row label="Status" value={g?.antiNukeEnabled ? "Armed" : "Off"} />
              <Row
                label="Triggers at"
                value={
                  g
                    ? `${g.nukeDeleteThreshold} deletions or ${g.nukeBanThreshold} bans per minute`
                    : "—"
                }
              />
              <Row label="Trusted users" value={String(g?.antiNukeTrustedIds.length ?? 0)} />
              <p className="g-help">
                Only the server owner can change anti-nuke, so a compromised admin can't switch it
                off first.
              </p>
            </>
          )}
        </div>

        <div className="g-card card-col">
          <span className="g-label">Quarantined by anti-nuke · {quarantines.length}</span>
          {quarantines.length ? (
            quarantines.map((q) => (
              <div className="list-row" key={q.id}>
                <span>
                  {q.userTag} <span className="mono">{formatTime(q.createdAt)}</span>
                  <br />
                  <span className="muted">{q.reason}</span>
                </span>
                {q.kicked ? (
                  <span className="mono">Bot kicked</span>
                ) : (
                  <form action={requestAction}>
                    <Hidden guildId={guild.id} kind="release_quarantine" />
                    <input type="hidden" name="id" value={q.id} />
                    <button type="submit" className="g-btn g-btn--secondary">
                      Restore roles
                    </button>
                  </form>
                )}
              </div>
            ))
          ) : (
            <span className="muted">Nobody is quarantined.</span>
          )}
          <p className="g-help">Only the owner or a trusted user can restore roles.</p>
        </div>
      </div>
    </>
  );
}
