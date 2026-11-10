import {
  cleanQuery,
  getOverview,
  listDashboardActions,
  listEscalationRules,
  listRecentCases,
  searchCases,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import { ActionBadge, formatDuration, plainMentions, When } from "@/components/format";
import { MemberAvatar } from "@/components/MemberAvatar";
import { Outcome } from "@/components/Outcome";
import { CardHead, PageHead } from "@/components/PageHead";
import { RequestsHistory, RequestsPanel } from "@/components/RequestsPanel";
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
import { errorAt, latestOutcome } from "@/lib/outcome";
import { PAGES } from "@/lib/pages";
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

export const metadata: Metadata = { title: PAGES.watch.title };

const KINDS = ["undo_case", "mod_action", "purge"];

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
  const { guild, session } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const q = cleanQuery(query.q);
  const memberQuery = typeof query.member === "string" ? query.member.trim().slice(0, 32) : "";
  const db = await getDb();
  const [cases, rules, { watch: w }, channels, found, actions] = await Promise.all([
    q ? searchCases(db, guild.id, q, 50) : listRecentCases(db, guild.id, 50),
    listEscalationRules(db, guild.id),
    getOverview(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    // null means Discord didn't answer, which the page says rather than showing nobody.
    memberQuery ? searchMembers(guild.id, memberQuery).catch(() => null) : null,
    listDashboardActions(db, guild.id, 30),
  ]);
  const yours = (kinds: string[]) => latestOutcome(actions, { userId: session.userId, kinds });
  const undone = yours(["undo_case"]);
  const first = rules[0]?.warnCount ?? 0;
  const logChannel = channels.find((c) => c.id === w?.logChannelId);
  return (
    <>
      <PageHead
        title={PAGES.watch.title}
        description="Warn, time out, kick or ban members, and review or undo every case."
      >
        <a className="g-btn g-btn--ghost" href="?edit=settings#settings">
          <GearIcon />
          Settings
        </a>
      </PageHead>

      <RequestsPanel kinds={KINDS} query={query} actions={actions} />
      <SettingsNotice query={query} />

      <section className="g-card card-col" id="moderate" aria-label="Moderate">
        <CardHead
          title="Moderate a member"
          help="Find someone to warn, time out, kick or ban. Their page shows their cases, roles and level."
        >
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
        </CardHead>
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
          <summary className="g-btn g-btn--secondary">Clear messages in a channel…</summary>
          <form action={requestAction} className="settings-form">
            <input type="hidden" name="guildId" value={guild.id} />
            <input type="hidden" name="page" value="watch" />
            <input type="hidden" name="kind" value="purge" />
            <input type="hidden" name="at" value="moderate" />
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
        <Outcome action={yours(["purge"])} error={errorAt(query, "moderate")} />
      </section>

      <div className="g-card table-card" id="cases">
        <div className="table-card__head row-between">
          <div>
            <h2>{q ? `Cases matching “${q}”` : "Cases"}</h2>
            <span className="g-help">
              {q
                ? `${cases.length} found`
                : "The latest 50. Every warning, timeout, kick, ban and cleared channel is a case."}
            </span>
          </div>
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
        {undone || errorAt(query, "cases") ? (
          <div className="table-card__head">
            <Outcome action={undone} error={errorAt(query, "cases")} />
          </div>
        ) : null}
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
                    <span className="nowrap">
                      <ActionBadge action={c.action} />{" "}
                      <span className="mono">{formatDuration(c.durationSeconds)}</span>
                    </span>
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
                  </td>
                  <td className="muted">
                    {c.source === "manual"
                      ? c.moderatorTag
                      : c.source === "escalation"
                        ? "Escalation rule"
                        : "Automod"}
                  </td>
                  <td>
                    <When date={c.createdAt} mono />
                  </td>
                  <td>
                    {c.revokedAt ? (
                      <span className="g-badge">Undone</span>
                    ) : UNDOABLE.has(c.action) ? (
                      <form action={requestAction}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="watch" />
                        <input type="hidden" name="kind" value="undo_case" />
                        <input type="hidden" name="caseNumber" value={c.caseNumber} />
                        <input type="hidden" name="at" value="cases" />
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

      <section className="g-card card-col" id="ladder" aria-labelledby="ladder-title">
        <CardHead
          title={<span id="ladder-title">What warnings lead to</span>}
          help="Garrison does this by itself when a member's active warnings reach a step. Undone warnings don't count."
        />
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
        <details className="card-edit" id="edit-ladder" open={isEditing(query, "edit-ladder")}>
          <summary className="g-btn g-btn--secondary">
            <GearIcon />
            Change the steps
          </summary>
          <form
            action={saveLadder}
            className="card-col"
            key={rules
              .map((r) => `${r.warnCount}:${r.windowMinutes}:${r.action}:${r.durationSeconds}`)
              .join("|")}
          >
            <input type="hidden" name="guildId" value={guild.id} />
            <p className="g-help">
              Up to {LADDER_MAX_STEPS} steps. Leave a row's warnings blank to remove it.
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
            <FormFoot label="Save steps" guildId={guild.id} />
          </form>
        </details>
      </section>

      {/* Keyed by last update: after a save or undo the form re-mounts with the stored
          values, instead of keeping stale browser state that a later save would re-apply. */}
      <SettingsPanel
        title="Moderation settings"
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
          <FormFoot label="Save moderation settings" guildId={guild.id} />
        </form>
      </SettingsPanel>

      <RequestsHistory kinds={KINDS} actions={actions} />
    </>
  );
}
