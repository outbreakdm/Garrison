import { getOverview } from "@garrison/db";
import type { Metadata } from "next";
import { formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Gatehouse" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-row">
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

export default async function GatehousePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const { gatehouse: g, activeLockdown: l } = await getOverview(await getDb(), guild.id);
  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Gatehouse · Security</span>
          <h1>Security</h1>
          <p>Read-only for now. Change these with /security in Discord.</p>
        </div>
      </div>
      <div className="grid-cards">
        <div className={`g-card card-col ${l ? "g-card--hud" : ""}`}>
          <span className="g-label">Lockdown</span>
          {l ? (
            <>
              <span className="g-badge g-badge--alert">Active</span>
              <Row label="Started" value={formatTime(l.startedAt)} />
              <Row
                label="Lifts"
                value={l.endsAt ? formatTime(l.endsAt) : "By hand: /lockdown end"}
              />
              <Row label="Invites" value={l.invitesPaused ? "Paused" : "Open"} />
              <Row label="Reason" value={l.reason ?? "No reason given"} />
            </>
          ) : (
            <span className="muted">No lockdown active.</span>
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
        </div>
        <div className="g-card card-col">
          <span className="g-label">Anti-nuke</span>
          <Row label="Status" value={g?.antiNukeEnabled ? "Armed" : "Off"} />
          <Row
            label="Triggers at"
            value={
              g
                ? `${g.nukeDeleteThreshold} deletions or ${g.nukeBanThreshold} bans in ${g.nukeWindowSeconds} s`
                : "—"
            }
          />
          <Row label="Trusted users" value={String(g?.antiNukeTrustedIds.length ?? 0)} />
          <Row label="Staff roles" value={String(g?.staffRoleIds.length ?? 0)} />
        </div>
      </div>
    </>
  );
}
