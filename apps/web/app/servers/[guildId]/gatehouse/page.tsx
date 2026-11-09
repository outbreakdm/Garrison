import { getOverview, listOpenQuarantines } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { formatTime } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { guildOwnerId, listGuildRoles, listTextChannels } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";

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
      <span>{label}</span>
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
  const settings = `/servers/${guild.id}/settings#gatehouse`;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Gatehouse · Security</span>
          <h1>Security</h1>
          <p>
            Lock the server, verify newcomers, and watch for raids and rogue admins.{" "}
            <Link href={settings}>Anti-raid and verification settings</Link>
          </p>
        </div>
      </div>

      <RequestsPanel guildId={guild.id} kinds={KINDS} query={query} />

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

        <div className="g-card card-col">
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
          <Link className="g-btn g-btn--secondary" href={settings}>
            Change anti-raid
          </Link>
        </div>

        <div className="g-card card-col">
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
          ) : (
            <Link className="g-btn g-btn--secondary" href={settings}>
              Turn on verification
            </Link>
          )}
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
