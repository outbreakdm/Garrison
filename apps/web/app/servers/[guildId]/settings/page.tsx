import {
  entitlements,
  getAccessGrants,
  getGuildPlan,
  getMemberPages,
  getOpsTimezone,
  listSettingsChanges,
  type SettingsChange,
  STAT_KINDS,
  STAT_SOURCES,
  type StatKind,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoSaveCard } from "@/components/AutoSave";
import { formatTime } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import { SettingsNotice, Switch } from "@/components/settings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formAction } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { botLook, listGuildRoles, listTextChannels, searchMembers } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { FIELD_LABELS, ladderText, templatesChangeText } from "@/lib/settings-schema";
import { currentTheme } from "@/lib/theme";
import { requestAction } from "../requests";
import { AccessPanel } from "./AccessPanel";
import { saveMemberPages, saveOps, undoChange } from "./actions";
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
  if (/Card$/.test(field))
    return value && typeof value === "object" && "title" in value
      ? `“${String((value as { title: unknown }).title)}”`
      : "the standard card";
  if (field === "staffRoleIds" || field === "joinRoleIds")
    return Array.isArray(value) && value.length
      ? value.map((id) => `@${roleNames.get(String(id)) ?? "deleted-role"}`).join(", ")
      : "none";
  if (field === "verifyRoleId" && value)
    return `@${roleNames.get(String(value)) ?? "deleted-role"}`;
  if (field === "parentId") return value ? "a category" : "the top of the channel list";
  if (field === "card") return value ? "a custom card" : "the standard card";
  if (field === "words") return Array.isArray(value) ? `${value.length} words` : "none";
  if (field === "aiCategories")
    return Array.isArray(value) && value.length ? value.join(", ") : "none";
  if (field === "exemptRoleIds")
    return Array.isArray(value) && value.length
      ? value.map((id) => `@${roleNames.get(String(id)) ?? "deleted-role"}`).join(", ")
      : "none";
  if (field === "ignoredChannelIds" || field === "exemptChannelIds")
    return Array.isArray(value) && value.length
      ? value.map((id) => `#${channels.get(String(id)) ?? "deleted-channel"}`).join(", ")
      : "none";
  if (field === "statRoles")
    return Array.isArray(value) && value.length
      ? value
          .map(
            (r: { source: string; min: number; roleId: string }) =>
              `${STAT_SOURCES[r.source as keyof typeof STAT_SOURCES]?.label ?? r.source} ${r.min}+ → @${roleNames.get(r.roleId) ?? "deleted-role"}`,
          )
          .join(", ")
      : "none";
  if (field === "boosts")
    return Array.isArray(value) && value.length
      ? value
          .map((b: { kind: string; id: string; multiplier: number }) => {
            const where =
              b.kind === "role"
                ? `@${roleNames.get(b.id) ?? "deleted-role"}`
                : `#${channels.get(b.id) ?? "a channel or category"}`;
            return `${where} ${b.multiplier === 0 ? "no XP" : `×${b.multiplier}`}`;
          })
          .join(", ")
      : "none";
  if (field === "grants")
    return Array.isArray(value) && value.length
      ? value
          .map(
            (g: { kind: string; name: string; level: string }) =>
              `${g.kind === "role" ? "@" : ""}${g.name} (${g.level})`,
          )
          .join(", ")
      : "nobody";
  if (field === "userLimit") return Number(value) > 0 ? String(value) : "no limit";
  if (field === "creatorChannelIds")
    return Array.isArray(value) && value.length
      ? value.map((id) => channels.get(String(id)) ?? "a deleted channel").join(", ")
      : "none";
  if (field === "categoryId") return value ? "a category" : "none";
  if (field === "counters")
    return Array.isArray(value) && value.length
      ? value
          .map((c: { kind: string; template?: string }) =>
            c.template ? `“${c.template}”` : (STAT_KINDS[c.kind as StatKind]?.label ?? c.kind),
          )
          .join(", ")
      : "none";
  if (field === "templates")
    return Array.isArray(value) && value.length
      ? value.map((t: { name?: string }) => t.name ?? "?").join(", ")
      : "no templates";
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (field === "announce") return ANNOUNCE[String(value)] ?? String(value);
  if (field === "action") return AFTER_REMOVAL[String(value)] ?? String(value);
  if (field === "aiStrictness") return STRICTNESS[String(value)] ?? String(value);
  if (/channelId$/i.test(field)) return `#${channels.get(String(value)) ?? "deleted-channel"}`;
  return String(value);
}

