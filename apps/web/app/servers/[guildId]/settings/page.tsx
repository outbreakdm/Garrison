import {
  entitlements,
  getGuildPlan,
  getLedgerSettings,
  getOpsTimezone,
  getOverview,
  getRanksSettings,
  listSettingsChanges,
  type SettingsChange,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { RequestsPanel } from "@/components/RequestsPanel";
import { SettingsNotice } from "@/components/settings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getDb } from "@/lib/db";
import { botLook, listGuildRoles, listTextChannels } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";
import { FIELD_LABELS, ladderText, templatesChangeText } from "@/lib/settings-schema";
import { currentTheme } from "@/lib/theme";
import { requestAction } from "../requests";
import { saveOps, undoChange } from "./actions";
import { BotProfileForm } from "./BotProfileForm";

export const metadata: Metadata = { title: "Settings" };

function describe(
  field: string,
  value: unknown,
  channels: Map<string, string>,
  roleNames: Map<string, string>,
) {
  if (field === "rules") return ladderText(value);
  if (field === "rewards")
    return Array.isArray(value) && value.length
      ? value
          .map(
            (r: { level: number; roleId: string }) =>
              `level ${r.level}: @${roleNames.get(r.roleId) ?? "deleted-role"}`,
          )
          .join("; ")
      : "none";
  if (field === "staffRoleIds")
    return Array.isArray(value) && value.length
      ? value.map((id) => `@${roleNames.get(String(id)) ?? "deleted-role"}`).join(", ")
      : "none";
  if (field === "verifyRoleId" && value)
    return `@${roleNames.get(String(value)) ?? "deleted-role"}`;
  if (field === "templates")
    return Array.isArray(value) && value.length
      ? value.map((t: { name?: string }) => t.name ?? "?").join(", ")
      : "no templates";
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

/** One line in "Where the rest lives": a setting group, its current values, and its page. */
function Place({ href, name, value }: { href: string; name: string; value: string }) {
  return (
    <Link className="place" href={href}>
      <span className="place__name">{name}</span>
      <span className="place__value">{value}</span>
      <span className="place__cue" aria-hidden="true" />
    </Link>
  );
}

export default async function SettingsPage({
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
  const [overview, timezone, ranks, ledger, history, channels, roles, theme, plan, look] =
    await Promise.all([
      getOverview(db, guild.id),
      getOpsTimezone(db, guild.id),
      getRanksSettings(db, guild.id),
      getLedgerSettings(db, guild.id),
      listSettingsChanges(db, guild.id),
      listTextChannels(guild.id).catch(() => []),
      listGuildRoles(guild.id).catch(() => []),
      currentTheme(),
      getGuildPlan(db, guild.id),
      botLook(guild.id),
    ]);
  const w = overview.watch;
  const g = overview.gatehouse;
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const roleNames = new Map(roles.map((r) => [r.id, r.name]));
  const undone = new Set(history.map((h) => h.revertsChangeId).filter(Boolean));
  const base = `/servers/${guild.id}`;
  const channel = (id: string | null | undefined, none: string) =>
    id ? `#${names.get(id) ?? "deleted-channel"}` : none;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>
            What applies to the whole server, your own account, and the record of every change. Each
            module's settings are on its own page.
          </p>
        </div>
      </div>
      <SettingsNotice query={query} />

      <div className="settings-layout">
        <div className="card-col">
          {/* Keyed by the stored value: after a save or undo the form re-mounts with it,
              instead of keeping stale browser state that a later save would re-apply. */}
          <form action={saveOps} id="server" className="g-card card-col" key={`ops-${timezone}`}>
            <input type="hidden" name="guildId" value={guild.id} />
            <h2 className="card-title">Server</h2>
            <label className="g-field" htmlFor="timezone">
              <span>Time zone</span>
              <input
                className="g-input"
                id="timezone"
                name="timezone"
                maxLength={64}
                defaultValue={timezone}
                placeholder="America/Chicago"
              />
              <span className="g-help">
                Used when /raid create gets a date without a time zone.
              </span>
            </label>
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--primary">
                Save time zone
              </button>
            </div>
          </form>

          <div className="g-card card-col" id="account">
            <h2 className="card-title">Your account</h2>
            <div className="list-row">
              <span>Signed in as</span>
              <span className="mono">{session.username}</span>
            </div>
            <div className="list-row">
              <span>
                Game accounts
                <br />
                <span className="g-help">Steam, Battle.net, OSRS and which servers see them.</span>
              </span>
              <a className="g-btn g-btn--secondary" href="/account">
                Manage
              </a>
            </div>
            <div className="list-row">
              <span>Theme: {theme === "dark" ? "Dark" : "Light"}</span>
              <ThemeToggle back={`${base}/settings`} theme={theme} />
            </div>
            <div className="list-row">
              <span>This browser</span>
              {/* POST + Origin check + SameSite cookie: logout can't be triggered cross-site. */}
              <form method="post" action="/auth/logout">
                <button type="submit" className="g-btn g-btn--secondary">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>

        <nav className="g-card card-col" aria-label="Module settings">
          <h2 className="card-title">Where the rest lives</h2>
          <div className="places">
            <Place
              href={`${base}/watch?edit=settings#settings`}
              name="Watch"
              value={`Log ${channel(w?.logChannelId, "off")} · DMs ${(w?.dmMembers ?? true) ? "on" : "off"}`}
            />
            <Place
              href={`${base}/watch?edit=edit-ladder#edit-ladder`}
              name="Escalation ladder"
              value="What happens as warnings add up"
            />
            <Place
              href={`${base}/gatehouse?edit=anti-raid#anti-raid`}
              name="Anti-raid"
              value={
                g?.antiRaidEnabled
                  ? `Armed · ${g.raidJoinCount} joins in ${g.raidWindowSeconds} s`
                  : "Off"
              }
            />
            <Place
              href={`${base}/gatehouse?edit=verification#verification`}
              name="Verification"
              value={
                g?.verifyRoleId
                  ? `Gives @${roleNames.get(g.verifyRoleId) ?? "deleted-role"}`
                  : "Off"
              }
            />
            <Place
              href={`${base}/gatehouse`}
              name="Lockdown and anti-nuke"
              value="Anti-nuke is owner only"
            />
            <Place
              href={`${base}/ledger?edit=settings#settings`}
              name="Ledger"
              value={`${channel(ledger.channelId, "Dashboard only")} · kept ${ledger.retentionDays} days`}
            />
            <Place
              href={`${base}/ranks?edit=settings#settings`}
              name="Ranks"
              value={`XP ${ranks.enabled ? "on" : "off"} · level-ups ${ANNOUNCE[ranks.announce] ?? ranks.announce}`}
            />
            <Place
              href={`${base}/ranks#rewards`}
              name="Level rewards"
              value="Roles given at a level"
            />
            <Place
              href={`${base}/rally/templates`}
              name="LFG templates"
              value="Roles and wording per game"
            />
            <Place
              href={`${base}/insignia`}
              name="Role menus"
              value="Roles members pick for themselves"
            />
          </div>
        </nav>
      </div>

      <RequestsPanel guildId={guild.id} kinds={["bot_profile"]} query={query} />
      <section className="g-card card-col" id="profile" aria-labelledby="profile-title">
        <h2 className="card-title" id="profile-title">
          Garrison in this server
        </h2>
        <p className="g-help">
          Its name and look here only; other servers keep their own. Undo by putting back Garrison's
          own for each part.
        </p>
        {look ? (
          <BotProfileForm
            guildId={guild.id}
            current={look}
            pro={entitlements(plan)["profile.identity"]}
            planHref={`${base}/plan`}
            requestAction={requestAction}
          />
        ) : (
          <p className="notice" role="alert">
            Discord didn't say how Garrison looks here. Refresh to try again.
          </p>
        )}
      </section>

      <div className="g-card table-card" id="history">
        <div className="table-card__head row-between">
          <h2 className="card-title">History</h2>
          <span className="g-help">Garrison picks changes up within a minute.</span>
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
                        {FIELD_LABELS[field] ?? field}:{" "}
                        {field === "templates" || field === "menus"
                          ? templatesChangeText(from, to)
                          : `${describe(field, from, names, roleNames)} → ${describe(field, to, names, roleNames)}`}
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
