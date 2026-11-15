import {
  aiAllowance,
  entitlements,
  getGuildPlan,
  listDashboardActions,
  listQmBuilds,
  listTemplates,
  QM_CHANGES_PER_PLAN,
  QM_PLAN_TTL_MS,
  type QmBuild,
  TEMPLATE_NAME_MAX,
  TEMPLATES_PER_USER,
} from "@garrison/db";
import type { Metadata } from "next";
import { ProTag } from "@/components/cards/CardEditor";
import { formatTime } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import { ServerPreview } from "@/components/ServerPreview";
import { getDb } from "@/lib/db";
import { getServerLayout, guildOwnerId } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { addedText, planLines, previewServer } from "@/lib/qm-preview";
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

const IDEAS = [
  {
    label: "A game section",
    text: "A Valorant section for our players: ranked and casual LFG, strategy, clips, team voice rooms, and rank roles where only Gold+ can see ranked.",
  },
  {
    label: "A WoW guild",
    text: "Set this server up for our WoW raiding guild: announcements, raid sign-ups and strategy, Mythic+ LFG, a raid voice channel, and Tank, Healer and DPS roles.",
  },
  {
    label: "A staff area",
    text: "A staff category only Mods can see, with mod-chat, a reports channel, a mod log and a staff voice room.",
  },
  {
    label: "An events corner",
    text: "An events category with announcements, sign-ups with 30 second slowmode, an events voice stage, and an Event Ping role anyone can mention.",
  },
];

