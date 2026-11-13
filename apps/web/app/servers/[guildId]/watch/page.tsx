import {
  AI_CATEGORIES,
  type AiCategory,
  AUTOMOD_LIMITS,
  appealsOpen,
  cleanQuery,
  entitlements,
  getAutomod,
  getGuildPlan,
  getOverview,
  listAppeals,
  listEscalationRules,
  listRecentCases,
  searchCases,
  WORDS_HARD_MAX,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ProTag } from "@/components/cards/CardEditor";
import { EmptyState } from "@/components/EmptyState";
import { ActionBadge, formatDuration, plainMentions } from "@/components/format";
import { MemberAvatar } from "@/components/MemberAvatar";
import { RequestsPanel } from "@/components/RequestsPanel";
import {
  ChannelSelect,
  FormFoot,
  FormPanel,
  GearIcon,
  isEditing,
  SettingsNotice,
  SettingsPanel,
  Switch,
} from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels, searchMembers } from "@/lib/discord";
import { env } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import {
  durationText,
  LADDER_DURATIONS,
  LADDER_MAX_STEPS,
  LADDER_WINDOWS,
  windowText,
} from "@/lib/settings-schema";
import { ago } from "../parley/when";
import { requestAction } from "../requests";
import { saveLadder, saveWatch } from "../settings/actions";
import { decide, saveAutomod } from "./actions";

