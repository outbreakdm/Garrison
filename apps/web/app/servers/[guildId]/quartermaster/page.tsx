import {
  aiCreditsUsedToday,
  entitlements,
  getGuildPlan,
  listDashboardActions,
  listQmBuilds,
  listTemplates,
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

export const metadata: Metadata = { title: "Quartermaster" };

/** Plans wait this long to be built, as the bot enforces. */
const PLAN_TTL_MS = 15 * 60_000;

const STATUS: Record<QmBuild["status"], { label: string; tone: string }> = {
  pending: { label: "Not built", tone: "g-badge--intel" },
  applied: { label: "Built", tone: "g-badge--go" },
  cancelled: { label: "Discarded", tone: "" },
  expired: { label: "Expired", tone: "" },
  failed: { label: "Stopped partway", tone: "g-badge--alert" },
  rolled_back: { label: "Undone", tone: "g-badge--caution" },
};

const IDEAS = [
  {
    label: "A game section",
    text: "A Valorant section with ranked and casual LFG channels, two voice rooms, and a Gold+ role that is the only one who can see ranked.",
  },
  {
    label: "A staff area",
    text: "A staff category only Mods can see, with mod-chat, a reports channel and a staff voice room.",
  },
  {
    label: "An events corner",
    text: "An events category with announcements, a sign-ups channel with 30 second slowmode, and an Event Ping role anyone can mention.",
  },
];

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
  const [builds, actions, layout, templates, guildPlan, ownerId, flash, creditsUsed] =
    await Promise.all([
      listQmBuilds(db, guild.id, 25),
      listDashboardActions(db, guild.id, 30),
      getServerLayout(guild.id).catch(() => null),
      listTemplates(db, session.userId),
      getGuildPlan(db, guild.id),
      guildOwnerId(guild.id).catch(() => null),
      readFlash(),
      aiCreditsUsedToday(db, guild.id, "qm"),
    ]);
  const ent = entitlements(guildPlan);
  const creditsLeft = Math.max(0, ent["qm.dailyCredits"] - creditsUsed);
  const isOwner = ownerId === session.userId;
  const now = Date.now();
  const waiting = (b: QmBuild) =>
    b.status === "pending" && now - b.createdAt.getTime() < PLAN_TTL_MS;
  const plan = builds.find(waiting) ?? null;
  const history = builds.filter((b) => b !== plan);
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
  const idea = IDEAS[Number(query.idea) - 1];
  const minutesLeft = plan
    ? Math.max(1, Math.ceil((plan.createdAt.getTime() + PLAN_TTL_MS - now) / 60_000))
    : 0;
  const mine = plan?.requestedById === session.userId;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quartermaster</h1>
          <p>
            Describe the channels and roles you want. See your server with the changes, then build
            it in one click. Every build is versioned and can be undone.
          </p>
        </div>
      </div>

      <section
        className="g-card g-card--hud qm-compose"
        id="describe"
        aria-label="Describe a build"
      >
        <form action={requestAction} className="card-col" key={idea?.label ?? "blank"}>
          <input type="hidden" name="guildId" value={guild.id} />
          <input type="hidden" name="page" value="quartermaster" />
          <input type="hidden" name="kind" value="qm_plan" />
          <label className="qm-compose__label" htmlFor="qm-request">
            What should Quartermaster build?
          </label>
          <textarea
            className="g-input qm-compose__input"
            id="qm-request"
            name="request"
            rows={3}
            maxLength={500}
            required
            placeholder="A WARDOGS section with ranked and casual LFG, a voice room, and a Gold+ role for ranked"
            defaultValue={idea?.text ?? ""}
          />
          <div className="qm-compose__foot">
            <div className="chip-row">
              <span className="g-label">Try</span>
              {IDEAS.map((it, i) => (
                <a className="chip" href={`?idea=${i + 1}#describe`} key={it.label}>
                  {it.label}
                </a>
              ))}
            </div>
            <button
              type="submit"
              className="g-btn g-btn--primary"
              disabled={planning || creditsLeft === 0}
            >
              {planning
                ? "Planning…"
                : creditsLeft === 0
                  ? "No plans left today"
                  : "Draw up a plan"}
            </button>
          </div>
          <ul className="qm-rules">
            <li>Adds only: nothing you have is edited or deleted</li>
            <li>New roles get no permissions</li>
            <li>Nothing is built until you approve the plan</li>
            <li>
              {creditsLeft} of {ent["qm.dailyCredits"]} plans left today (back at midnight UTC), 20
              changes a plan
            </li>
          </ul>
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
            <div>
              <div className="row-between">
                <span className="g-badge g-badge--accent">Plan v{plan.version}</span>
                <span className="mono muted">
                  Waits {minutesLeft} more min · asked by {plan.requestedByTag}
                </span>
              </div>
              <h2>{plan.summary}</h2>
              {/* The request is user text; React escapes it. */}
              <p className="muted">“{plan.prompt}”</p>
            </div>
          </div>
          <ServerPreview name={guild.name} preview={preview} planned />
          <div className="qm-plan__foot">
            <p>
              Building this adds <strong>{addedText(preview.added)}</strong> to {guild.name}.
              {mine ? "" : ` Only ${plan.requestedByTag} can build it; you can discard it.`}
            </p>
            <div className="row-between">
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
        </section>
      ) : (
        <section className="card-col" aria-label="Your server">
          {planning ? (
            <div className="notice notice--ok" role="status">
              Quartermaster is drawing up the plan. The preview appears here by itself, usually
              within 20 seconds.
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

      <section className="card-col" aria-label="Builds">
        <h2 className="block-title">Builds</h2>
        {history.length === 0 ? (
          <div className="g-card muted">No builds yet. Your first plan shows up above.</div>
        ) : null}
        {history.map((b) => {
          // A plan nobody built in time reads as expired, whatever the row still says.
          const st = STATUS[b.status === "pending" ? "expired" : b.status];
          return (
            <div className="g-card card-col" key={b.id}>
              <div className="row-between">
                <h2>
                  <span className="mono muted">v{b.version}</span> {b.summary}
                </h2>
                <span className={`g-badge ${st.tone}`}>{st.label}</span>
              </div>
              <p className="muted">
                “{b.prompt}” · {b.requestedByTag} · {formatTime(b.createdAt)}
              </p>
              <pre className="diff">{planLines(b.plan).join("\n")}</pre>
              {b.error ? <span className="notice">{b.error}</span> : null}
              {b.status === "applied" || b.status === "failed" ? (
                <details className="confirm">
                  <summary className="confirm__toggle g-btn g-btn--ghost">
                    Undo v{b.version}…
                  </summary>
                  <form action={requestAction} className="card-col">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="page" value="quartermaster" />
                    <input type="hidden" name="kind" value="undo_build" />
                    <input type="hidden" name="version" value={b.version} />
                    <p className="g-help">
                      Deletes exactly the {b.created.length} channels and roles this build created,
                      with any messages posted in them since. Nothing else is touched.
                    </p>
                    <button type="submit" className="g-btn g-btn--danger">
                      Yes, undo v{b.version}
                    </button>
                  </form>
                </details>
              ) : null}
            </div>
          );
        })}
      </section>
    </>
  );
}
