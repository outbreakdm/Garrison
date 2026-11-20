import {
  backupsKept,
  entitlements,
  getGuildPlan,
  getOverview,
  listBackups,
  listOpenQuarantines,
  listVerifyAnswers,
  readVerifyQuestions,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoSaveCard } from "@/components/AutoSave";
import { ProTag } from "@/components/cards/CardEditor";
import { PresetCards } from "@/components/choices";
import { DurationBar, untilText } from "@/components/DurationBar";
import { formatTime } from "@/components/format";
import { HowItWorks } from "@/components/HowItWorks";
import { ListField } from "@/components/ListField";
import { HeadSwitch } from "@/components/ModuleHead";
import { ActivityLayout, SetupLayout } from "@/components/PageLayouts";
import { PageTabs, TabPanel } from "@/components/PageTabs";
import { PresetFill } from "@/components/PresetFill";
import { RecValue } from "@/components/RecValue";
import { RequestsPanel } from "@/components/RequestsPanel";
import { ChannelSelect, CheckList, SettingsNotice, Switch } from "@/components/settings";
import { getDb } from "@/lib/db";
import { guildOwnerId, listGuildRoles, listTextChannels } from "@/lib/discord";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import {
  saveAntiRaid,
  saveBackupWeekly,
  saveVerification,
  saveVerifyQuestions,
  undoChange,
} from "../settings/actions";
import { QuestionsEditor } from "./QuestionsEditor";

export const metadata: Metadata = { title: "Security" };

