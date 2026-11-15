import {
  AI_SUPPLIES_PER_FULL_PLAN,
  AI_SUPPLIES_PER_MESSAGE,
  aiAllowance,
  entitlements,
  getGuildPlan,
  latestQmThread,
  listDashboardActions,
  listQmBuilds,
  listQmThread,
  listTemplates,
  QM_CHANGES_PER_PLAN,
  QM_PLAN_TTL_MS,
  type QmBuild,
  qmChangeCount,
  TEMPLATE_NAME_MAX,
  TEMPLATES_PER_USER,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProTag } from "@/components/cards/CardEditor";
import { formatTime } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import { ServerPreview } from "@/components/ServerPreview";
import { getDb } from "@/lib/db";
import { getServerLayout, guildOwnerId } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { addedText, planLines, previewServer, settingDiffs, settingLines } from "@/lib/qm-preview";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { removeTemplate } from "./actions";

export const metadata: Metadata = { title: "AI builder" };

/** A request is at most this long, as the bot enforces. */
const REQUEST_MAX = 500;

const STATUS: Record<QmBuild["status"], { label: string; tone: string }> = {
  pending: { label: "Not built", tone: "g-badge--intel" },
  applied: { label: "Built", tone: "g-badge--go" },
  cancelled: { label: "Discarded", tone: "g-badge--off" },
  expired: { label: "Expired", tone: "g-badge--off" },
  failed: { label: "Stopped partway", tone: "g-badge--alert" },
  rolled_back: { label: "Undone", tone: "g-badge--caution" },
};

/** First messages to tap when a conversation is empty. */
const STARTERS = [
  "Set up a section for a game we play",
  "Organize my whole server",
  "We're a WoW raiding guild",
  "Add a staff area",
];

