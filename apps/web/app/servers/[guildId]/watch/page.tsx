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
import { AutoSaveCard } from "@/components/AutoSave";
import { CopyButton } from "@/components/CopyButton";
import { ProTag } from "@/components/cards/CardEditor";
import { LevelCards, Segmented } from "@/components/choices";
import { EmptyState } from "@/components/EmptyState";
import { ActionBadge, formatDuration, formatTime, plainMentions } from "@/components/format";
import { ListField } from "@/components/ListField";
import { MemberAvatar } from "@/components/MemberAvatar";
import { HeadSwitch } from "@/components/ModuleHead";
import { PresetFill } from "@/components/PresetFill";
import { RecValue } from "@/components/RecValue";
import { RequestsPanel } from "@/components/RequestsPanel";
import {
  ChannelSelect,
  CheckList,
  FormPanel,
  HeaderSwitch,
  isEditing,
  SettingsNotice,
  Switch,
} from "@/components/settings";
import { formAction } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels, searchMembers } from "@/lib/discord";
import { env } from "@/lib/env";
import { contentKey, readFlash } from "@/lib/flash";
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
import { saveLadder, saveWatch, undoChange } from "../settings/actions";
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
  // Every automod panel resets after an Undo of any of them: they share one stored row.
  const amStamp = contentKey(am);
  // What automod did lately, beside its settings (from the latest cases, or fetched when the
  // table is showing a search).
  const caught = (q ? await listRecentCases(db, guild.id, 50) : cases)
    .filter((c) => c.source === "automod")
    .slice(0, 6);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Moderation</h1>
          <p>Automod, the members you act on, every case and the escalation ladder.</p>
        </div>
        <HeadSwitch
          key={amStamp}
          label="Automod"
          name="enabled"
          form="automod-form"
          defaultChecked={am.enabled}
        />
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
            <span className="appeal-link">
              <span className="g-help mono">{appealUrl}</span>
              <CopyButton text={appealUrl} />
            </span>
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
                  <form action={decide} className="card-col" data-need="manager">
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
                    `${a.username}'s appeal ${a.status === "accepted" ? "accepted" : "denied"} by ${a.reviewerName ?? "staff"}`,
                )
                .join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="page-split">
        <div className="page-split__main">
          <AutoSaveCard
            id="automod"
            title="Automod"
            action={saveAutomod}
            undo={undoChange}
            guildId={guild.id}
            stamp={amStamp}
            saveLabel="Save automod"
            fields={[
              "enabled",
              "spamCount",
              "spamSeconds",
              "mentionLimit",
              "action",
              "timeoutMinutes",
            ]}
          >
            <p className="g-help">
              Removes spam, mass mentions and blocked words as they're posted. Staff with Manage
              Messages are never checked.
            </p>
            <PresetFill
              name="_spam"
              label="Spam"
              current={{ spamCount: am.spamCount, spamSeconds: am.spamSeconds }}
              options={[
                {
                  value: "relaxed",
                  label: "Relaxed",
                  line: "10 messages in 10 s",
                  fills: { spamCount: 10, spamSeconds: 10 },
                },
                {
                  value: "balanced",
                  label: "Balanced",
                  line: "6 messages in 8 s",
                  fills: { spamCount: 6, spamSeconds: 8 },
                  recommended: true,
                },
                {
                  value: "strict",
                  label: "Strict",
                  line: "4 in 8 s",
                  fills: { spamCount: 4, spamSeconds: 8 },
                },
              ]}
            />
            <div className="field-row field-row--3">
              <label className="g-field" htmlFor="spamCount">
                <span>More than (messages)</span>
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
                <span>Within (seconds)</span>
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
              <label className="g-field" htmlFor="mentionLimit">
                <span>Most mentions</span>
                <input
                  className="g-input"
                  id="mentionLimit"
                  name="mentionLimit"
                  type="number"
                  min={0}
                  max={AUTOMOD_LIMITS.mentionLimit}
                  defaultValue={am.mentionLimit}
                />
                <RecValue field="mentionLimit" value={5} />
              </label>
            </div>
            <span className="g-help">0 turns a check off. Mentions count users and roles.</span>
            <Segmented
              name="action"
              label="After removing the message"
              value={am.action}
              options={[
                { value: "delete", label: "Nothing more", recommended: true },
                { value: "warn", label: "Warn" },
                { value: "timeout", label: "Time out" },
              ]}
              help="A warning counts toward the escalation ladder."
            />
            <label className="g-field field-narrow" htmlFor="timeoutMinutes">
              <span>Time out for (minutes)</span>
              <input
                className="g-input"
                id="timeoutMinutes"
                name="timeoutMinutes"
                type="number"
                min={1}
                max={AUTOMOD_LIMITS.timeoutMinutes}
                defaultValue={am.timeoutMinutes}
              />
              <RecValue field="timeoutMinutes" value={10} />
            </label>
          </AutoSaveCard>

          <AutoSaveCard
            id="links"
            title="Links"
            action={saveAutomod}
            undo={undoChange}
            guildId={guild.id}
            stamp={amStamp}
            saveLabel="Save links"
            fields={["scamLinks", "invites"]}
          >
            <Switch
              name="scamLinks"
              defaultChecked={am.scamLinks}
              label="Block scam and phishing links"
              recommended
              help="Fake Nitro, Steam gifts and look-alike login pages. Removes the message and times the sender out for an hour, since it's usually a hacked account. Works even with Automod off."
            />
            <Switch
              name="invites"
              defaultChecked={am.invites}
              label="Remove invites to other servers"
              help="Needs Automod on."
            />
          </AutoSaveCard>

          <AutoSaveCard
            id="words"
            title="Blocked words"
            action={saveAutomod}
            undo={undoChange}
            guildId={guild.id}
            stamp={amStamp}
            saveLabel="Save blocked words"
            fields={["words"]}
          >
            <ListField
              name="words"
              noun="word"
              defaultItems={am.words}
              max={ent["automod.words"]}
              maxLength={AUTOMOD_LIMITS.word}
              placeholder="A word or phrase"
            />
            <span className="g-help">
              Whole words, any case. Each one saves when you press Enter or move on.
              {ent["automod.words"] < WORDS_HARD_MAX ? ` Pro holds ${WORDS_HARD_MAX}.` : ""}
            </span>
          </AutoSaveCard>

          <AutoSaveCard
            id="ai"
            title="AI moderation"
            action={saveAutomod}
            undo={undoChange}
            guildId={guild.id}
            stamp={amStamp}
            saveLabel="Save AI moderation"
            fields={["aiEnabled", "aiCategories", "aiStrictness"]}
            aside={
              <>
                <ProTag on={ent["automod.ai"]} />
                <HeaderSwitch
                  name="aiEnabled"
                  form="ai-form"
                  defaultChecked={am.aiEnabled}
                  label="AI moderation on"
                  disabled={!ent["automod.ai"] && !am.aiEnabled}
                />
              </>
            }
          >
            <p className="g-help">
              Reads messages for what word lists can't catch. Message text is sent to OpenAI's
              moderation model to be scored and isn't kept by Garrison. Runs once Garrison's host
              has an OpenAI key.
            </p>
            <fieldset className="choice" disabled={!ent["automod.ai"] && !am.aiEnabled}>
              <legend className="choice__legend">Look for</legend>
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
            </fieldset>
            <fieldset className="choice" disabled={!ent["automod.ai"] && !am.aiEnabled}>
              <LevelCards
                name="aiStrictness"
                label="How strict"
                value={am.aiStrictness}
                options={[
                  { value: "low", label: "Relaxed", line: "Only clear cases" },
                  {
                    value: "medium",
                    label: "Balanced",
                    line: "Clear and likely cases",
                    recommended: true,
                  },
                  { value: "high", label: "Strict", line: "Catches more, more false alarms" },
                ]}
              />
            </fieldset>
          </AutoSaveCard>

          <AutoSaveCard
            id="exempt"
            title="Who automod skips"
            action={saveAutomod}
            undo={undoChange}
            guildId={guild.id}
            stamp={amStamp}
            saveLabel="Save who automod skips"
            fields={["exemptRoleIds", "exemptChannelIds"]}
          >
            <div className="settings-grid">
              <CheckList
                name="exemptRoleIds"
                label="These roles"
                value={am.exemptRoleIds}
                options={roles
                  .filter((r) => !r.managed)
                  .map((r) => ({ id: r.id, label: `@${r.name}` }))}
              />
              <CheckList
                name="exemptChannelIds"
                label="These channels"
                value={am.exemptChannelIds}
                options={channels.map((c) => ({ id: c.id, label: `#${c.name}` }))}
              />
            </div>
          </AutoSaveCard>
        </div>

        <aside className="page-split__side" aria-label="Tools">
          <section className="g-card card-col" id="moderate" aria-labelledby="moderate-title">
            <h2 className="card-title" id="moderate-title">
              Moderate a member
            </h2>
            <p className="g-help">Warn, time out, kick or ban, and see their cases and rank.</p>
            <search>
              <form className="side-search" method="get" action="#moderate">
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
              <summary className="g-btn g-btn--secondary">Clear messages…</summary>
              <form action={requestAction} className="settings-form">
                <input type="hidden" name="guildId" value={guild.id} />
                <input type="hidden" name="page" value="watch" />
                <input type="hidden" name="kind" value="purge" />
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
                <div className="field-row">
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
                  <label className="g-field" htmlFor="purge-user">
                    <span>Only from user ID</span>
                    <input
                      className="g-input"
                      id="purge-user"
                      name="userId"
                      inputMode="numeric"
                      pattern="\d{17,20}"
                      placeholder="Everyone"
                    />
                  </label>
                </div>
                <label className="g-field" htmlFor="purge-reason">
                  <span>Reason</span>
                  <input className="g-input" id="purge-reason" name="reason" maxLength={512} />
                </label>
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

          <section className="g-card card-col" aria-labelledby="caught-title">
            <h2 className="card-title" id="caught-title">
              Caught by automod
            </h2>
            {caught.length ? (
              <ul className="feed">
                {caught.map((c) => (
                  <li className="feed__item" key={c.id}>
                    <ActionBadge action={c.action} />
                    <span className="feed__what">
                      {c.targetId ? (
                        <Link href={`/servers/${guild.id}/watch/member/${c.targetId}`}>
                          {c.targetTag ?? c.targetId}
                        </Link>
                      ) : (
                        (c.targetTag ?? "Someone")
                      )}
                      {c.reason ? (
                        <span className="muted"> · {plainMentions(c.reason)}</span>
                      ) : null}
                    </span>
                    <span className="feed__when">{ago(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="feed__empty">
                Nothing yet. What automod removes and who it warns shows up here.
              </p>
            )}
          </section>

          <AutoSaveCard
            id="settings"
            title="Cases and appeals"
            action={saveWatch}
            undo={undoChange}
            guildId={guild.id}
            stamp={w?.updatedAt.getTime() ?? 0}
            saveLabel="Save case settings"
          >
            <label className="g-field" htmlFor="logChannelId">
              <span>Post every case in</span>
              <ChannelSelect
                name="logChannelId"
                value={w?.logChannelId ?? null}
                channels={channels}
                none="Don't post cases"
              />
              {w?.logChannelId && !logChannel ? (
                <span className="g-help g-help--error">That channel was deleted.</span>
              ) : null}
            </label>
            <Switch
              name="dmMembers"
              defaultChecked={w?.dmMembers ?? true}
              label="DM members when they're moderated"
              recommended
              help="They get the action, the reason and how to appeal."
            />
            <Switch
              name="appealsEnabled"
              defaultChecked={appealsOn}
              label="Take appeals on a page of their own"
              help="Its link is in Appeals, above. With the text below blank, the DMs link to it."
            />
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
              <span className="g-help">In moderation DMs, 300 characters. Blank: the default.</span>
            </label>
          </AutoSaveCard>
        </aside>
      </div>

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
          <table className="g-table case-table">
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
                  <td className="mono" data-label="Case">
                    #{c.caseNumber}
                  </td>
                  <td data-label="Action">
                    <ActionBadge action={c.action} />{" "}
                    <span className="mono">{formatDuration(c.durationSeconds)}</span>
                  </td>
                  {/* React escapes all of this: user-typed reasons can't inject markup. */}
                  <td data-label="Member">
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
                  <td data-label="Reason">
                    {c.reason ? (
                      plainMentions(c.reason)
                    ) : (
                      <span className="muted">No reason given</span>
                    )}
                    {c.revokedAt ? <span className="muted"> · undone</span> : null}
                  </td>
                  <td className="muted" data-label="By">
                    {c.source === "manual"
                      ? c.moderatorTag
                      : c.source === "escalation"
                        ? "Escalation rule"
                        : "Automod"}
                  </td>
                  <td className="mono" data-label="When">
                    {formatTime(c.createdAt)}
                  </td>
                  <td>
                    {!c.revokedAt && UNDOABLE.has(c.action) ? (
                      // Undoing reaches back into Discord (an unban is public), so it asks once.
                      <details className="confirm case-undo">
                        <summary className="confirm__toggle g-btn g-btn--ghost">Undo…</summary>
                        <form action={requestAction}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value="watch" />
                          <input type="hidden" name="kind" value="undo_case" />
                          <input type="hidden" name="caseNumber" value={c.caseNumber} />
                          <button type="submit" className="g-btn g-btn--danger">
                            {UNDO_LABEL[c.action]} (case #{c.caseNumber})
                          </button>
                        </form>
                      </details>
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
          action={formAction(saveLadder)}
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
