import {
  AI_SUPPLIES_PER_MESSAGE,
  aiAllowance,
  entitlements,
  getGuildPlan,
  latestQmThread,
  listDashboardActions,
  listQmBuilds,
  listQmThread,
  listTemplates,
  QM_MIN_MESSAGE_SUPPLIES,
  QM_PLAN_TTL_MS,
  type QmBuild,
  qmChangeCount,
  qmHoldSupplies,
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
import { addedText, postPreviews, previewServer, settingDiffs } from "@/lib/qm-preview";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { removeTemplate } from "./actions";

export const metadata: Metadata = { title: "AI assistant" };

/** What a full chat message holds while it runs: 3 rounds on Haiku (the bot's default). */
const QM_FULL_MESSAGE_SUPPLIES = qmHoldSupplies("claude-haiku-5-5", 3);

/** A request is at most this long, as the bot enforces. */
const REQUEST_MAX = 500;

/** What became of a draft, shown on the chat message that made it. */
const OUTCOME: Record<QmBuild["status"], string> = {
  pending: "Expired",
  applied: "Applied",
  cancelled: "Discarded",
  expired: "Expired",
  failed: "Stopped partway",
  rolled_back: "Undone",
};

/** First messages to tap when a conversation is empty. */
const STARTERS = [
  "Set up moderation",
  "Welcome new members",
  "Set up a section for a game we play",
  "What's missing on my server?",
];

/** What the assistant does, shown in an empty conversation. */
const CAN_DO = [
  "Design channels, categories and roles",
  "Set up modules like Automod, Welcome, Leveling and Suggestions",
  "Post your saved role menus, ticket panels and messages",
  "Answer questions about how Garrison is set up here",
];

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

  // The draft: the one this conversation made last, or one of yours still waiting.
  const lastDraftId = [...messages].reverse().find((m) => m.buildId)?.buildId;
  const plan =
    builds.find((b) => b.id === lastDraftId && waiting(b)) ??
    builds.find((b) => waiting(b) && b.requestedById === session.userId) ??
    null;
  const mine = plan?.requestedById === session.userId;
  // Builds that reached the server, newest first. Drafts that were replaced or discarded don't.
  const history = builds.filter(
    (b) => b.status === "applied" || b.status === "failed" || b.status === "rolled_back",
  );
  const applying = plan
    ? actions.some(
        (a) =>
          a.kind === "qm_apply" &&
          (a.status === "pending" || a.status === "running") &&
          (a.payload as { id?: string }).id === plan.id,
      )
    : false;
  const preview = layout ? previewServer(layout, plan?.plan ?? []) : null;
  const diffs = plan ? settingDiffs(layout, plan.plan, plan.settings ?? []) : [];
  const posts = plan ? postPreviews(layout, plan.plan, plan.posts ?? []) : [];
  const changes = plan ? qmChangeCount(plan) : 0;
  // What applying does, in one sentence: "Adds 2 channels, changes 1 setting and posts 1 item."
  const doing = [
    plan?.plan.length && preview ? `adds ${addedText(preview.added)}` : null,
    diffs.length ? `changes ${plural(diffs.length, "setting")}` : null,
    posts.length ? `posts ${plural(posts.length, "saved item")}` : null,
  ].filter((x): x is string => Boolean(x));
  const sentence = doing.length
    ? `${doing.slice(0, -1).join(", ")}${doing.length > 1 ? " and " : ""}${doing.at(-1)}`
    : "";
  const minutesLeft = plan
    ? Math.max(1, Math.ceil((plan.createdAt.getTime() + QM_PLAN_TTL_MS - now) / 60_000))
    : 0;

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
    : messages.length === 0
      ? STARTERS
      : messages.at(-1)?.role === "assistant"
        ? (lastBot?.choices ?? [])
        : [];
  const chatHidden = (
    <>
      <input type="hidden" name="guildId" value={guild.id} />
      <input type="hidden" name="page" value="quartermaster" />
      <input type="hidden" name="kind" value="qm_chat" />
      {threadId && !fresh ? <input type="hidden" name="threadId" value={threadId} /> : null}
      {fresh ? <input type="hidden" name="fresh" value="1" /> : null}
    </>
  );

  const { suppliesLeft, poolLeft, packLeft, pool, perPerson, shared, resetsAt } = allowance;
  const num = (n: number) => n.toLocaleString("en-US");
  // Less than a full message's hold left: say where more comes from.
  const low = suppliesLeft < QM_FULL_MESSAGE_SUPPLIES;
  const renews = resetsAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const canMessage = suppliesLeft >= QM_MIN_MESSAGE_SUPPLIES;
  const blocked = thinking ? "Sending…" : canMessage ? null : "Out of supplies";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI assistant</h1>
          <p>
            Tell Garrison what you need in plain words. It drafts the changes as you talk; apply
            them whenever you like what you see, and undo them any time.
          </p>
        </div>
      </div>

      <div className="qm-stack">
        <section className="g-card qm-chat" id="describe" aria-labelledby="qm-chat-title">
          {thinking ? <AutoRefresh every={2000} forMs={90_000} /> : null}
          <div className="qm-chat__head">
            <h2 className="qm-chat__title" id="qm-chat-title">
              Chat
            </h2>
            {messages.length ? (
              <a className="g-btn g-btn--ghost g-btn--sm" href="?fresh=1#describe">
                New conversation
              </a>
            ) : null}
          </div>
          <ol className="qm-chat__log" aria-live="polite" aria-label="Conversation">
            {messages.length === 0 && !queued.length ? (
              <li className="qm-msg qm-msg--bot">
                <span className="qm-msg__mark" aria-hidden="true" />
                <div className="qm-msg__bubble">
                  <p>Hi! What's your community about, and what do you need? I can:</p>
                  <ul className="qm-msg__can">
                    {CAN_DO.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p>Nothing changes until you apply it.</p>
                </div>
              </li>
            ) : null}
            {messages.map((m) => {
              const drafted = m.buildId ? builds.find((b) => b.id === m.buildId) : undefined;
              const replaced =
                drafted?.status === "cancelled" && drafted.error?.startsWith("Replaced by");
              return (
                <li
                  key={m.id}
                  className={`qm-msg ${m.role === "user" ? "qm-msg--me" : "qm-msg--bot"}`}
                >
                  {m.role === "user" ? null : <span className="qm-msg__mark" aria-hidden="true" />}
                  <div className="qm-msg__bubble">
                    <p>{m.text}</p>
                    {m.role === "assistant" && m.supplies != null ? (
                      <span className="qm-msg__cost">
                        {m.supplies ? `Used ${plural(m.supplies, "supply", "supplies")}` : "Free"}
                      </span>
                    ) : null}
                    {drafted ? (
                      drafted === plan ? (
                        <a className="qm-msg__plan" href="#change-list">
                          {plural(qmChangeCount(drafted), "change")} · Show changes
                        </a>
                      ) : (
                        <span className="qm-msg__plan qm-msg__plan--past">
                          {plural(qmChangeCount(drafted), "change")} ·{" "}
                          {replaced ? "Updated later" : OUTCOME[drafted.status]}
                        </span>
                      )
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
            key={`${threadId ?? "new"}:${messages.length}`}
          >
            {chatHidden}
            <label className="sr-only" htmlFor="qm-message">
              Message the AI assistant
            </label>
            <textarea
              className="g-input qm-chat__input"
              id="qm-message"
              name="message"
              rows={2}
              maxLength={REQUEST_MAX}
              required
              placeholder={
                messages.length
                  ? "Answer, or ask for changes"
                  : "We play Valorant and Apex, about 200 members, mostly ranked"
              }
            />
            <button type="submit" className="g-btn g-btn--primary" disabled={blocked !== null}>
              {blocked ?? "Send"}
            </button>
          </form>
          <div className="qm-usage">
            <progress
              className="qm-usage__bar"
              max={pool}
              value={poolLeft}
              aria-label={`${num(poolLeft)} of ${num(pool)} supplies left this month`}
            />
            <p className="qm-usage__text">
              <span>
                <strong>{num(poolLeft)}</strong> of {num(pool)} supplies left this month
                {packLeft ? ` · ${num(packLeft)} in packs` : ""}
                {low ? (
                  <>
                    {" "}
                    · <a href={`/servers/${guild.id}/plan#supplies`}>Buy supplies</a>
                  </>
                ) : null}
              </span>
              <span className="muted">
                About {AI_SUPPLIES_PER_MESSAGE} a message, 1 a change
                {perPerson ? " · shared across your Free servers" : ""}
                {shared ? " · shared by your Agency servers" : ""} · renews {renews}
              </span>
            </p>
          </div>
        </section>

        {plan ? (
          <section className="g-card qm-changes" id="changes" aria-labelledby="qm-changes-title">
            <div className="qm-changes__bar">
              <div className="qm-changes__what">
                <h2 className="qm-changes__title" id="qm-changes-title">
                  {plan.summary}
                </h2>
                <p className="g-help">
                  {sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. ` : ""}
                  Uses {plural(changes, "supply", "supplies")}, held for {minutesLeft} more min.
                  {mine ? "" : ` Only ${plan.requestedByTag} can apply it.`}
                </p>
              </div>
              <div className="qm-changes__actions">
                <form action={requestAction}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="page" value="quartermaster" />
                  <input type="hidden" name="kind" value="qm_cancel" />
                  <input type="hidden" name="id" value={plan.id} />
                  <button type="submit" className="g-btn g-btn--ghost" disabled={applying}>
                    Discard
                  </button>
                </form>
                {mine ? (
                  <form action={requestAction}>
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="page" value="quartermaster" />
                    <input type="hidden" name="kind" value="qm_apply" />
                    <input type="hidden" name="id" value={plan.id} />
                    <button type="submit" className="g-btn g-btn--primary" disabled={applying}>
                      {applying ? "Applying…" : "Apply build"}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            <details className="qm-changes__more">
              <summary className="qm-changes__toggle">
                <span>Show changes</span>
                <span className="muted">{plural(changes, "change")}</span>
                <span className="panel__cue" aria-hidden="true" />
              </summary>
              <div className="qm-changes__body" id="change-list">
                {preview && (plan.plan.length || (!diffs.length && !posts.length)) ? (
                  <ServerPreview name={guild.name} preview={preview} planned />
                ) : null}
                {diffs.length ? (
                  <div className="qm-settings">
                    <h3 className="g-label">Settings</h3>
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
                {posts.length ? (
                  <div className="qm-settings">
                    <h3 className="g-label">Posts</h3>
                    <dl className="qm-settings__list">
                      {posts.map((x) => (
                        <div key={x.what}>
                          <dt>{x.what}</dt>
                          <dd>
                            in <strong>{x.where}</strong>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
                {plan.notes ? (
                  <div className="qm-notes">
                    <h3 className="g-label">Next, Garrison suggests</h3>
                    <p>{plan.notes}</p>
                  </div>
                ) : null}
                <p className="qm-changes__rules">
                  Only adds channels and roles; nothing you have is edited or deleted. New roles get
                  member permissions only. Settings use the same checks as their pages. Undo removes
                  what was made and puts settings back; posts stay.
                </p>
              </div>
            </details>
          </section>
        ) : null}

        <RequestsPanel
          guildId={guild.id}
          kinds={["qm_apply", "qm_cancel", "undo_build", "template_save", "template_apply"]}
          query={query}
        />

        {history.length ? (
          <details className="g-card qm-history">
            <summary className="qm-history__toggle">
              <span>Build history</span>
              <span className="muted">{plural(history.length, "build")}</span>
              <span className="panel__cue" aria-hidden="true" />
            </summary>
            <ol className="qm-history__list">
              {history.map((b) => (
                <li className="qm-history__row" key={b.id}>
                  <div className="qm-history__main">
                    <strong>{b.summary}</strong>
                    <span className="muted">
                      {plural(b.created.length, "change")} · {b.requestedByTag} ·{" "}
                      {formatTime(b.appliedAt ?? b.createdAt)}
                      {b.status === "applied" ? "" : ` · ${OUTCOME[b.status]}`}
                    </span>
                  </div>
                  {b.status === "applied" || b.status === "failed" ? (
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
                          Deletes the channels and roles it made, with any messages posted in them
                          since, and puts its settings back. Posts stay. Nothing else is touched.
                        </p>
                        <button type="submit" className="g-btn g-btn--danger g-btn--sm">
                          Yes, undo it
                        </button>
                      </form>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
        ) : null}

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
            Save this server's roles, categories, channels and their role permissions to your
            account, then copy them into another server you own. Applying only adds what that server
            doesn't already have by name; it never changes or deletes anything.
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
                      From {t.sourceGuildName || "a server"} · {t.roleCount} roles ·{" "}
                      {t.channelCount} channels · {formatTime(t.createdAt)}
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
      </div>
    </>
  );
}