/** "off → on"; when both sides read the same (a card edited inside), just "edited". */
const historyLine = (from: string, to: string) => (from === to ? "edited" : `${from} → ${to}`);

/** Automod: what happens after a message is removed, as the page words it. */
const AFTER_REMOVAL: Record<string, string> = {
  delete: "nothing more",
  warn: "warn",
  timeout: "time out",
};
const STRICTNESS: Record<string, string> = { low: "relaxed", medium: "balanced", high: "strict" };

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
  const { guild, session, role } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  // Managers find people to give access to (a GET search, like Moderation's).
  const accessQuery =
    role === "manager" && typeof query.access_q === "string"
      ? query.access_q.trim().slice(0, 32)
      : "";
  const [grants, found, flash, memberPages] = await Promise.all([
    getAccessGrants(db, guild.id),
    accessQuery ? searchMembers(guild.id, accessQuery).catch(() => null) : Promise.resolve([]),
    readFlash(),
    getMemberPages(db, guild.id),
  ]);
  const [timezone, history, channels, roles, theme, plan, look] = await Promise.all([
    getOpsTimezone(db, guild.id),
    listSettingsChanges(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    currentTheme(),
    getGuildPlan(db, guild.id),
    botLook(guild.id),
  ]);
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const roleNames = new Map(roles.map((r) => [r.id, r.name]));
  const undone = new Set(history.map((h) => h.revertsChangeId).filter(Boolean));
  const base = `/servers/${guild.id}`;

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
          <AutoSaveCard
            id="server"
            title="Server"
            action={saveOps}
            undo={undoChange}
            guildId={guild.id}
            stamp={timezone}
            saveLabel="Save time zone"
          >
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
          </AutoSaveCard>

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

        <nav className="g-card card-col" aria-label="Settings inside other pages">
          <h2 className="card-title">Inside other pages</h2>
          <p className="g-help">
            Every module's settings are on its own page in the menu. These three sit inside one.
          </p>
          <div className="places">
            <Place
              href={`${base}/watch?edit=edit-ladder#edit-ladder`}
              name="Escalation ladder"
              value="On Moderation: what happens as warnings add up"
            />
            <Place
              href={`${base}/ranks#rewards`}
              name="Level rewards"
              value="On Leveling: roles given at a level"
            />
            <Place
              href={`${base}/rally/templates`}
              name="LFG templates"
              value="On Groups and raids: roles and wording per game"
            />
          </div>
        </nav>
      </div>

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}
      <AccessPanel
        guildId={guild.id}
        role={role}
        grants={grants}
        roles={roles}
        query={accessQuery}
        found={found}
      />

      <AutoSaveCard
        id="members"
        title="Member pages"
        action={saveMemberPages}
        undo={undoChange}
        guildId={guild.id}
        stamp={`${memberPages.showYou}-${memberPages.showRecord}`}
        saveLabel="Save member pages"
        need="manager"
      >
        <p className="g-help">
          Everyone in the server can sign in and see their own space here: groups and raids, and the
          pages below that are on. They only ever see and change themselves.{" "}
          <a href={`/play/${guild.id}/you`}>See it as a member</a>.
        </p>
        <Switch
          name="showYou"
          defaultChecked={memberPages.showYou}
          label="You: their level, rank card details and the leaderboard"
          help="Shows while Leveling is on. Their card details are the same ones /rankcard fills in."
        />
        <Switch
          name="showRecord"
          defaultChecked={memberPages.showRecord}
          label="Your record: their own warnings, timeouts, kicks and bans"
          help="Each member sees only their own cases, never who acted, with your appeal page if it's on."
        />
      </AutoSaveCard>

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
                  <td className="mono">{formatTime(h.createdAt)}</td>
                  <td>{h.username}</td>
                  <td>
                    {h.revertsChangeId ? <span className="muted">Undo: </span> : null}
                    {Object.entries(h.changes).map(([field, { from, to }]) => (
                      <div key={field}>
                        {FIELD_LABELS[`${h.module}.${field}`] ?? FIELD_LABELS[field] ?? field}:{" "}
                        {field === "templates" ||
                        field === "menus" ||
                        field === "messages" ||
                        field === "panels" ||
                        field === "feeds"
                          ? templatesChangeText(from, to)
                          : historyLine(
                              describe(field, from, names, roleNames),
                              describe(field, to, names, roleNames),
                            )}
                      </div>
                    ))}
                  </td>
                  <td>
                    {!h.revertsChangeId && !undone.has(h.id) ? (
                      <form action={formAction(undoChange)}>
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