/** Changes a build counts against its day: what it built, or what it plans while it waits. */
function changesOf(b: QmBuild) {
  return b.status === "failed" || b.status === "rolled_back" ? b.created.length : b.plan.length;
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
  const [builds, actions, layout, templates, guildPlan, ownerId, flash, allowance] =
    await Promise.all([
      listQmBuilds(db, guild.id, 25),
      listDashboardActions(db, guild.id, 30),
      getServerLayout(guild.id).catch(() => null),
      listTemplates(db, session.userId),
      getGuildPlan(db, guild.id),
      guildOwnerId(guild.id).catch(() => null),
      readFlash(),
      aiAllowance(db, guild.id, session.userId),
    ]);
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
  const minutesLeft = plan
    ? Math.max(1, Math.ceil((plan.createdAt.getTime() + QM_PLAN_TTL_MS - now) / 60_000))
    : 0;
  const mine = plan?.requestedById === session.userId;

  // Continuing a built plan: ?continue=<version> on a build that was built (or partly).
  const asked = Number(query.continue);
  const cont =
    history.find((b) => b.version === asked && (b.status === "applied" || b.status === "failed")) ??
    null;
  const idea = cont ? undefined : IDEAS[Number(query.idea) - 1];
  const prefill = cont
    ? query.use === "notes" && cont.notes
      ? `Add what you suggested next: ${cont.notes}`.slice(0, REQUEST_MAX)
      : ""
    : (idea?.text ?? "");

  const { changesLeft, changesPerDay, requestsLeft, requestsPerDay, perPerson } = allowance;
  const fullPlans = Math.floor(changesLeft / QM_CHANGES_PER_PLAN);
  const spare = changesLeft % QM_CHANGES_PER_PLAN;
  const blocked = planning
    ? "Planning…"
    : changesLeft === 0
      ? "No changes left today"
      : requestsLeft === 0
        ? "No requests left today"
        : null;
  const cap = Math.min(QM_CHANGES_PER_PLAN, changesLeft);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI builder</h1>
          <p>
            Describe the channels and roles you want. See your server with the changes, then build
            it in one click. Keep going from any version, and undo any build.
          </p>
        </div>
      </div>

      <div className="qm-layout">
        <div className="qm-main">
          <section
            className={`g-card qm-compose${cont ? " qm-compose--continue" : ""}`}
            id="describe"
            aria-label={cont ? `Continue v${cont.version}` : "Describe a build"}
          >
            <form
              action={requestAction}
              className="card-col"
              key={`${cont?.id ?? "new"}:${idea?.label ?? ""}:${String(query.use ?? "")}`}
            >
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="page" value="quartermaster" />
              <input type="hidden" name="kind" value="qm_plan" />
              {cont ? <input type="hidden" name="continues" value={cont.id} /> : null}
              {cont ? (
                <div className="qm-thread">
                  <span className="g-badge g-badge--accent">Continuing v{cont.version}</span>
                  <span className="qm-thread__what">{cont.summary}</span>
                  <a className="qm-thread__clear" href="?#describe">
                    Start a new plan instead
                  </a>
                </div>
              ) : null}
              <label className="qm-compose__label" htmlFor="qm-request">
                {cont ? `What should v${cont.version} get next?` : "What should Garrison build?"}
              </label>
              <textarea
                className="g-input qm-compose__input"
                id="qm-request"
                name="request"
                rows={3}
                maxLength={REQUEST_MAX}
                required
                placeholder={
                  cont
                    ? "A clips channel, a ranked voice room and a Diamond role"
                    : "A Valorant section with ranked and casual LFG, team voice rooms and rank roles"
                }
                defaultValue={prefill}
              />
              <div className="qm-compose__foot">
                <div className="chip-row">
                  {cont ? (
                    cont.notes ? (
                      <a className="chip" href={`?continue=${cont.version}&use=notes#describe`}>
                        Use its suggestions
                      </a>
                    ) : null
                  ) : (
                    <>
                      <span className="g-label">Try</span>
                      {IDEAS.map((it, i) => (
                        <a
                          className="chip"
                          href={`?idea=${i + 1}#describe`}
                          key={it.label}
                          aria-current={idea === it ? "true" : undefined}
                        >
                          {it.label}
                        </a>
                      ))}
                    </>
                  )}
                </div>
                <button type="submit" className="g-btn g-btn--primary" disabled={blocked !== null}>
                  {blocked ?? (cont ? `Plan v${nextVersion}` : "Draw up a plan")}
                </button>
              </div>
              <p className="qm-compose__left">
                {changesLeft > 0
                  ? `Up to ${plural(cap, "change")} in this plan · ${changesLeft} of ${changesPerDay} left today`
                  : `All ${changesPerDay} of today's changes are used. They come back at midnight UTC.`}
              </p>
            </form>
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
              <ServerPreview name={guild.name} preview={preview} planned />
              {plan.notes ? (
                <div className="qm-notes">
                  <h3 className="g-label">Notes from the AI builder</h3>
                  <p>{plan.notes}</p>
                </div>
              ) : null}
              <div className="qm-plan__foot">
                <p>
                  Building this adds <strong>{addedText(preview.added)}</strong> to {guild.name}. It
                  holds {plural(plan.plan.length, "change")} of today's until it's built or expires.
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
                    disabled={building || planning || requestsLeft === 0}
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
                  Garrison is drawing up the plan. The preview appears here by itself, usually
                  within 30 seconds.
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

        <aside className="qm-aside" aria-label="Today's allowance and rules">
          <section className="g-card qm-allow" aria-labelledby="qm-allow-title">
            <h2 className="card-title" id="qm-allow-title">
              Today's changes
            </h2>
            <p className="qm-allow__count">
              <span className="qm-allow__num">{changesLeft}</span>
              <span className="muted">of {changesPerDay} left</span>
            </p>
            <div className={`qm-meter qm-meter--n${changesPerDay / QM_CHANGES_PER_PLAN}`}>
              <progress
                className="xpbar qm-meter__bar"
                max={changesPerDay}
                value={changesLeft}
                aria-label={`${changesLeft} of ${changesPerDay} changes left today`}
              />
            </div>
            <p className="g-help">
              {changesLeft === 0
                ? "Back at midnight UTC."
                : `That's ${plural(fullPlans, "full plan")}${spare ? ` and ${spare} more` : ""}. Back at midnight UTC.`}
            </p>
            <dl className="qm-allow__facts">
              <div>
                <dt>Per plan</dt>
                <dd>Up to {QM_CHANGES_PER_PLAN} changes. A plan uses only what it makes.</dd>
              </div>
              <div>
                <dt>AI requests</dt>
                <dd>
                  {requestsLeft} of {requestsPerDay} left
                  {perPerson ? ", across all your Free servers" : ""}
                </dd>
              </div>
            </dl>
            {perPerson ? (
              <p className="g-help">
                On Free, your changes count across every Free server you use. Pro gives this server
                its own 300 a day.
              </p>
            ) : null}
          </section>

          <section className="g-card qm-rules-card" aria-labelledby="qm-rules-title">
            <h2 className="card-title" id="qm-rules-title">
              How it builds
            </h2>
            <ul className="qm-rules">
              <li>Adds only: nothing you have is edited or deleted</li>
              <li>New roles get no permissions</li>
              <li>Nothing is built until you approve the plan</li>
              <li>Undo removes exactly what a build made</li>
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
                      <pre className="diff">{planLines(b.plan).join("\n")}</pre>
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
