import {
  aiAllowance,
  describeEdits,
  entitlements,
  getGuildPlan,
  latestQmThread,
  listDashboardActions,
  listQmBuilds,
  listQmThread,
  listQmThreads,
  listTemplates,
  QM_MIN_MESSAGE_SUPPLIES,
  QM_MODELS,
  QM_PLAN_TTL_MS,
  QM_SETTINGS_MODULES,
  type QmBuild,
  qmChangeCount,
  qmChargedChanges,
  qmHoldSupplies,
  qmTypicalSupplies,
  readSettings,
  TEMPLATE_NAME_MAX,
  TEMPLATES_PER_USER,
} from "@garrison/db";
import type { Metadata } from "next";
import { WaitingForBot } from "@/components/BotOffline";
import { ProTag } from "@/components/cards/CardEditor";
import { FeaturesPanel } from "@/components/FeaturesPanel";
import { formatTime } from "@/components/format";
import { ModelPicker } from "@/components/ModelPicker";
import { PageTabs, TabPanel } from "@/components/PageTabs";
import { PlanDetails } from "@/components/PlanDetails";
import { ReplyFeedback } from "@/components/ReplyFeedback";
import { REQUEST_ERRORS, RequestsPanel } from "@/components/RequestsPanel";
import { ScrollToEnd } from "@/components/ScrollToEnd";
import { type PreviewEdit, ServerPreview } from "@/components/ServerPreview";
import { HandButton } from "@/components/WorkspaceEdit";
import { WritePreview } from "@/components/WritePreview";
import { cleanPrompt } from "@/lib/build-prompt";
import { getDb } from "@/lib/db";
import { getServerLayout, guildOwnerId } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import {
  addedText,
  afterRows,
  orderLines,
  postPreviews,
  previewServer,
  settingDiffs,
} from "@/lib/qm-preview";
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

/** The assistant's tabs: the conversation and its plan, then saved server layouts. */
const AI_TABS = ["chat", "history", "templates"] as const;
/** Requests the Your server panel reports on: building, discarding and changing the draft. */
const DRAFT_KINDS = new Set(["qm_apply", "qm_cancel", "qm_remove", "qm_edit"]);
/** How long the panel shows how the last of those went. */
const OUTCOME_MS = 2 * 60_000;

