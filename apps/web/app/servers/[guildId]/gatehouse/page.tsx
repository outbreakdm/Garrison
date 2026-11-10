import { getOverview, listDashboardActions, listOpenQuarantines } from "@garrison/db";
import type { Metadata } from "next";
import { formatTime, When } from "@/components/format";
import { Outcome } from "@/components/Outcome";
import { CardHead, PageHead } from "@/components/PageHead";
import { RequestsHistory, RequestsPanel } from "@/components/RequestsPanel";
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
import { errorAt, latestOutcome } from "@/lib/outcome";
import { PAGES } from "@/lib/pages";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { saveAntiRaid, saveVerification } from "../settings/actions";

export const metadata: Metadata = { title: PAGES.gatehouse.title };

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
      <span className="list-row__value">{value}</span>
    </div>
  );
}

/** The fields every request form here sends; `at` is the card its result shows on. */
function Hidden({ guildId, kind, at }: { guildId: string; kind: string; at: string }) {
  return (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="page" value="gatehouse" />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="at" value={at} />
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
  const [{ gatehouse: g, activeLockdown: l }, quarantines, channels, roles, ownerId, actions] =
    await Promise.all([
      getOverview(db, guild.id),
      listOpenQuarantines(db, guild.id),
      listTextChannels(guild.id).catch(() => []),
      listGuildRoles(guild.id).catch(() => []),
      guildOwnerId(guild.id).catch(() => null),
      listDashboardActions(db, guild.id, 30),
    ]);
  /** Your last request from one card, and why it wasn't sent if it wasn't. */
  const result = (at: string, kinds: string[]) => (
    <Outcome
      action={latestOutcome(actions, { userId: session.userId, kinds })}
      error={errorAt(query, at)}
    />
  );
  const isOwner = ownerId === session.userId;
  /** A protection's state. Off is flagged: it's the server's choice, but worth seeing. */
  const onOff = (on: boolean | undefined) => (
    <span className={`g-badge ${on ? "g-badge--go" : "g-badge--caution"}`}>
      {on ? "On" : "Off"}
    </span>
  );
  const roleName = (id: string | null | undefined) =>
    id ? `@${roles.find((r) => r.id === id)?.name ?? "deleted role"}` : "None";

  return (
    <>
      <PageHead
        title={PAGES.gatehouse.title}
        description="Lock the server in an emergency, and set the protections that run by themselves."
      />

      <RequestsPanel kinds={KINDS} query={query} actions={actions} />
      <SettingsNotice query={query} />

      <section
        className={`g-card card-col ${l ? "g-card--hud" : ""}`}
        id="lockdown"
        aria-labelledby="lockdown-title"
      >
        <CardHead
          title={<span id="lockdown-title">Lockdown</span>}
          help="Stops @everyone posting in every channel until it's lifted. Staff roles keep talking. Use it when the server is being raided."
        >
          {l ? (
            <span className="g-badge g-badge--alert">Locked</span>
          ) : (
            <span className="g-badge">Not locked</span>
          )}
        </CardHead>
        <div className="lockdown-body">
          {l ? (
            <>
              <Row label="Started" value={formatTime(l.startedAt)} />
              <Row
                label="Lifts"
                value={l.endsAt ? formatTime(l.endsAt) : "When someone lifts it"}
              />
              <Row label="Invites" value={l.invitesPaused ? "Paused" : "Open"} />
              <Row label="Reason" value={l.reason ?? "No reason given"} />
              <form action={requestAction}>
                <Hidden guildId={guild.id} kind="lockdown_end" at="lockdown" />
                <button type="submit" className="g-btn g-btn--primary">
                  Lift lockdown
                </button>
              </form>
            </>
          ) : (
            <details className="confirm">
              <summary className="confirm__toggle g-btn g-btn--secondary">Lock the server…</summary>
              <form action={requestAction} className="card-col">
                <Hidden guildId={guild.id} kind="lockdown_start" at="lockdown" />
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
          )}
        </div>
        {result("lockdown", ["lockdown_start", "lockdown_end"])}
      </section>

      <div className="section-head">
        <h2>Always-on protection</h2>
        <p>These run by themselves. Each change is kept in Settings history.</p>
      </div>
      <div className="grid-2">
        <section className="g-card card-col" id="anti-raid" aria-labelledby="anti-raid-title">
          <CardHead
            title={<span id="anti-raid-title">Anti-raid</span>}
            help="Watches how fast people join. Too many at once is treated as a raid."
          >
            {onOff(g?.antiRaidEnabled)}
          </CardHead>
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
        </section>

        <section className="g-card card-col" id="verification" aria-labelledby="verify-title">
          <CardHead
            title={<span id="verify-title">Verification</span>}
            help="Newcomers press a Verify button to get a role, so accounts that join can't post right away."
          >
            {g?.verifyRoleId ? (
              <span className="g-badge g-badge--go">On</span>
            ) : (
              <span className="g-badge">Off</span>
            )}
          </CardHead>
          <Row label="Role it gives" value={roleName(g?.verifyRoleId)} />
          <Row
            label="Min account age"
            value={g?.verifyMinAccountAgeDays ? `${g.verifyMinAccountAgeDays} days` : "Any"}
          />
          {g?.verifyRoleId ? (
            <form action={requestAction} className="card-col">
              <Hidden guildId={guild.id} kind="post_verify_panel" at="verification" />
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
          {result("verification", ["post_verify_panel"])}
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
        </section>

        <section className="g-card card-col" id="anti-nuke" aria-labelledby="anti-nuke-title">
          <CardHead
            title={<span id="anti-nuke-title">Anti-nuke</span>}
            help="Stops one admin or bot that starts mass-deleting channels and roles, or mass-banning, by taking its roles away. Only the server owner can change it."
          >
            {onOff(g?.antiNukeEnabled)}
          </CardHead>
          {isOwner ? (
            <form action={requestAction} className="card-col" key={JSON.stringify(g)}>
              <Hidden guildId={guild.id} kind="anti_nuke" at="anti-nuke" />
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
                You aren't the owner, so this is read-only: a compromised admin can't switch it off
                first.
              </p>
            </>
          )}
          {result("anti-nuke", ["anti_nuke"])}
        </section>

        <section className="g-card card-col" id="quarantines" aria-labelledby="quarantine-title">
          <CardHead
            title={<span id="quarantine-title">Quarantined by anti-nuke</span>}
            help="Members whose roles were taken away. Restore them if it was a false alarm. Only the owner or a trusted user can."
          >
            {quarantines.length ? (
              <span className="g-badge g-badge--alert">{quarantines.length}</span>
            ) : null}
          </CardHead>
          {quarantines.length ? (
            quarantines.map((q) => (
              <div className="list-row" key={q.id}>
                <span>
                  {q.userTag} <When date={q.createdAt} mono />
                  <br />
                  <span className="muted">{q.reason}</span>
                </span>
                {q.kicked ? (
                  <span className="mono">Bot kicked</span>
                ) : (
                  <form action={requestAction}>
                    <Hidden guildId={guild.id} kind="release_quarantine" at="quarantines" />
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
          {result("quarantines", ["release_quarantine"])}
        </section>
      </div>

      <RequestsHistory kinds={KINDS} actions={actions} />
    </>
  );
}