const KINDS = [
  "lockdown_start",
  "lockdown_end",
  "release_quarantine",
  "post_verify_panel",
  "anti_nuke",
  "backup_create",
  "backup_restore",
  "verify_decide",
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-row">
      <span className="muted">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

const ANSWER_STATUS: Record<string, string> = {
  waiting: "Waiting",
  verified: "Verified by answering",
  approved: "Approved",
  denied: "Denied",
};

function Hidden({ guildId, kind }: { guildId: string; kind: string }) {
  return (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="page" value="gatehouse" />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
}

/** Security's tabs: what you can do right now first, then each guard's setup. */
const SECURITY_TABS = ["now", "antiraid", "verification", "antinuke"] as const;

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
  const [
    { gatehouse: g, activeLockdown: l },
    quarantines,
    channels,
    roles,
    ownerId,
    backups,
    plan,
    answers,
  ] = await Promise.all([
    getOverview(db, guild.id),
    listOpenQuarantines(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    guildOwnerId(guild.id).catch(() => null),
    listBackups(db, guild.id),
    getGuildPlan(db, guild.id),
    listVerifyAnswers(db, guild.id, 12),
  ]);
  const waiting = answers.filter((a) => a.status === "waiting");
  const ent = entitlements(plan);
  const isOwner = ownerId === session.userId;
  // Anti-raid, verification and weekly backups share one stored row (and its time).
  const stamp = g?.updatedAt.getTime() ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Security</h1>
          <p>Lock the server, verify newcomers, and watch for raids and rogue admins.</p>
        </div>
        <HeadSwitch
          key={stamp}
          label="Anti-raid"
          name="antiRaidEnabled"
          form="anti-raid-form"
          defaultChecked={g?.antiRaidEnabled ?? true}
        />
      </div>
      <PageTabs
        label="Security"
        tabs={[
          { id: "now", label: "Now" },
          { id: "antiraid", label: "Anti-raid" },
          { id: "verification", label: "Verification" },
          { id: "antinuke", label: "Anti-nuke" },
        ]}
      />

      <RequestsPanel guildId={guild.id} kinds={KINDS} query={query} />
      <SettingsNotice query={query} />

      <TabPanel id="now" tabs={SECURITY_TABS}>
        <ActivityLayout
          main={
            <>
              {" "}
              <section
                className={`g-card card-col gate-lockdown ${l ? "gate-lockdown--on" : ""}`}
                id="lockdown"
                aria-labelledby="lockdown-title"
              >
                <div className="card-head">
                  <h2 className="card-title" id="lockdown-title">
                    Lockdown
                  </h2>
                  {l ? (
                    <span className="g-badge g-badge--alert">Active</span>
                  ) : (
                    <span className="g-badge g-badge--off">Not locked</span>
                  )}
                </div>
                {l ? (
                  <>
                    <Row label="Started" value={formatTime(l.startedAt)} />
                    <Row
                      label="Lifts"
                      value={l.endsAt ? formatTime(l.endsAt) : "When someone lifts it"}
                    />
                    {l.endsAt && l.endsAt.getTime() > Date.now() ? (
                      <DurationBar
                        value={Date.now() - l.startedAt.getTime()}
                        max={l.endsAt.getTime() - l.startedAt.getTime()}
                        label="Lockdown time served, out of its length"
                        text={`Lifts ${untilText(l.endsAt.getTime() - Date.now())}`}
                        tone="alert"
                      />
                    ) : null}
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
                    <p className="g-help">
                      Locking stops @everyone talking in every channel; staff roles keep talking.
                    </p>
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
              </section>
              <section
                className="g-card card-col"
                id="quarantine"
                aria-labelledby="quarantine-title"
              >
                <h2 className="card-title" id="quarantine-title">
                  Quarantined <span className="count">{quarantines.length}</span>
                </h2>
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
                  <p className="feed__empty">
                    Nobody. Admins anti-nuke stops land here until the owner or a trusted user
                    restores them.
                  </p>
                )}
              </section>
            </>
          }
          side={
            <>
              {" "}
              <AutoSaveCard
                id="backups"
                title="Backups"
                action={saveBackupWeekly}
                undo={undoChange}
                guildId={guild.id}
                stamp={stamp}
                saveLabel="Save"
                aside={<span className="count">{backups.length}</span>}
                footer={
                  <>
                    <p className="g-help">
                      Roles, channels and their permissions. A restore adds only what's missing.
                    </p>
                    <HowItWorks>
                      Categories are saved too. Restoring recreates only what's missing, so it's
                      safe after a nuke. Garrison keeps {backupsKept(ent)}{" "}
                      {backupsKept(ent) === 1 ? "backup" : "backups"}; only the owner can restore.
                    </HowItWorks>
                    <form action={requestAction}>
                      <Hidden guildId={guild.id} kind="backup_create" />
                      <button type="submit" className="g-btn g-btn--secondary">
                        Back up now
                      </button>
                    </form>
                    {backups.length ? (
                      <ul className="feed">
                        {backups.map((b) => (
                          <li key={b.id} className="feed__item feed__item--backup">
                            <span className="feed__what">
                              {formatTime(b.createdAt)}
                              <br />
                              <span className="muted">
                                {b.roleCount} roles · {b.channelCount} channels ·{" "}
                                {b.kind === "weekly"
                                  ? "weekly"
                                  : `by ${b.createdByName ?? "staff"}`}
                                {b.restoredAt ? ` · restored ${formatTime(b.restoredAt)}` : ""}
                              </span>
                            </span>
                            {isOwner ? (
                              <details className="confirm">
                                <summary className="confirm__toggle g-btn g-btn--ghost g-btn--sm">
                                  Restore…
                                </summary>
                                <form action={requestAction} className="card-col">
                                  <Hidden guildId={guild.id} kind="backup_restore" />
                                  <input type="hidden" name="backupId" value={b.id} />
                                  <p className="g-help">
                                    Recreates roles and channels from this backup that aren't in the
                                    server now.
                                  </p>
                                  <button type="submit" className="g-btn g-btn--danger g-btn--sm">
                                    Yes, restore what's missing
                                  </button>
                                </form>
                              </details>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="feed__empty">
                        No backups yet. Take one now, before you need it.
                      </p>
                    )}
                  </>
                }
              >
                <label className="switch">
                  <input
                    type="checkbox"
                    name="backupWeekly"
                    defaultChecked={g?.backupWeekly ?? false}
                    disabled={!ent["backups.weekly"] && !g?.backupWeekly}
                  />
                  <span className="switch__text">
                    <span className="field-label">
                      Back up every week by itself <ProTag on={ent["backups.weekly"]} />
                    </span>
                  </span>
                </label>
              </AutoSaveCard>
            </>
          }
        />
      </TabPanel>
      <TabPanel id="antiraid" tabs={SECURITY_TABS}>
        <SetupLayout index={false}>
          {" "}
          <AutoSaveCard
            id="anti-raid"
            title="Anti-raid"
            action={saveAntiRaid}
            undo={undoChange}
            guildId={guild.id}
            stamp={stamp}
            saveLabel="Save anti-raid"
          >
            <p className="g-help">
              Watches how fast people join. Too many too fast is a raid, and Garrison answers it the
              way you pick below.
            </p>
            <PresetFill
              name="_raid"
              label="A raid is"
              current={{
                raidJoinCount: g?.raidJoinCount ?? 10,
                raidWindowSeconds: g?.raidWindowSeconds ?? 30,
              }}
              options={[
                {
                  value: "relaxed",
                  label: "Relaxed",
                  line: "20 joins in 30 s",
                  fills: { raidJoinCount: 20, raidWindowSeconds: 30 },
                },
                {
                  value: "balanced",
                  label: "Balanced",
                  line: "10 joins in 30 s",
                  fills: { raidJoinCount: 10, raidWindowSeconds: 30 },
                  recommended: true,
                },
                {
                  value: "strict",
                  label: "Strict",
                  line: "5 in 30 s, for small servers",
                  fills: { raidJoinCount: 5, raidWindowSeconds: 30 },
                },
              ]}
            />
            {/* The rule reads as a sentence, its numbers in place (docs/LAYOUT_PROPOSAL.md §7). */}
            <p className="rule-line">
              It's a raid when{" "}
              <label className="rule-line__num">
                <span className="sr-only">Joins</span>
                <input
                  className="g-input"
                  id="raidJoinCount"
                  name="raidJoinCount"
                  type="number"
                  min={3}
                  max={200}
                  defaultValue={g?.raidJoinCount ?? 10}
                />
              </label>{" "}
              or more people join within{" "}
              <label className="rule-line__num">
                <span className="sr-only">Within seconds</span>
                <input
                  className="g-input"
                  id="raidWindowSeconds"
                  name="raidWindowSeconds"
                  type="number"
                  min={5}
                  max={600}
                  defaultValue={g?.raidWindowSeconds ?? 30}
                />
              </label>{" "}
              seconds.
            </p>
            <PresetCards
              name="raidResponse"
              label="On a raid"
              value={g?.raidResponse ?? "lockdown"}
              options={[
                {
                  value: "lockdown",
                  label: "Lock down",
                  does: "Lock the server and pause invites",
                  about: "New members can't talk until it unlocks. Right for almost every server.",
                  recommended: true,
                },
                {
                  value: "alert",
                  label: "Alert only",
                  does: "Post an alert, change nothing",
                  about: "Staff decide what to do. For servers that would rather never lock.",
                },
              ]}
            />
            <div className="field-row">
              <label className="g-field" htmlFor="autoUnlockMinutes">
                <span>Unlock after (minutes)</span>
                <input
                  className="g-input"
                  id="autoUnlockMinutes"
                  name="autoUnlockMinutes"
                  type="number"
                  min={0}
                  max={1440}
                  defaultValue={g?.autoUnlockMinutes ?? 15}
                />
                <RecValue field="autoUnlockMinutes" value={15} />
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
                <RecValue field="flagAccountAgeDays" value={7} />
              </label>
            </div>
            <span className="g-help">
              0 keeps it locked until someone lifts it, or flags nobody.
            </span>
            <label className="g-field" htmlFor="alertChannelId">
              <span>Alert channel</span>
              <ChannelSelect
                name="alertChannelId"
                value={g?.alertChannelId ?? null}
                channels={channels}
                none="Use the moderation log channel"
              />
            </label>
            <CheckList
              name="staffRoleIds"
              label="Staff roles (keep talking during a lockdown)"
              value={g?.staffRoleIds ?? []}
              options={roles.map((r) => ({ id: r.id, label: `@${r.name}` }))}
              help={<>Up to 10.</>}
            />
          </AutoSaveCard>
        </SetupLayout>
      </TabPanel>
      <TabPanel id="verification" tabs={SECURITY_TABS}>
        <SetupLayout>
          {" "}
          <AutoSaveCard
            id="verification"
            title="Verification"
            action={saveVerification}
            undo={undoChange}
            guildId={guild.id}
            stamp={stamp}
            saveLabel="Save verification"
            aside={
              g?.verifyRoleId ? (
                <span className="g-badge g-badge--go">On</span>
              ) : (
                <span className="g-badge g-badge--off">Off</span>
              )
            }
            footer={
              g?.verifyRoleId ? (
                <form action={requestAction} className="verify-post">
                  <Hidden guildId={guild.id} kind="post_verify_panel" />
                  <label className="g-field" htmlFor="verify-channel">
                    <span>Post the Verify button in</span>
                    <select
                      className="g-input"
                      id="verify-channel"
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
                  <button type="submit" className="g-btn g-btn--secondary">
                    Post Verify button
                  </button>
                </form>
              ) : null
            }
          >
            <p className="g-help">
              New members press Verify in Discord to get a role, which is how you keep bots and
              throwaway accounts out of the rest of the server.
            </p>
            <div className="settings-grid">
              <label className="g-field" htmlFor="verifyRoleId">
                <span>Verifying gives</span>
                <select
                  className="g-input"
                  id="verifyRoleId"
                  name="verifyRoleId"
                  defaultValue={g?.verifyRoleId ?? ""}
                >
                  <option value="">Nothing: verification off</option>
                  {roles
                    .filter((r) => !r.managed && !isDangerousRole(r.permissions))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                </select>
                <span className="g-help">Not a role with admin or moderation powers.</span>
              </label>
              <label className="g-field" htmlFor="verifyMinAccountAgeDays">
                <span>Accounts at least (days old)</span>
                <input
                  className="g-input"
                  id="verifyMinAccountAgeDays"
                  name="verifyMinAccountAgeDays"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={g?.verifyMinAccountAgeDays ?? 0}
                />
                <span className="g-help">0 lets any account verify.</span>
              </label>
            </div>
            <Switch
              name="verifyWeb"
              defaultChecked={g?.verifyWeb ?? false}
              label="Verify on the website"
              help="The Verify button links to a page where members sign in with Discord (and pass a captcha if the host has Turnstile keys) before getting the role."
            />
          </AutoSaveCard>
          <QuestionsEditor
            guildId={guild.id}
            questions={readVerifyQuestions(g?.verifyQuestions)}
            intro={g?.verifyIntro ?? null}
            review={g?.verifyReview ?? false}
            channelId={g?.verifyAnswersChannelId ?? null}
            channels={channels}
            off={!g?.verifyRoleId}
            action={saveVerifyQuestions}
            undo={undoChange}
            stamp={String(stamp)}
          />
          {answers.length ? (
            <section className="g-card card-col" id="answers" aria-labelledby="answers-title">
              <div className="card-head">
                <h2 className="card-title" id="answers-title">
                  {waiting.length ? "Waiting for staff" : "Latest answers"}
                </h2>
                {waiting.length ? <span className="count">{waiting.length}</span> : null}
              </div>
              <ul className="answers-list">
                {answers.map((a) => (
                  <li key={a.id} className="answers-list__item" data-status={a.status}>
                    <div className="answers-list__head">
                      <strong>{a.username}</strong>
                      <span className="muted">
                        {ANSWER_STATUS[a.status] ?? a.status}
                        {a.decidedBy ? ` by ${a.decidedBy}` : ""} · {formatTime(a.createdAt)}
                      </span>
                    </div>
                    <dl className="answers-list__answers">
                      {a.answers.map((x) => (
                        <div key={x.label}>
                          <dt>{x.label}</dt>
                          <dd>{x.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {a.status === "waiting" ? (
                      <div className="answers-list__actions">
                        {(["approve", "deny"] as const).map((op) => (
                          <form action={requestAction} key={op}>
                            <Hidden guildId={guild.id} kind="verify_decide" />
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="op" value={op} />
                            <button
                              type="submit"
                              className={
                                op === "approve"
                                  ? "g-btn g-btn--secondary g-btn--sm"
                                  : "g-btn g-btn--danger g-btn--sm"
                              }
                            >
                              {op === "approve" ? "Approve" : "Deny"}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="g-help">Answers are deleted after 30 days.</p>
            </section>
          ) : null}
        </SetupLayout>
      </TabPanel>
      <TabPanel id="antinuke" tabs={SECURITY_TABS}>
        <SetupLayout index={false}>
          {" "}
          <section className="g-card card-col" id="anti-nuke" aria-labelledby="anti-nuke-title">
            <div className="card-head">
              <h2 className="card-title" id="anti-nuke-title">
                Anti-nuke
              </h2>
              <span className="g-badge">Owner only</span>
            </div>
            {isOwner ? (
              <form action={requestAction} className="card-col" key={JSON.stringify(g)}>
                <Hidden guildId={guild.id} kind="anti_nuke" />
                <Switch
                  name="enabled"
                  defaultChecked={g?.antiNukeEnabled ?? true}
                  label="Strip a rogue admin's roles when they mass-delete or mass-ban"
                  recommended
                  help="They're quarantined until you or a trusted user restores them."
                />
                <PresetFill
                  name="_nuke"
                  label="Steps in at"
                  current={{
                    deleteThreshold: g?.nukeDeleteThreshold ?? 3,
                    banThreshold: g?.nukeBanThreshold ?? 5,
                  }}
                  options={[
                    {
                      value: "relaxed",
                      label: "Relaxed",
                      line: "6 deletions or 10 bans a minute",
                      fills: { deleteThreshold: 6, banThreshold: 10 },
                    },
                    {
                      value: "balanced",
                      label: "Balanced",
                      line: "3 deletions or 5 bans a minute",
                      fills: { deleteThreshold: 3, banThreshold: 5 },
                      recommended: true,
                    },
                    {
                      value: "strict",
                      label: "Strict",
                      line: "2 or 3",
                      fills: { deleteThreshold: 2, banThreshold: 3 },
                    },
                  ]}
                />
                <div className="field-row">
                  <label className="g-field" htmlFor="deleteThreshold">
                    <span>Deletions a minute</span>
                    <input
                      className="g-input"
                      id="deleteThreshold"
                      name="deleteThreshold"
                      type="number"
                      min={2}
                      max={50}
                      defaultValue={g?.nukeDeleteThreshold ?? 3}
                    />
                  </label>
                  <label className="g-field" htmlFor="banThreshold">
                    <span>Bans a minute</span>
                    <input
                      className="g-input"
                      id="banThreshold"
                      name="banThreshold"
                      type="number"
                      min={2}
                      max={100}
                      defaultValue={g?.nukeBanThreshold ?? 5}
                    />
                  </label>
                </div>
                <fieldset className="g-field checklist">
                  <legend className="checklist__legend">Trusted user IDs (never acted on)</legend>
                  <ListField
                    name="trustedIds"
                    noun="user ID"
                    defaultItems={g?.antiNukeTrustedIds ?? []}
                    max={10}
                    maxLength={20}
                    inputMode="numeric"
                    placeholder="123456789012345678"
                  />
                  <span className="g-help">
                    In Discord: Settings → Advanced → Developer Mode, then right-click a member →
                    Copy User ID.
                  </span>
                </fieldset>
                <div className="form-foot">
                  <button type="submit" className="g-btn g-btn--primary">
                    Save anti-nuke
                  </button>
                  <span className="g-help">
                    Garrison checks with Discord that you own the server before it changes.
                  </span>
                </div>
              </form>
            ) : (
              <>
                <Row label="Status" value={g?.antiNukeEnabled ? "Armed" : "Off"} />
                <Row
                  label="Steps in at"
                  value={
                    g
                      ? `${g.nukeDeleteThreshold} deletions or ${g.nukeBanThreshold} bans a minute`
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
          </section>
        </SetupLayout>
      </TabPanel>
    </>
  );
}