export const metadata: Metadata = { title: "Moderation" };

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
  const [cases, rules, { watch: w }, channels, found, appealsOn, appeals, flash, am, plan, roles] =
    await Promise.all([
      q ? searchCases(db, guild.id, q, 50) : listRecentCases(db, guild.id, 50),
      listEscalationRules(db, guild.id),
      getOverview(db, guild.id),
      listTextChannels(guild.id).catch(() => []),
      // null means Discord didn't answer, which the page says rather than showing nobody.
      memberQuery ? searchMembers(guild.id, memberQuery).catch(() => null) : null,
      appealsOpen(db, guild.id),
      listAppeals(db, guild.id),
      readFlash(),
      getAutomod(db, guild.id),
      getGuildPlan(db, guild.id),
      listGuildRoles(guild.id).catch(() => []),
    ]);
  const ent = entitlements(plan);
  const appealUrl = `${env().APP_URL}/appeal/${guild.id}`;
  const first = rules[0]?.warnCount ?? 0;
  const logChannel = channels.find((c) => c.id === w?.logChannelId);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Moderation</h1>
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
      {appealsOn || appeals.open.length || appeals.decided.length ? (
        <section className="g-card queue" id="appeals" aria-labelledby="appeals-title">
          <div className="queue__head">
            <h2 className="card-title" id="appeals-title">
              Appeals <span className="count">{appeals.open.length}</span>
            </h2>
            <span className="g-help mono">{appealUrl}</span>
          </div>
          {appeals.open.length ? (
            <ul className="queue__list">
              {appeals.open.map((a) => (
                <li key={a.id} className="appeal-row">
                  <div className="card-col">
                    <span className="ticket-row__topic">
                      <Link href={`/servers/${guild.id}/watch/member/${a.userId}`}>
                        {a.username}
                      </Link>
                      {a.caseNumber ? ` · case #${a.caseNumber}` : ""}
                    </span>
                    <p className="appeal-row__body">{a.body}</p>
                    <span className="g-help">{ago(a.createdAt)}</span>
                  </div>
                  <form action={decide} className="card-col">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="appealId" value={a.id} />
                    <label className="g-field" htmlFor={`resp-${a.id}`}>
                      <span>Reply (they see it)</span>
                      <textarea
                        className="g-input"
                        id={`resp-${a.id}`}
                        name="response"
                        rows={2}
                        maxLength={1000}
                      />
                    </label>
                    {a.caseNumber ? (
                      <label className="check">
                        <input type="checkbox" name="undo" defaultChecked />
                        <span>If accepted, undo case #{a.caseNumber}</span>
                      </label>
                    ) : null}
                    <div className="row-between">
                      <button
                        type="submit"
                        name="decision"
                        value="accept"
                        className="g-btn g-btn--secondary"
                      >
                        Accept
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="deny"
                        className="g-btn g-btn--ghost"
                      >
                        Deny
                      </button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="queue__empty muted">No appeals waiting.</p>
          )}
          {appeals.decided.length ? (
            <p className="g-help">
              Last 30 days:{" "}
              {appeals.decided
                .map(
                  (a) =>
                    `${a.username} ${a.status === "accepted" ? "accepted" : "denied"} by ${a.reviewerName ?? "staff"}`,
                )
                .join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="g-card card-col" id="moderate" aria-label="Moderate">
        <div className="row-between">
          <div>
            <h2 className="card-title">Moderate a member</h2>
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
                  <Link
                    className="member-row"
                    href={`/servers/${guild.id}/watch/member/${m.id}`}
                    transitionTypes={["nav"]}
                  >
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
        id="automod"
        title="Automod"
        open={isEditing(query, "automod")}
        facts={[
          { label: "Status", value: am.enabled ? "On" : "Off" },
          { label: "Blocked words", value: String(am.words.length) },
          {
            label: "Then",
            value:
              am.action === "delete"
                ? "Remove"
                : am.action === "warn"
                  ? "Remove and warn"
                  : `Remove and time out ${am.timeoutMinutes} min`,
          },
          {
            label: "AI",
            value: am.aiEnabled ? (ent["automod.ai"] ? "On" : "Requires Pro, paused") : "Off",
          },
        ]}
      >
        <form action={saveAutomod} className="settings-form" key={JSON.stringify(am)}>
          <input type="hidden" name="guildId" value={guild.id} />
          <Switch
            name="enabled"
            defaultChecked={am.enabled}
            label="Automod on"
            help="Staff with Manage Messages are never checked."
          />
          <div className="settings-grid">
            <div className="card-col">
              <label className="g-field" htmlFor="words">
                <span>Blocked words and phrases</span>
                <textarea
                  className="g-input"
                  id="words"
                  name="words"
                  rows={5}
                  defaultValue={am.words.join("\n")}
                  placeholder="One per line. Whole words, any case."
                />
                <span className="g-help">
                  {am.words.length} of {ent["automod.words"]}
                  {ent["automod.words"] < WORDS_HARD_MAX ? ` (Pro: ${WORDS_HARD_MAX})` : ""}.
                </span>
              </label>
              <Switch
                name="invites"
                defaultChecked={am.invites}
                label="Remove invites to other servers"
              />
            </div>
            <div className="card-col">
              <label className="g-field" htmlFor="mentionLimit">
                <span>Most mentions in one message</span>
                <input
                  className="g-input"
                  id="mentionLimit"
                  name="mentionLimit"
                  type="number"
                  min={0}
                  max={AUTOMOD_LIMITS.mentionLimit}
                  defaultValue={am.mentionLimit}
                />
                <span className="g-help">0 turns it off.</span>
              </label>
              <div className="field-row">
                <label className="g-field" htmlFor="spamCount">
                  <span>Spam: more than</span>
                  <input
                    className="g-input"
                    id="spamCount"
                    name="spamCount"
                    type="number"
                    min={0}
                    max={AUTOMOD_LIMITS.spamCount}
                    defaultValue={am.spamCount}
                  />
                </label>
                <label className="g-field" htmlFor="spamSeconds">
                  <span>messages in (seconds)</span>
                  <input
                    className="g-input"
                    id="spamSeconds"
                    name="spamSeconds"
                    type="number"
                    min={2}
                    max={AUTOMOD_LIMITS.spamSeconds}
                    defaultValue={am.spamSeconds}
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="g-field" htmlFor="automodAction">
                  <span>After removing the message</span>
                  <select
                    className="g-input"
                    id="automodAction"
                    name="action"
                    defaultValue={am.action}
                  >
                    <option value="delete">Nothing more</option>
                    <option value="warn">Warn (counts toward the ladder)</option>
                    <option value="timeout">Time out</option>
                  </select>
                </label>
                <label className="g-field" htmlFor="timeoutMinutes">
                  <span>Timeout (minutes)</span>
                  <input
                    className="g-input"
                    id="timeoutMinutes"
                    name="timeoutMinutes"
                    type="number"
                    min={1}
                    max={AUTOMOD_LIMITS.timeoutMinutes}
                    defaultValue={am.timeoutMinutes}
                  />
                </label>
              </div>
            </div>
            <label className="g-field" htmlFor="exemptRoleIds">
              <span>Never check these roles</span>
              <select
                className="g-input"
                id="exemptRoleIds"
                name="exemptRoleIds"
                multiple
                size={4}
                defaultValue={am.exemptRoleIds}
              >
                {roles
                  .filter((r) => !r.managed)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="g-field" htmlFor="exemptChannelIds">
              <span>Never check these channels</span>
              <select
                className="g-input"
                id="exemptChannelIds"
                name="exemptChannelIds"
                multiple
                size={4}
                defaultValue={am.exemptChannelIds}
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="editor-group" disabled={!ent["automod.ai"] && !am.aiEnabled}>
            <legend className="g-label">
              AI moderation <ProTag on={ent["automod.ai"]} />
            </legend>
            <Switch
              name="aiEnabled"
              defaultChecked={am.aiEnabled}
              label="Let AI read messages for what rules can't catch"
              help="Message text is sent to OpenAI's moderation model to be scored, and isn't kept by Garrison. Runs once Garrison's host has an OpenAI key."
            />
            <div className="chip-row">
              {(Object.keys(AI_CATEGORIES) as AiCategory[]).map((c) => (
                <label className="check" key={c}>
                  <input
                    type="checkbox"
                    name="aiCategories"
                    value={c}
                    defaultChecked={am.aiCategories.includes(c)}
                  />
                  <span>{AI_CATEGORIES[c].label}</span>
                </label>
              ))}
            </div>
            <label className="g-field" htmlFor="aiStrictness">
              <span>How strict</span>
              <select
                className="g-input"
                id="aiStrictness"
                name="aiStrictness"
                defaultValue={am.aiStrictness}
              >
                <option value="low">Only clear cases</option>
                <option value="medium">Balanced</option>
                <option value="high">Strict (more false alarms)</option>
              </select>
            </label>
          </fieldset>
          <FormFoot label="Save automod" guildId={guild.id} />
        </form>
      </SettingsPanel>

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
          { label: "Appeals page", value: appealsOn ? "On" : "Off" },
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
              <Switch
                name="appealsEnabled"
                defaultChecked={appealsOn}
                label="Take appeals on a page of their own"
                help={`Anyone with a case here can appeal at ${appealUrl}. With the text below blank, the DMs link to it.`}
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

      <div className="g-card table-card">
        <div className="table-card__head row-between">
          <h2 className="card-title">{q ? `Cases matching “${q}”` : "Latest 50 cases"}</h2>
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
                placeholder="Member or case #"
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
                      <Link
                        href={`/servers/${guild.id}/watch/member/${c.targetId}`}
                        transitionTypes={["nav"]}
                      >
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
            <EmptyState compact mark="cases" title="No cases yet">
              Every warn, timeout, kick and ban gets a numbered case here, with who did it and an
              Undo. Search for a member above to act from the dashboard.
            </EmptyState>
          ) : null}
        </div>
      </div>

      <div className="g-card card-col">
        <div className="row-between">
          <div>
            <h2 className="card-title">Escalation ladder</h2>
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

      <FormPanel
        id="edit-ladder"
        title="Edit ladder"
        hint="Change the steps, how many warnings each needs, and what happens."
        open={isEditing(query, "edit-ladder")}
      >
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
      </FormPanel>
    </>
  );
}