export default async function QuartermasterPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const { guild, session, role } = await requireGuildAccess(guildId);
  const db = await getDb();
  const fresh = query.fresh === "1";
  // A past conversation reopened from the list, or the latest one.
  const asked =
    typeof query.thread === "string" && /^[0-9a-f-]{36}$/.test(query.thread) ? query.thread : null;
  const [
    builds,
    actions,
    layout,
    templates,
    guildPlan,
    ownerId,
    flash,
    allowance,
    latest,
    threads,
  ] = await Promise.all([
    listQmBuilds(db, guild.id, 25),
    listDashboardActions(db, guild.id, 30),
    getServerLayout(guild.id).catch(() => null),
    listTemplates(db, session.userId),
    getGuildPlan(db, guild.id),
    guildOwnerId(guild.id).catch(() => null),
    readFlash(),
    aiAllowance(db, guild.id, session.userId),
    fresh || asked ? null : latestQmThread(db, guild.id, session.userId),
    listQmThreads(db, guild.id, session.userId, 8),
  ]);
  const threadId = fresh ? null : (asked ?? latest);
  const [messages, featureValues] = await Promise.all([
    threadId ? listQmThread(db, guild.id, session.userId, threadId) : [],
    Promise.all(
      QM_SETTINGS_MODULES.map(
        async (m) => [m, await readSettings(db, guild.id, m).catch(() => null)] as const,
      ),
    ).then((rows) => Object.fromEntries(rows)),
  ]);
  // The Features tab opens on its own after a save there.
  const tab = query.tab === "modules" ? "modules" : "channels";
  // "Build me a…" from the landing page lands here written in, for you to send.
  const prefill = cleanPrompt(query.prompt).slice(0, REQUEST_MAX);
  const featureChannels = {
    text: layout
      ? [...layout.loose, ...layout.categories.flatMap((c) => c.channels)]
          .filter((c) => c.kind === "text")
          .map((c) => ({ id: c.id, name: c.name }))
      : [],
    categories: layout ? layout.categories.map((c) => ({ id: c.id, name: c.name })) : [],
  };
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
  const preview = layout
    ? previewServer(layout, plan?.plan ?? [], guild.id, plan?.orders ?? [], plan?.edits ?? [])
    : null;
  // The Your server panel: what you asked of the draft, and how the last request went.
  const draftRequests = actions.filter(
    (a) => DRAFT_KINDS.has(a.kind) && a.requestedById === session.userId,
  );
  const saving = draftRequests.some(
    (a) => a.kind === "qm_edit" && (a.status === "pending" || a.status === "running"),
  );
  const lastDraftRequest = draftRequests[0];
  // A failure says why; a hand change that worked shows in the tree, so it needs no notice.
  const outcome =
    lastDraftRequest &&
    now - lastDraftRequest.createdAt.getTime() < OUTCOME_MS &&
    (lastDraftRequest.status === "failed" ||
      (lastDraftRequest.status === "done" && lastDraftRequest.kind !== "qm_edit"))
      ? lastDraftRequest
      : null;
  const requestError = typeof query.error === "string" ? REQUEST_ERRORS[query.error] : undefined;
  // Changes Discord overtook while the draft waited: the item was renamed or deleted there.
  // Apply waits until each is kept (made against the name it has now) or dropped.
  const liveName = new Map<string, string>(
    layout
      ? [
          ...[...layout.loose, ...layout.categories.flatMap((c) => c.channels)].map(
            (c) => [c.id, c.name] as [string, string],
          ),
          ...layout.categories.map((c) => [c.id, c.name] as [string, string]),
          ...layout.roles.map((r) => [r.id, r.name] as [string, string]),
        ]
      : [],
  );
  const conflicts = layout
    ? (plan?.edits ?? []).flatMap((e): { id: string; text: string; keep: string | null }[] => {
        const now = liveName.get(e.id);
        if (now === undefined)
          return [{ id: e.id, text: `${e.was} isn't in the server anymore.`, keep: null }];
        if (now === e.was) return [];
        return [
          {
            id: e.id,
            text: `${e.was} was renamed to ${now} in Discord since this was drafted.`,
            keep: e.name ? e.name : now,
          },
        ];
      })
    : [];
  // Hand changes: managers, on their own draft (or none yet), while nothing is being built.
  const canEdit = role === "manager" && (!plan || mine) && !applying && Boolean(layout);
  const edit: PreviewEdit | undefined =
    canEdit && layout
      ? {
          guildId: guild.id,
          version: `${plan?.id ?? "none"}:${saving}`,
          locked: Object.fromEntries(
            layout.roles.flatMap((r) =>
              r.managed
                ? [[r.id, "Belongs to an app, so only Discord changes it."]]
                : isDangerousRole(r.permissions ?? "0")
                  ? [[r.id, "Has staff powers: change it in Server Settings → Roles."]]
                  : [],
            ),
          ),
        }
      : undefined;
  // Taking one item out of the draft: the bot stores the rest as the next version.
  const removeForm = (what: Record<string, string>, label = "Remove from plan") =>
    plan && mine ? (
      <form action={requestAction} className="qm-remove">
        <input type="hidden" name="guildId" value={guild.id} />
        <input type="hidden" name="page" value="quartermaster" />
        <input type="hidden" name="kind" value="qm_remove" />
        <input type="hidden" name="id" value={plan.id} />
        {Object.entries(what).map(([k, v]) => (
          <input type="hidden" name={k} value={v} key={k} />
        ))}
        <button
          type="submit"
          className="g-btn g-btn--ghost g-btn--sm qm-remove__btn"
          disabled={applying}
        >
          {label}
        </button>
      </form>
    ) : null;
  const diffs = plan ? settingDiffs(layout, plan.plan, plan.settings ?? []) : [];
  const posts = plan ? postPreviews(layout, plan.plan, plan.posts ?? []) : [];
  const writes = plan?.writes ?? [];
  // Mentions in written text, as names (they never ping).
  const mentionNames = {
    roles: new Map((layout?.roles ?? []).map((r) => [r.id, r.name] as [string, string])),
    channels: new Map(
      [...(layout?.loose ?? []), ...(layout?.categories ?? []).flatMap((c) => c.channels)].map(
        (c) => [c.id, c.name] as [string, string],
      ),
    ),
  };
  const orders = plan ? orderLines(plan.orders ?? [], plan.plan, layout) : [];
  // Changes to what exists, and deletions, as the bot describes them ("~ #general: renamed …").
  const editNames = new Map<string, string>([
    ...(plan?.plan ?? []).map((o) => [o.ref, o.name] as [string, string]),
    ...(layout?.categories ?? []).map((c) => [c.id, c.name] as [string, string]),
    ...(layout?.roles ?? []).map((r) => [r.id, r.name] as [string, string]),
  ]);
  const edits = plan
    ? describeEdits(plan.edits ?? [], editNames).map((line) => {
        const gone = line.startsWith("−");
        const body = line.slice(2);
        const cut = gone ? body.indexOf(" (") : body.indexOf(": ");
        return {
          gone,
          what: cut > 0 ? body.slice(0, cut) : body,
          how: cut > 0 ? body.slice(cut + (gone ? 2 : 2)).replace(/\)$/, "") : "",
        };
      })
    : [];
  const deleting = edits.filter((e) => e.gone).length;
  const changes = plan ? qmChangeCount(plan) : 0;
  // What the draft costs: hand changes are free.
  const charged = plan ? qmChargedChanges(plan) : 0;
  const built = plan?.created.length ?? 0;
  // What applying does, in one sentence: "Adds 2 channels, changes 1 setting and posts 1 item."
  const doing = [
    plan?.plan.length && preview ? `adds ${addedText(preview.added)}` : null,
    diffs.length ? `changes ${plural(diffs.length, "setting")}` : null,
    posts.length ? `posts ${plural(posts.length, "saved item")}` : null,
    writes.length ? `writes ${plural(writes.length, "text", "texts")}` : null,
    orders.length ? `puts ${plural(orders.length, "list")} in a new order` : null,
    edits.length - deleting ? `changes ${plural(edits.length - deleting, "existing item")}` : null,
    deleting ? `deletes ${plural(deleting, "item")}` : null,
  ].filter((x): x is string => Boolean(x));
  const sentence = doing.length
    ? `${doing.slice(0, -1).join(", ")}${doing.length > 1 ? " and " : ""}${doing.at(-1)}`
    : "";
  // The server as it would be: what the plan panel's head counts.
  const counts = preview
    ? {
        channels:
          preview.loose.length +
          afterRows(preview.categories).reduce((n, c) => n + afterRows(c.channels).length, 0),
        roles: afterRows(preview.roles).length,
        categories: afterRows(preview.categories).length,
      }
    : null;
  const extras =
    diffs.length +
    posts.length +
    writes.length +
    orders.length +
    edits.length +
    (plan?.notes ? 1 : 0);
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
  // A reply that looks at settings first can take a minute or two; say so after one.
  const slow = myChat.some((a) => now - a.createdAt.getTime() > 60_000);
  const lastBot = [...messages].reverse().find((m) => m.role === "assistant");
  // What the assistant is doing while it replies, as the bot writes it on the request.
  const step = myChat.find((a) => a.status === "running")?.message ?? null;
  // Fast or Smart: the conversation keeps the model it last used.
  const smartAllowed = allowance.tier !== "free";
  const isSmart = (model: string | null) => Boolean(model?.startsWith("claude-sonnet"));
  const initialModel = smartAllowed && isSmart(lastBot?.model ?? null) ? "smart" : "fast";
  const prices = {
    fast: {
      typical: qmTypicalSupplies(QM_MODELS.fast.id),
      hold: qmHoldSupplies(QM_MODELS.fast.id, 3),
    },
    smart: {
      typical: qmTypicalSupplies(QM_MODELS.smart.id),
      hold: qmHoldSupplies(QM_MODELS.smart.id, 3),
    },
  };
  const pastThreads = threads.filter((t) => t.threadId !== threadId);
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
          <p>Say what you need in plain words; Garrison drafts it, and you apply or undo it.</p>
        </div>
      </div>

      <PageTabs
        label="AI assistant"
        tabs={[
          { id: "chat", label: "Chat" },
          { id: "history", label: "History", count: history.length },
          { id: "templates", label: "Server templates", count: templates.length },
        ]}
      />
      <TabPanel id="chat" tabs={AI_TABS}>
        <div className="qm-stack">
          <div className="qm-work">
            <section className="g-card qm-chat" id="describe" aria-labelledby="qm-chat-title">
              <div className="qm-chat__head">
                <h2 className="qm-chat__title" id="qm-chat-title">
                  Chat
                </h2>
                <span className="qm-chat__head-do">
                  {pastThreads.length ? (
                    <details className="qm-threads">
                      <summary className="g-btn g-btn--ghost g-btn--sm qm-threads__toggle">
                        Past conversations
                      </summary>
                      <ul className="qm-threads__list">
                        {pastThreads.map((t) => (
                          <li key={t.threadId}>
                            <a className="qm-threads__link" href={`?thread=${t.threadId}#describe`}>
                              <span className="qm-threads__first">{t.first || "Conversation"}</span>
                              <span className="muted">
                                {formatTime(t.lastAt)}
                                {t.drafts ? ` · ${plural(t.drafts, "draft")}` : ""}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {messages.length ? (
                    <a className="g-btn g-btn--ghost g-btn--sm" href="?fresh=1#describe">
                      New conversation
                    </a>
                  ) : null}
                </span>
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
                      {m.role === "user" ? null : (
                        <span className="qm-msg__mark" aria-hidden="true" />
                      )}
                      <div className="qm-msg__bubble">
                        <p className="qm-msg__text">{m.text}</p>
                        {m.role === "assistant" && m.supplies != null ? (
                          <span className="qm-msg__cost">
                            {isSmart(m.model) ? "Smart · " : ""}
                            {m.supplies
                              ? `Used ${plural(m.supplies, "supply", "supplies")}`
                              : "Free"}
                          </span>
                        ) : null}
                        {m.role === "assistant" ? (
                          <ReplyFeedback
                            guildId={guild.id}
                            messageId={m.id}
                            initial={m.feedback === 1 || m.feedback === -1 ? m.feedback : null}
                          />
                        ) : null}
                        {drafted ? (
                          drafted === plan ? (
                            <a className="qm-msg__plan" href="#qm-plan">
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
                      {step ? <span className="qm-msg__step">{step}</span> : null}
                      {slow ? (
                        <span className="qm-msg__cost">
                          Still working on it. Replies that look at your settings take longer.
                        </span>
                      ) : null}
                    </div>
                  </li>
                ) : null}
              </ol>
              {/* Until the 10-minute request expiry, so a slow reply still shows up by itself. */}
              {thinking ? <WaitingForBot every={2000} forMs={10 * 60_000} /> : null}
              <ScrollToEnd marker={`${messages.length}:${queued.length}:${thinking}`} />
              {choices.length ? (
                <form action={requestAction} className="qm-chat__choices">
                  {chatHidden}
                  <input type="hidden" name="model" value={initialModel} data-model-sync />
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
                  defaultValue={prefill || undefined}
                  placeholder={
                    messages.length
                      ? "Answer, or ask for changes"
                      : "We play Valorant and Apex, about 200 members, mostly ranked"
                  }
                />
                <button type="submit" className="g-btn g-btn--primary" disabled={blocked !== null}>
                  {blocked ?? "Send"}
                </button>
                <ModelPicker
                  initial={initialModel}
                  smartAllowed={smartAllowed}
                  fast={prices.fast}
                  smart={prices.smart}
                  suppliesLeft={suppliesLeft}
                  upgradeHref={`/servers/${guild.id}/plan`}
                />
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
                    1 a change made by the AI
                    {perPerson ? " · shared across your Free servers" : ""}
                    {shared ? " · shared by your Agency servers" : ""} · renews {renews}
                  </span>
                </p>
              </div>
            </section>

            <aside className="g-card qm-plan" id="qm-plan" aria-labelledby="qm-plan-title">
              <header className="qm-plan__head">
                <span className="panel__icon qm-plan__icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M3 2.5h7l3 3v8H3z" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M5.5 8h5M5.5 10.5h3.5" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="qm-plan__heading">
                  <h2 className="qm-plan__title" id="qm-plan-title">
                    Your server
                  </h2>
                  {counts ? (
                    <span className="qm-plan__counts">
                      <strong>{counts.channels}</strong> channels · <strong>{counts.roles}</strong>{" "}
                      roles · <strong>{counts.categories}</strong> categories
                    </span>
                  ) : null}
                </div>
                {saving ? (
                  <span className="qm-plan__saving" role="status">
                    Saving…
                  </span>
                ) : null}
                {plan && mine ? (
                  <div className="qm-plan__actions">
                    {applying ? null : (
                      <form action={requestAction}>
                        <input type="hidden" name="guildId" value={guild.id} />
                        <input type="hidden" name="page" value="quartermaster" />
                        <input type="hidden" name="kind" value="qm_cancel" />
                        <input type="hidden" name="id" value={plan.id} />
                        <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                          Discard
                        </button>
                      </form>
                    )}
                    <form action={requestAction}>
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="quartermaster" />
                      <input type="hidden" name="kind" value="qm_apply" />
                      <input type="hidden" name="id" value={plan.id} />
                      <button
                        type="submit"
                        className="g-btn g-btn--primary"
                        disabled={applying || saving || conflicts.length > 0}
                        title={
                          saving
                            ? "Wait for your last changes to save"
                            : conflicts.length
                              ? "Keep or drop the changes Discord overtook first"
                              : undefined
                        }
                      >
                        {applying
                          ? `Building ${Math.min(built, changes)} of ${changes}…`
                          : `Apply ${plural(changes, "change")}`}
                      </button>
                    </form>
                  </div>
                ) : null}
              </header>
              {saving || applying ? <WaitingForBot every={1500} forMs={5 * 60_000} /> : null}
              {requestError ? (
                <div className="notice qm-plan__status" role="alert">
                  {requestError}
                </div>
              ) : outcome ? (
                <div
                  className={`notice qm-plan__status${outcome.status === "done" ? " notice--ok" : ""}`}
                  role={outcome.status === "done" ? "status" : "alert"}
                >
                  {outcome.message ?? (outcome.status === "done" ? "Done." : "That didn't work.")}
                </div>
              ) : null}
              {plan && mine && conflicts.length ? (
                <div className="notice qm-plan__status qm-conflicts" role="alert">
                  <p className="qm-conflicts__lead">
                    Some of this draft changed in Discord while it waited:
                  </p>
                  <ul className="qm-conflicts__list">
                    {conflicts.map((c) => (
                      <li className="qm-conflicts__row" key={c.id}>
                        <span>{c.text}</span>
                        <span className="qm-conflicts__do">
                          {c.keep ? (
                            <HandButton
                              guildId={guild.id}
                              change={{ change: "rename", target: c.id, name: c.keep }}
                            >
                              Keep
                            </HandButton>
                          ) : null}
                          <form action={requestAction}>
                            <input type="hidden" name="guildId" value={guild.id} />
                            <input type="hidden" name="page" value="quartermaster" />
                            <input type="hidden" name="kind" value="qm_remove" />
                            <input type="hidden" name="id" value={plan.id} />
                            <input type="hidden" name="edit" value={c.id} />
                            <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                              Drop
                            </button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan ? (
                <div className="qm-plan__summary">
                  <p className="qm-plan__what">{plan.summary}</p>
                  <p className="g-help">
                    {sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. ` : ""}
                    Uses {plural(charged, "supply", "supplies")}
                    {charged < changes ? ` (${plural(changes - charged, "hand change")} free)` : ""}
                    , held for {minutesLeft} more min.
                    {mine ? "" : ` Only ${plan.requestedByTag} can apply it.`}
                  </p>
                </div>
              ) : (
                <p className="qm-plan__empty">
                  {canEdit
                    ? "Nothing waiting. Rename or drag anything below, or ask in the chat: every change shows up here, marked, before anything happens in Discord."
                    : "Nothing waiting. As Garrison drafts changes in the chat, they show up here, marked, before anything happens in Discord."}
                </p>
              )}
              <fieldset className="qm-tabs">
                <legend className="sr-only">Show</legend>
                <label>
                  <input
                    type="radio"
                    name="qm-tab"
                    value="channels"
                    defaultChecked={tab === "channels"}
                  />
                  <span className="qm-tabs__label">Channels</span>
                </label>
                <label>
                  <input type="radio" name="qm-tab" value="roles" />
                  <span className="qm-tabs__label">Roles</span>
                </label>
                {extras ? (
                  <label>
                    <input type="radio" name="qm-tab" value="changes" />
                    <span className="qm-tabs__label">
                      Settings <span className="qm-tabs__count">{extras}</span>
                    </span>
                  </label>
                ) : null}
                <label>
                  <input
                    type="radio"
                    name="qm-tab"
                    value="modules"
                    defaultChecked={tab === "modules"}
                  />
                  <span className="qm-tabs__label qm-tabs__label--feat">Features</span>
                </label>
              </fieldset>
              <div className="qm-plan__body" id="change-list">
                {tab === "modules" && flash ? (
                  <div
                    className={`notice qm-plan__notice${flash.ok ? " notice--ok" : ""}`}
                    role={flash.ok ? "status" : "alert"}
                  >
                    {flash.ok ?? flash.error}
                  </div>
                ) : null}
                <FeaturesPanel
                  guildId={guild.id}
                  values={featureValues}
                  channels={featureChannels}
                />
                {preview ? (
                  <ServerPreview
                    name={guild.name}
                    preview={preview}
                    planned={Boolean(plan)}
                    linked
                    edit={edit}
                  />
                ) : (
                  <p className="qm-plan__empty">
                    Garrison can't read this server's channels right now.
                  </p>
                )}
                {extras ? (
                  <div className="qm-plan__changes">
                    {diffs.length ? (
                      <div className="qm-settings">
                        <h3 className="g-label">Settings</h3>
                        <dl className="qm-settings__list">
                          {diffs.map((d) => (
                            <div key={d.key}>
                              <dt>{d.label}</dt>
                              <dd>
                                <span className="qm-settings__from">{d.from}</span>
                                <span aria-hidden="true"> → </span>
                                <span className="sr-only"> becomes </span>
                                <strong>{d.to}</strong>
                              </dd>
                              {removeForm({ setting: d.key }, "Remove")}
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                    {edits.length ? (
                      <div className="qm-settings">
                        <h3 className="g-label">Changes to what exists</h3>
                        <dl className="qm-settings__list">
                          {edits.map((e) => (
                            <div key={`${e.gone ? "-" : "~"}${e.what}`}>
                              <dt>{e.what}</dt>
                              <dd>
                                {e.gone ? (
                                  <span className="notice" role="alert">
                                    {e.how || "Deleted"}
                                  </span>
                                ) : (
                                  e.how
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="g-help">
                          {deleting
                            ? `Undo puts every change back, but not ${deleting === 1 ? "the deletion" : `the ${deleting} deletions`}: what's deleted is gone for good.`
                            : "Undo puts every change back as it was."}
                        </p>
                      </div>
                    ) : null}
                    {orders.length ? (
                      <div className="qm-settings">
                        <h3 className="g-label">New order</h3>
                        <dl className="qm-settings__list">
                          {orders.map((o, i) => (
                            <div key={o.key}>
                              <dt>{o.where}</dt>
                              <dd>
                                <ol className="qm-order">
                                  {o.names.map((n, j) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat; the place is the identity
                                    <li key={j}>{n}</li>
                                  ))}
                                </ol>
                              </dd>
                              {removeForm({ order: String(i) }, "Remove")}
                            </div>
                          ))}
                        </dl>
                        <p className="g-help">
                          Top to bottom. Only what's listed moves, among the places it holds now.
                        </p>
                      </div>
                    ) : null}
                    {writes.length ? (
                      <WritePreview
                        writes={writes}
                        names={mentionNames}
                        remove={(i) => removeForm({ write: String(i) }, "Remove")}
                      />
                    ) : null}
                    {posts.length ? (
                      <div className="qm-settings">
                        <h3 className="g-label">Posts</h3>
                        <dl className="qm-settings__list">
                          {posts.map((x, i) => (
                            <div key={x.what}>
                              <dt>{x.what}</dt>
                              <dd>
                                in <strong>{x.where}</strong>
                              </dd>
                              {removeForm({ post: String(i) }, "Remove")}
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                    {plan?.notes ? (
                      <div className="qm-notes">
                        <h3 className="g-label">Next, Garrison suggests</h3>
                        <p>{plan.notes}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {preview ? (
                  <PlanDetails preview={preview} remove={(ref) => removeForm({ ref })} />
                ) : null}
              </div>
              {plan ? (
                <footer className="qm-plan__foot">
                  <span className="qm-plan__delta">
                    {preview ? (
                      <span className="qm-plan__add">
                        +{preview.added.categories + preview.added.channels + preview.added.roles}{" "}
                        new
                      </span>
                    ) : null}
                    {diffs.length ? (
                      <span className="qm-plan__edit">~{diffs.length} settings</span>
                    ) : null}
                    {posts.length ? <span>{plural(posts.length, "post")}</span> : null}
                    {orders.length ? (
                      <span className="qm-plan__edit">
                        ↕{preview?.moved ?? orders.length} moved
                      </span>
                    ) : null}
                    {edits.length - deleting ? (
                      <span className="qm-plan__edit">~{edits.length - deleting} changed</span>
                    ) : null}
                    {deleting ? <span className="qm-plan__gone">−{deleting} deleted</span> : null}
                  </span>
                </footer>
              ) : null}
              {plan ? (
                <p className="qm-plan__rules">
                  Nothing happens in Discord until you apply. Changes made by hand cost no supplies.
                  Undo removes what was made and puts names, settings, access and the order back;
                  posts stay, and deletions can't be undone. Staff and bot roles never change.
                </p>
              ) : null}
            </aside>
          </div>
        </div>
      </TabPanel>
      <TabPanel id="history" tabs={AI_TABS}>
        <div className="qm-stack">
          <RequestsPanel
            guildId={guild.id}
            kinds={[
              "qm_apply",
              "qm_cancel",
              "qm_remove",
              "undo_build",
              "template_save",
              "template_apply",
            ]}
            query={query}
          />

          {history.length ? (
            <details className="g-card qm-history" open>
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
                            since, and puts its settings and any order it changed back. Posts stay.
                            Nothing else is touched.
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
          {history.length ? null : (
            <p className="g-help">Nothing built yet. Builds you apply show here, each with Undo.</p>
          )}
        </div>
      </TabPanel>
      <TabPanel id="templates" tabs={AI_TABS}>
        <section className="card-col" id="templates" aria-labelledby="templates-title">
          <div className="list-head">
            <h2 className="list-head__title" id="templates-title">
              Your templates
            </h2>
            <span className="list-head__end">
              <span className="list-head__count">
                {templates.length} of {TEMPLATES_PER_USER} saved
              </span>
              <ProTag on={ent["qm.templates"]} />
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
          <ul className="tpl-grid">
            {templates.map((t) => (
              <li key={t.id} className="g-card tpl-card">
                <span className="tpl-card__mark" aria-hidden="true" />
                <span className="tpl-card__name">{t.name}</span>
                <span className="tpl-card__from">
                  From {t.sourceGuildName || "a server"} · {formatTime(t.createdAt)}
                </span>
                <span className="tpl-card__counts">
                  <span className="g-badge">{t.roleCount} roles</span>
                  <span className="g-badge">{t.channelCount} channels</span>
                  {t.sourceGuildId === guild.id ? (
                    <span className="g-badge g-badge--go">This server</span>
                  ) : null}
                </span>
                <span className="tpl-card__actions">
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
            <li className="tpl-card tpl-card--new">
              {ent["qm.templates"] ? (
                <form action={requestAction} className="card-col">
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="page" value="quartermaster" />
                  <input type="hidden" name="kind" value="template_save" />
                  <span className="tpl-card__name">Save this server</span>
                  <span className="tpl-card__from">
                    Its roles, categories, channels and permissions, as they are now.
                  </span>
                  <input
                    className="g-input"
                    name="name"
                    maxLength={TEMPLATE_NAME_MAX}
                    placeholder={guild.name}
                    aria-label="Template name"
                  />
                  <button
                    type="submit"
                    className="g-btn g-btn--primary g-btn--sm"
                    disabled={templates.length >= TEMPLATES_PER_USER}
                  >
                    {templates.length >= TEMPLATES_PER_USER
                      ? `${TEMPLATES_PER_USER} of ${TEMPLATES_PER_USER} saved`
                      : "Save as a template"}
                  </button>
                </form>
              ) : (
                <>
                  <span className="tpl-card__name">Save this server</span>
                  <span className="tpl-card__from">
                    On Pro: save a server's layout and copy it into another server you own.
                  </span>
                  <a
                    className="g-btn g-btn--secondary g-btn--sm"
                    href={`/servers/${guild.id}/plan#plans`}
                    data-pro="Server templates: save a server's layout and copy it into another server you own."
                  >
                    See what Pro adds
                  </a>
                </>
              )}
            </li>
          </ul>
          {templates.length && !isOwner ? (
            <p className="g-help">Only the server owner can apply a template here.</p>
          ) : null}
        </section>
      </TabPanel>
    </>
  );
}