/** Changes a build counts against its day: what it built, or what it plans while it waits. */
function changesOf(b: QmBuild) {
  return b.status === "failed" || b.status === "rolled_back" ? b.created.length : qmChangeCount(b);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function QuartermasterPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const { guild, session } = await requireGuildAccess(guildId);
  const db = await getDb();
  const fresh = query.fresh === "1";
  const [builds, actions, layout, templates, guildPlan, ownerId, flash, allowance, threadId] =
    await Promise.all([
      listQmBuilds(db, guild.id, 25),
      listDashboardActions(db, guild.id, 30),
      getServerLayout(guild.id).catch(() => null),
      listTemplates(db, session.userId),
      getGuildPlan(db, guild.id),
      guildOwnerId(guild.id).catch(() => null),
      readFlash(),
      aiAllowance(db, guild.id, session.userId),
      fresh ? null : latestQmThread(db, guild.id, session.userId),
    ]);
  const messages = threadId ? await listQmThread(db, guild.id, session.userId, threadId) : [];
  const ent = entitlements(guildPlan);
  const isOwner = ownerId === session.userId;
  const now = Date.now();
  const waiting = (b: QmBuild) =>
    b.status === "pending" && now - b.createdAt.getTime() < QM_PLAN_TTL_MS;
  const plan = builds.find(waiting) ?? null;
  const history = builds.filter((b) => b !== plan);
  const versionOf = new Map(builds.map((b) => [b.id, b.version]));
  const nextVersion = (builds[0]?.version ?? 0) + 1;
  const planning = actions.some(
    (a) => a.kind === "qm_plan" && (a.status === "pending" || a.status === "running"),
  );
  const building = plan
    ? actions.some(
        (a) =>
          a.kind === "qm_apply" &&
          (a.status === "pending" || a.status === "running") &&
          (a.payload as { id?: string }).id === plan.id,
      )
    : false;
  const preview = layout ? previewServer(layout, plan?.plan ?? []) : null;
  const diffs = plan ? settingDiffs(layout, plan.plan, plan.settings ?? []) : [];
  const minutesLeft = plan
    ? Math.max(1, Math.ceil((plan.createdAt.getTime() + QM_PLAN_TTL_MS - now) / 60_000))
    : 0;
  const mine = plan?.requestedById === session.userId;

  // Continuing a built plan: ?continue=<version> on a build that was built (or partly).
  const asked = Number(query.continue);
  const cont =
    history.find((b) => b.version === asked && (b.status === "applied" || b.status === "failed")) ??
    null;
  const prefill =
    cont && query.use === "notes" && cont.notes
      ? `Add what you suggested next: ${cont.notes}`.slice(0, REQUEST_MAX)
      : "";
  // A message on its way: queued (shown as sent) or being answered (Garrison is typing).
  const myChat = actions.filter(
    (a) =>
      a.kind === "qm_chat" &&
      a.requestedById === session.userId &&
      (a.status === "pending" || a.status === "running"),
  );
  const queued = myChat
    .filter((a) => a.status === "pending")
    .map((a) => String((a.payload as { message?: string }).message ?? ""))
    .reverse();
  const thinking = myChat.length > 0;
  const lastBot = [...messages].reverse().find((m) => m.role === "assistant");
  const choices = thinking
    ? []
    : messages.length === 0 && !cont
      ? STARTERS
      : messages.at(-1)?.role === "assistant"
        ? (lastBot?.choices ?? [])
        : [];
  // Where the next message goes: this conversation, or a new one (fresh or continuing).
  const newThread = fresh || cont !== null;
  const chatHidden = (
    <>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="page" value="quartermaster" />
      <input type="hidden" name="kind" value="qm_chat" />
      {threadId && !newThread ? <input type="hidden" name="threadId" value={threadId} /> : null}
      {newThread ? <input type="hidden" name="fresh" value="1" /> : null}
      {cont ? <input type="hidden" name="continues" value={cont.id} /> : null}
    </>
  );

  const { suppliesLeft, suppliesPerDay, perPerson } = allowance;
  const fullPlans = Math.floor(suppliesLeft / AI_SUPPLIES_PER_FULL_PLAN);
  const messagesLeft = Math.floor(suppliesLeft / AI_SUPPLIES_PER_MESSAGE);
  const canMessage = suppliesLeft >= AI_SUPPLIES_PER_MESSAGE;
  const blocked = thinking ? "Sending…" : canMessage ? null : "Out of supplies today";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI builder</h1>
          <p>
            Describe the channels and roles you want, or ask how Garrison is set up here. See your
            server with the changes, then build it in one click. Keep going from any version, and
            undo any build.
          </p>
        </div>
      </div>

      <div className="qm-layout">
        <div className="qm-main">
          <section
            className={`g-card qm-chat${cont ? " qm-chat--continue" : ""}`}
            id="describe"
            aria-labelledby="qm-chat-title"
          >
            {thinking ? <AutoRefresh every={2000} forMs={90_000} /> : null}
            <div className="qm-chat__head">
              <div>
                <h2 className="qm-chat__title" id="qm-chat-title">
                  {cont ? `Keep building v${cont.version}` : "Talk it through"}
                </h2>
                <p className="g-help">
                  Tell Garrison what your community is about. It asks what it needs, suggests ideas,
                  and drafts a plan you can preview and build.
                </p>
              </div>
              {messages.length || cont ? (
                <a className="g-btn g-btn--ghost g-btn--sm" href="?fresh=1#describe">
                  New conversation
                </a>
              ) : null}
            </div>
            {cont ? (
              <div className="qm-thread">
                <span className="g-badge g-badge--accent">Continuing v{cont.version}</span>
                <span className="qm-thread__what">{cont.summary}</span>
                <a className="qm-thread__clear" href="?#describe">
                  Back to your conversation
                </a>
              </div>
            ) : null}
            <ol className="qm-chat__log" aria-live="polite" aria-label="Conversation">
              {messages.length === 0 && !queued.length ? (
                <li className="qm-msg qm-msg--bot">
                  <span className="qm-msg__mark" aria-hidden="true" />
                  <div className="qm-msg__bubble">
                    <p>
                      {cont
                        ? `v${cont.version} is built. What should it get next? I can also suggest what's missing.`
                        : "Hi! What's your server about? Tell me the games you play and what you need, and I'll design the channels and roles. You can also ask me what's set up and what's missing. Nothing changes until you build it."}
                    </p>
                  </div>
                </li>
              ) : null}
              {messages.map((m) => {
                const drafted = m.buildId ? builds.find((b) => b.id === m.buildId) : undefined;
                return (
                  <li
                    key={m.id}
                    className={`qm-msg ${m.role === "user" ? "qm-msg--me" : "qm-msg--bot"}`}
                  >
                    {m.role === "user" ? null : (
                      <span className="qm-msg__mark" aria-hidden="true" />
                    )}
                    <div className="qm-msg__bubble">
                      <p>{m.text}</p>
                      {drafted ? (
                        <a
                          className="qm-msg__plan"
                          href={drafted === plan ? "#plan" : "#qm-builds-title"}
                        >
                          <span className="g-badge g-badge--accent">Plan v{drafted.version}</span>
                          <span>
                            {plural(qmChangeCount(drafted), "change")} ·{" "}
                            {drafted === plan
                              ? "preview below"
                              : STATUS[drafted.status === "pending" ? "expired" : drafted.status]
                                  .label}
                          </span>
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {queued.map((text, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: queued messages have no id yet
                <li key={`q${i}`} className="qm-msg qm-msg--me qm-msg--queued">
                  <div className="qm-msg__bubble">
                    <p>{text}</p>
                  </div>
                </li>
              ))}
              {thinking ? (
                <li className="qm-msg qm-msg--bot" role="status">
                  <span className="qm-msg__mark" aria-hidden="true" />
                  <div className="qm-msg__bubble qm-msg__typing">
                    <span className="qm-typing" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="sr-only">Garrison is replying</span>
                  </div>
                </li>
              ) : null}
            </ol>
            {choices.length ? (
              <form action={requestAction} className="qm-chat__choices">
                {chatHidden}
                {choices.map((c) => (
                  <button
                    key={c}
                    type="submit"
                    name="message"
                    value={c}
                    className="chip"
                    disabled={blocked !== null}
                  >
                    {c}
                  </button>
                ))}
              </form>
            ) : null}
            <form
              action={requestAction}
              className="qm-chat__composer"
              key={`${threadId ?? "new"}:${messages.length}:${cont?.id ?? ""}`}
            >
              {chatHidden}
              <label className="sr-only" htmlFor="qm-message">
                Message the AI builder
              </label>
              <textarea
                className="g-input qm-chat__input"
                id="qm-message"
                name="message"
                rows={2}
                maxLength={REQUEST_MAX}
                required
                placeholder={
                  cont
                    ? "A clips channel, a ranked voice room and a Diamond role"
                    : messages.length
                      ? "Answer, or ask for changes"
                      : "We play Valorant and Apex, about 200 members, mostly ranked"
                }
                defaultValue={prefill}
              />
              <button type="submit" className="g-btn g-btn--primary" disabled={blocked !== null}>
                {blocked ?? "Send"}
              </button>
            </form>
            <p className="qm-compose__left">
              Each message uses {AI_SUPPLIES_PER_MESSAGE} supplies · {suppliesLeft} of{" "}
              {suppliesPerDay} left today
            </p>
          </section>

          <RequestsPanel
            guildId={guild.id}
            kinds={[
              "qm_plan",
              "qm_apply",
              "qm_cancel",
              "undo_build",
              "template_save",
              "template_apply",
            ]}
            query={query}
          />

          {plan && preview ? (
            <section className="qm-plan" id="plan" aria-label={`Plan v${plan.version}`}>
              <div className="qm-plan__head">
                <div className="qm-plan__tags">
                  <span className="g-badge g-badge--accent">Plan v{plan.version}</span>
                  {plan.continuesId && versionOf.has(plan.continuesId) ? (
                    <span className="qm-lineage">Continues v{versionOf.get(plan.continuesId)}</span>
                  ) : null}
                  <span className="qm-plan__timer">
                    Waits {minutesLeft} more min · asked by {plan.requestedByTag}
                  </span>
                </div>
                <h2>{plan.summary}</h2>
                {/* The request is user text; React escapes it. */}
                <p className="muted">“{plan.prompt}”</p>
              </div>
              {plan.plan.length || !diffs.length ? (
                <ServerPreview name={guild.name} preview={preview} planned />
              ) : null}
              {diffs.length ? (
                <div className="qm-settings">
                  <h3 className="g-label">Settings it changes</h3>
                  <dl className="qm-settings__list">
                    {diffs.map((d) => (
                      <div key={d.label}>
                        <dt>{d.label}</dt>
                        <dd>
                          <span className="qm-settings__from">{d.from}</span>
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> becomes </span>
                          <strong>{d.to}</strong>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              {plan.notes ? (
                <div className="qm-notes">
                  <h3 className="g-label">Notes from the AI builder</h3>
                  <p>{plan.notes}</p>
                </div>
              ) : null}
              <div className="qm-plan__foot">
                <p>
                  Building this{" "}
                  {plan.plan.length ? (
                    <>
                      adds <strong>{addedText(preview.added)}</strong> to {guild.name}
                      {diffs.length ? " and " : ""}
                    </>
                  ) : null}
                  {diffs.length ? (
                    <>
                      changes <strong>{plural(diffs.length, "setting")}</strong>
                    </>
                  ) : null}
                  . It uses {plural(qmChangeCount(plan), "supply", "supplies")}, held from today's
                  until it's built or expires.
                  {mine
                    ? ""
                    : ` Only ${plan.requestedByTag} can build it; you can change or discard it.`}
                </p>
                <div className="qm-plan__actions">
                  <form action={requestAction}>
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="page" value="quartermaster" />
                    <input type="hidden" name="kind" value="qm_cancel" />
                    <input type="hidden" name="id" value={plan.id} />
                    <button type="submit" className="g-btn g-btn--ghost" disabled={building}>
                      Discard
                    </button>
                  </form>
                  {mine ? (
                    <form action={requestAction}>
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="quartermaster" />
                      <input type="hidden" name="kind" value="qm_apply" />
                      <input type="hidden" name="id" value={plan.id} />
                      <button type="submit" className="g-btn g-btn--primary" disabled={building}>
                        {building ? "Building…" : `Build v${plan.version}`}
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
              <details className="qm-revise" id="revise">
                <summary className="qm-revise__summary">
                  <span>Change this plan</span>
                  <span className="g-help">
                    Ask for edits or more. It becomes v{nextVersion} and replaces v{plan.version}.
                  </span>
                  <span className="panel__cue" aria-hidden="true" />
                </summary>
                <form action={requestAction} className="qm-revise__form">
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="page" value="quartermaster" />
                  <input type="hidden" name="kind" value="qm_plan" />
                  <input type="hidden" name="continues" value={plan.id} />
                  <label className="sr-only" htmlFor="qm-revise">
                    What should change in v{plan.version}?
                  </label>
                  <textarea
                    className="g-input"
                    id="qm-revise"
                    name="request"
                    rows={2}
                    maxLength={REQUEST_MAX}
                    required
                    placeholder="Make ranked LFG Gold+ only, and add a clips channel"
                  />
                  <button
                    type="submit"
                    className="g-btn g-btn--secondary"
                    disabled={building || planning || suppliesLeft <= AI_SUPPLIES_PER_MESSAGE}
                  >
                    {planning ? "Planning…" : `Revise into v${nextVersion}`}
                  </button>
                </form>
              </details>
            </section>
          ) : (
            <section className="card-col" aria-label="Your server">
              {planning ? (
                <div className="notice notice--ok" role="status">
                  Garrison is revising the plan. The preview appears here by itself, usually within
                  30 seconds.
                </div>
              ) : null}
              {preview ? (
                <ServerPreview name={guild.name} preview={preview} planned={false} />
              ) : (
                <div className="g-card muted">
                  Discord didn't answer, so there's no preview right now. Plans still work.
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="qm-aside" aria-label="Today's supplies and rules">
          <section className="g-card qm-allow" aria-labelledby="qm-allow-title">
            <h2 className="card-title" id="qm-allow-title">
              Today's supplies
            </h2>
            <p className="qm-allow__count">
              <span className="qm-allow__num">{suppliesLeft}</span>
              <span className="muted">of {suppliesPerDay} left</span>
            </p>
            <div className={`qm-meter qm-meter--n${suppliesPerDay / QM_CHANGES_PER_PLAN}`}>
              <progress
                className="xpbar qm-meter__bar"
                max={suppliesPerDay}
                value={suppliesLeft}
                aria-label={`${suppliesLeft} of ${suppliesPerDay} supplies left today`}
              />
            </div>
            <p className="g-help">
              {canMessage
                ? `Enough for about ${plural(fullPlans, "full plan")} or ${plural(messagesLeft, "message")}. Back at midnight UTC.`
                : "Back at midnight UTC."}
            </p>
            <dl className="qm-allow__facts">
              <div>
                <dt>A message</dt>
                <dd>
                  {AI_SUPPLIES_PER_MESSAGE} supplies: asking, answering, or drafting and revising a
                  plan
                </dd>
              </div>
              <div>
                <dt>A change</dt>
                <dd>
                  1 supply for each channel, category or role a plan makes, up to{" "}
                  {QM_CHANGES_PER_PLAN} a plan
                </dd>
              </div>
              <div>
                <dt>Given back</dt>
                <dd>Discarded and expired plans, and messages that fail</dd>
              </div>
            </dl>
            {perPerson ? (
              <p className="g-help">
                On Free, your supplies count across every Free server you use. Pro gives this server
                its own 300 a day.
              </p>
            ) : null}
          </section>

          <section className="g-card qm-rules-card" aria-labelledby="qm-rules-title">
            <h2 className="card-title" id="qm-rules-title">
              How it builds
            </h2>
            <ul className="qm-rules">
              <li>Adds channels and roles; nothing you have is edited or deleted</li>
              <li>
                Changes settings only where you see them in the plan, with the same checks as their
                pages
              </li>
              <li>New roles get only member permissions, never moderation or admin</li>
              <li>Nothing is built until you approve the plan</li>
              <li>Undo removes what a build made and puts its settings back</li>
            </ul>
          </section>
        </aside>
      </div>

      <section className="g-card qm-builds" aria-labelledby="qm-builds-title">
        <div className="table-card__head row-between">
          <h2 className="card-title" id="qm-builds-title">
            Builds
          </h2>
          <span className="g-help">Continue any built version to add onto it</span>
        </div>
        {history.length === 0 ? (
          <p className="queue__empty muted">
            No builds yet. Describe something above and your first plan appears here.
          </p>
        ) : (
          <ol className="qm-builds__list">
            {history.map((b) => {
              // A plan nobody built in time reads as expired, whatever the row still says.
              const st = STATUS[b.status === "pending" ? "expired" : b.status];
              const built = b.status === "applied" || b.status === "failed";
              const parent = b.continuesId ? versionOf.get(b.continuesId) : undefined;
              const replaced = b.status === "cancelled" && b.error?.startsWith("Replaced by");
              return (
                <li className="qm-build" key={b.id}>
                  <span className="qm-build__v">v{b.version}</span>
                  <div className="qm-build__main">
                    <div className="qm-build__title">
                      <strong>{b.summary}</strong>
                      <span className={`g-badge ${st.tone}`}>
                        {replaced ? "Revised" : st.label}
                      </span>
                    </div>
                    <span className="qm-build__meta">
                      {plural(changesOf(b), "change")}
                      {parent ? ` · continues v${parent}` : ""} · {b.requestedByTag} ·{" "}
                      {formatTime(b.createdAt)}
                    </span>
                    <details className="qm-build__more">
                      <summary>Request and changes</summary>
                      <p className="muted">“{b.prompt}”</p>
                      <pre className="diff">
                        {[...planLines(b.plan), ...settingLines(b.settings ?? [])].join("\n")}
                      </pre>
                      {b.notes ? <p className="g-help">Notes: {b.notes}</p> : null}
                    </details>
                    {b.error && !replaced ? <span className="notice">{b.error}</span> : null}
                  </div>
                  <div className="qm-build__actions">
                    {built ? (
                      <a
                        className="g-btn g-btn--secondary g-btn--sm"
                        href={`?continue=${b.version}#describe`}
                      >
                        Continue
                      </a>
                    ) : null}
                    {built ? (
                      <details className="confirm">
                        <summary className="confirm__toggle g-btn g-btn--ghost g-btn--sm">
                          Undo…
                        </summary>
                        <form action={requestAction} className="card-col">
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value="quartermaster" />
                          <input type="hidden" name="kind" value="undo_build" />
                          <input type="hidden" name="version" value={b.version} />
                          <p className="g-help">
                            Deletes exactly the{" "}
                            {plural(b.created.length, "channel or role", "channels and roles")} v
                            {b.version} created, with any messages posted in them since. Nothing
                            else is touched.
                          </p>
                          <button type="submit" className="g-btn g-btn--danger g-btn--sm">
                            Yes, undo v{b.version}
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="g-card card-col" id="templates" aria-labelledby="templates-title">
        <div className="queue__head">
          <h2 className="card-title" id="templates-title">
            Server templates <ProTag on={ent["qm.templates"]} />
          </h2>
          <span className="g-help">
            {templates.length} of {TEMPLATES_PER_USER}
          </span>
        </div>
        <p className="g-help">
          Save this server's roles, categories, channels and their role permissions to your account,
          then copy them into another server you own. Applying only adds what that server doesn't
          already have by name; it never changes or deletes anything.
        </p>
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
        {ent["qm.templates"] ? (
          <form action={requestAction} className="row-between">
            <input type="hidden" name="guildId" value={guild.id} />
            <input type="hidden" name="page" value="quartermaster" />
            <input type="hidden" name="kind" value="template_save" />
            <input
              className="g-input"
              name="name"
              maxLength={TEMPLATE_NAME_MAX}
              placeholder={guild.name}
              aria-label="Template name"
            />
            <button
              type="submit"
              className="g-btn g-btn--secondary"
              disabled={templates.length >= TEMPLATES_PER_USER}
            >
              Save this server as a template
            </button>
          </form>
        ) : null}
        {templates.length ? (
          <ul className="queue__list">
            {templates.map((t) => (
              <li key={t.id} className="gw-row">
                <span className="gw-row__main">
                  <span className="ticket-row__topic">{t.name}</span>
                  <span className="ticket-row__who">
                    From {t.sourceGuildName || "a server"} · {t.roleCount} roles · {t.channelCount}{" "}
                    channels · {formatTime(t.createdAt)}
                  </span>
                </span>
                <span />
                <span className="gw-row__actions">
                  {isOwner && ent["qm.templates"] && t.sourceGuildId !== guild.id ? (
                    <details className="confirm">
                      <summary className="confirm__toggle g-btn g-btn--secondary g-btn--sm">
                        Apply here…
                      </summary>
                      <form action={requestAction} className="card-col">
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="quartermaster" />
                        <input type="hidden" name="kind" value="template_apply" />
                        <input type="hidden" name="templateId" value={t.id} />
                        <p className="g-help">
                          Creates the roles, categories and channels from “{t.name}” that this
                          server doesn't have yet.
                        </p>
                        <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                          Yes, apply it
                        </button>
                      </form>
                    </details>
                  ) : null}
                  <form action={removeTemplate}>
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="templateId" value={t.id} />
                    <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                      Delete
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="queue__empty muted">
            {ent["qm.templates"]
              ? "No templates yet. Save one here, then apply it in another server you own."
              : "On Pro: save a server's layout and copy it into another server you own."}
          </p>
        )}
        {templates.length && !isOwner ? (
          <p className="g-help">Only the server owner can apply a template here.</p>
        ) : null}
      </section>
    </>
  );
}
