import {
  cleanQuery,
  getOverview,
  listEscalationRules,
  listRecentCases,
  searchCases,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import { ActionBadge, formatDuration, plainMentions } from "@/components/format";
import { MemberAvatar } from "@/components/MemberAvatar";
import { RequestsPanel } from "@/components/RequestsPanel";
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
import { listTextChannels, searchMembers } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";
import {
  durationText,
  LADDER_DURATIONS,
  LADDER_MAX_STEPS,
  LADDER_WINDOWS,
  windowText,
} from "@/lib/settings-schema";
import { requestAction } from "../requests";
import { saveLadder, saveWatch } from "../settings/actions";

export const metadata: Metadata = { title: "Watch" };

/** Cases Discord can reverse: a warning is withdrawn, a timeout lifted, a ban removed. */
const UNDOABLE = new Set(["warn", "timeout", "ban"]);
const UNDO_LABEL: Record<string, string> = {
  warn: "Withdraw the warning",
  timeout: "Lift the timeout",
  ban: "Unban",
};

const ACTION_LABEL = { timeout: "Timeout", kick: "Kick", ban: "Ban" } as const;

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const q = cleanQuery(query.q);
  const memberQuery = typeof query.member === "string" ? query.member.trim().slice(0, 32) : "";
  const db = await getDb();
  const [cases, rules, { watch: w }, channels, found] = await Promise.all([
    q ? searchCases(db, guild.id, q, 50) : listRecentCases(db, guild.id, 50),
    listEscalationRules(db, guild.id),
    getOverview(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    // null means Discord didn't answer, which the page says rather than showing nobody.
    memberQuery ? searchMembers(guild.id, memberQuery).catch(() => null) : null,
  ]);
  const first = rules[0]?.warnCount ?? 0;
  const logChannel = channels.find((c) => c.id === w?.logChannelId);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Watch</h1>
          <p>Moderate members, set the escalation ladder, and review or undo every case.</p>
        </div>
        <a className="g-btn g-btn--secondary" href="?edit=settings#settings">
          <GearIcon />
          Watch settings
        </a>
      </div>

      <RequestsPanel
        guildId={guild.id}
        kinds={["undo_case", "mod_action", "purge"]}
        query={query}
      />
      <SettingsNotice query={query} />

      <section className="g-card card-col" id="moderate" aria-label="Moderate">
        <div className="row-between">
          <div>
            <div className="g-label">Moderate a member</div>
            <div className="g-help">
              Find someone to warn, time out, kick or ban, and see their cases and rank.
            </div>
          </div>
          <search>
            <form className="row-between" method="get" action="#moderate">
              <label className="sr-only" htmlFor="member-search">
                Member name or user ID
              </label>
              <input
                id="member-search"
                className="g-input"
                name="member"
                type="search"
                maxLength={32}
                required
                placeholder="Name or user ID"
                defaultValue={memberQuery}
              />
              <button type="submit" className="g-btn g-btn--primary">
                Find
              </button>
            </form>
          </search>
        </div>
        {memberQuery ? (
          found === null ? (
            <span className="notice" role="alert">
              Discord didn't answer. Try again in a moment.
            </span>
          ) : found.length ? (
            <ul className="member-list">
              {found.map((m) => (
                <li key={m.id}>
                  <Link className="member-row" href={`/servers/${guild.id}/watch/member/${m.id}`}>
                    <MemberAvatar name={m.name} src={m.avatar} />
                    <span className="member-row__name">
                      {m.name}
                      <span className="mono">
                        {m.username}
                        {m.bot ? " · bot" : ""}
                        {m.joinedAt ? "" : " · not in the server"}
                      </span>
                    </span>
                    <span className="g-btn g-btn--ghost">Open</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Nobody's name starts with “{memberQuery}”. To ban someone who isn't in the server,
              search their user ID.
            </p>
          )
        ) : null}
        <details className="card-edit" open={query.clear === "1"}>
          <summary className="g-btn g-btn--ghost">Clear messages…</summary>
          <form action={requestAction} className="settings-form">
            <input type="hidden" name="guildId" value={guild.id} />
            <input type="hidden" name="page" value="watch" />
            <input type="hidden" name="kind" value="purge" />
            <div className="field-row">
              <label className="g-field" htmlFor="purge-channel">
                <span>Channel</span>
                <select
                  className="g-input"
                  id="purge-channel"
                  name="channelId"
                  required
                  defaultValue=""
                >
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
              <label className="g-field" htmlFor="purge-amount">
                <span>How many</span>
                <input
                  className="g-input"
                  id="purge-amount"
                  name="amount"
                  type="number"
                  min={1}
                  max={100}
                  required
                  defaultValue={20}
                />
              </label>
            </div>
            <div className="field-row">
              <label className="g-field" htmlFor="purge-user">
                <span>Only from this user ID</span>
                <input
                  className="g-input"
                  id="purge-user"
                  name="userId"
                  inputMode="numeric"
                  pattern="\d{17,20}"
                  placeholder="Everyone"
                />
              </label>
              <label className="g-field" htmlFor="purge-reason">
                <span>Reason</span>
                <input className="g-input" id="purge-reason" name="reason" maxLength={512} />
              </label>
            </div>
            <p className="g-help">
              Deletes the channel's most recent messages, 100 at most. Pinned messages and ones
              older than 14 days are kept. This can't be undone.
            </p>
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--danger">
                Delete messages
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Keyed by last update: after a save or undo the form re-mounts with the stored
          values, instead of keeping stale browser state that a later save would re-apply. */}
      <SettingsPanel
        title="Watch settings"
        open={isEditing(query, "settings")}
        facts={[
          {
            label: "Log channel",
            value: logChannel ? `#${logChannel.name}` : w?.logChannelId ? "Deleted" : "None",
          },
          { label: "DMs", value: (w?.dmMembers ?? true) ? "On" : "Off" },
          { label: "Appeal text", value: w?.appealText ? "Custom" : "Default" },
        ]}
      >
        <form action={saveWatch} className="settings-form" key={w?.updatedAt.getTime() ?? 0}>
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="settings-grid">
            <div className="card-col">
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
              <Switch
                name="dmMembers"
                defaultChecked={w?.dmMembers ?? true}
                label="DM members when they're moderated"
                help="They get the action, the reason and how to appeal."
              />
            </div>
            <label className="g-field" htmlFor="appealText">
              <span>How to appeal</span>
              <textarea
                className="g-input"
                id="appealText"
                name="appealText"
                maxLength={300}
                rows={4}
                defaultValue={w?.appealText ?? ""}
              />
              <span className="g-help">
                Shown in moderation DMs, 300 characters at most. Leave blank for the default.
              </span>
            </label>
          </div>
          <FormFoot label="Save Watch settings" guildId={guild.id} />
        </form>
      </SettingsPanel>

      <div className="g-card card-col">
        <div className="row-between">
          <div>
            <div className="g-label">Escalation ladder</div>
            <div className="g-help">
              Applied automatically when a member's active warnings reach a step. Undone warnings
              don't count.
            </div>
          </div>
          <a className="g-btn g-btn--ghost" href="?edit=edit-ladder#edit-ladder">
            Edit ladder
          </a>
        </div>
        {rules.length ? (
          <div className="ladder">
            {first > 1 ? (
              <div className="ladder__step">
                <span className="mono">
                  {first === 2 ? "1 warning" : `1–${first - 1} warnings`}
                </span>
                <span className="big">Recorded</span>
              </div>
            ) : null}
            {rules.map((r, i) => (
              <div
                key={r.id}
                className={`ladder__step ${r.action === "ban" ? "ladder__step--alert" : ""}`}
              >
                <span className={`mono ${i === rules.length - 1 ? "tone-alert" : "tone-caution"}`}>
                  {r.warnCount} warnings in {windowText(r.windowMinutes)}
                </span>
                <span className="big">
                  {ACTION_LABEL[r.action]}
                  {r.action === "timeout" && r.durationSeconds
                    ? ` ${durationText(r.durationSeconds)}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            No rules: warnings are recorded, but nothing happens automatically.
          </p>
        )}
      </div>

      <details
        className="g-card ladder-edit"
        id="edit-ladder"
        open={isEditing(query, "edit-ladder")}
      >
        <summary className="g-label">Edit ladder</summary>
        <form
          action={saveLadder}
          className="card-col"
          key={rules
            .map((r) => `${r.warnCount}:${r.windowMinutes}:${r.action}:${r.durationSeconds}`)
            .join("|")}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <p className="g-help">
            Up to {LADDER_MAX_STEPS} steps. Leave a row's warnings blank to remove it. Every change
            is in Settings history and can be undone there.
          </p>
          {Array.from({ length: LADDER_MAX_STEPS }, (_, i) => {
            const r = rules[i];
            return (
              <fieldset key={r?.id ?? `new-${i}`} className="ladder-row">
                <legend className="sr-only">Step {i + 1}</legend>
                <label className="g-field">
                  <span>Warnings</span>
                  <input
                    className="g-input"
                    name={`step${i}_warns`}
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={r?.warnCount ?? ""}
                  />
                </label>
                <label className="g-field">
                  <span>Within</span>
                  <select
                    className="g-input"
                    name={`step${i}_window`}
                    defaultValue={String(r?.windowMinutes ?? 1440)}
                  >
                    {LADDER_WINDOWS.map((m) => (
                      <option key={m} value={m}>
                        {windowText(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="g-field">
                  <span>Then</span>
                  <select
                    className="g-input"
                    name={`step${i}_action`}
                    defaultValue={r?.action ?? ""}
                  >
                    <option value="">No step</option>
                    <option value="timeout">Timeout</option>
                    <option value="kick">Kick</option>
                    <option value="ban">Ban</option>
                  </select>
                </label>
                <label className="g-field">
                  <span>Timeout for</span>
                  <select
                    className="g-input"
                    name={`step${i}_duration`}
                    defaultValue={String(r?.durationSeconds ?? 3600)}
                  >
                    {LADDER_DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {durationText(d)}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            );
          })}
          <button type="submit" className="g-btn g-btn--primary">
            Save ladder
          </button>
        </form>
      </details>

      <div className="g-card table-card">
        <div className="table-card__head row-between">
          <span className="g-label">{q ? `Cases matching “${q}”` : "Latest 50 cases"}</span>
          <search>
            <form className="row-between" method="get">
              <label className="sr-only" htmlFor="case-search">
                Search member or case number
              </label>
              <input
                id="case-search"
                className="g-input g-input--sm"
                name="q"
                type="search"
                maxLength={64}
                placeholder="Search member or case #"
                defaultValue={q ?? ""}
              />
              {q ? (
                <Link className="g-btn g-btn--ghost" href={`/servers/${guild.id}/watch`}>
                  Clear
                </Link>
              ) : null}
            </form>
          </search>
        </div>
        <div className="table-wrap">
          <table className="g-table">
            <thead>
              <tr>
                {["Case", "Action", "Member", "Reason", "By", "When", ""].map((h) => (
                  <th key={h || "actions"} scope="col">
                    <span className="g-label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className={c.revokedAt ? "revoked" : undefined}>
                  <td className="mono">#{c.caseNumber}</td>
                  <td>
                    <ActionBadge action={c.action} />{" "}
                    <span className="mono">{formatDuration(c.durationSeconds)}</span>
                  </td>
                  {/* React escapes all of this: user-typed reasons can't inject markup. */}
                  <td>
                    {c.targetId ? (
                      <Link href={`/servers/${guild.id}/watch/member/${c.targetId}`}>
                        {c.targetTag ?? c.targetId}
                      </Link>
                    ) : (
                      (c.targetTag ?? "—")
                    )}
                  </td>
                  <td>
                    {c.reason ? (
                      plainMentions(c.reason)
                    ) : (
                      <span className="muted">No reason given</span>
                    )}
                    {c.revokedAt ? <span className="muted"> · undone</span> : null}
                  </td>
                  <td className="muted">
                    {c.source === "manual"
                      ? c.moderatorTag
                      : c.source === "escalation"
                        ? "Escalation rule"
                        : "Automod"}
                  </td>
                  <td className="mono">
                    {c.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </td>
                  <td>
                    {!c.revokedAt && UNDOABLE.has(c.action) ? (
                      <form action={requestAction}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="watch" />
                        <input type="hidden" name="kind" value="undo_case" />
                        <input type="hidden" name="caseNumber" value={c.caseNumber} />
                        <button
                          type="submit"
                          className="g-btn g-btn--ghost"
                          title={UNDO_LABEL[c.action]}
                        >
                          Undo
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cases.length === 0 ? (
            <div className="table-card__head muted">
              <Art slot="empty" className="empty-art" decorative />
              No cases yet.
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
