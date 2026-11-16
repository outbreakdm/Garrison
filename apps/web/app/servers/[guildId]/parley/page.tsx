import {
  cleanQuery,
  entitlements,
  getGuildPlan,
  getTicketConfig,
  isPanelPaused,
  listTicketPanelPosts,
  listTickets,
  PANEL_HARD_MAX,
  panelLimit,
  TICKET_LIMITS,
  TICKET_PANEL_PRESETS,
  type TicketView,
  TOPIC_HARD_MAX,
  ticketQueueCounts,
  ticketStats,
  waitingOn,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoSaveCard } from "@/components/AutoSave";
import { ProTag } from "@/components/cards/CardEditor";
import { Segmented } from "@/components/choices";
import { ListHead } from "@/components/ListHead";
import { PlansLink, ProUpsell } from "@/components/ProUpsell";
import { RequestsPanel } from "@/components/RequestsPanel";
import { CheckList, FormPanel, Switch } from "@/components/settings";
import { getDb } from "@/lib/db";
import { getServerLayout, listGuildEmojis, listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { undoChange } from "../settings/actions";
import { addPanel, removePanel, savePanel, saveTicketOptions } from "./actions";
import { TicketPanelEditor } from "./TicketPanelEditor";
import { ago } from "./when";

const TWO_DAYS_MS = 2 * 86_400_000;

export const metadata: Metadata = { title: "Tickets" };

const VIEWS: { key: TicketView; label: string }[] = [
  { key: "staff", label: "Needs reply" },
  { key: "member", label: "Replied" },
  { key: "unclaimed", label: "Unclaimed" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];
const isView = (v: unknown): v is TicketView => VIEWS.some((x) => x.key === v);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function minutes(n: number | null) {
  if (n === null) return "—";
  if (n < 60) return `${Math.max(1, Math.round(n))} min`;
  if (n < 48 * 60) return `${(n / 60).toFixed(n < 600 ? 1 : 0)} h`;
  return `${Math.round(n / 1440)} d`;
}

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const view: TicketView = isView(query.view) ? query.view : "staff";
  const q = cleanQuery(query.q);
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [config, plan, posts, counts, list, channels, roles, layout, serverEmoji] =
    await Promise.all([
      getTicketConfig(db, guild.id),
      getGuildPlan(db, guild.id),
      listTicketPanelPosts(db, guild.id),
      ticketQueueCounts(db, guild.id),
      listTickets(db, guild.id, { view: q ? "all" : view, q, limit: 50 }),
      listTextChannels(guild.id).catch(() => []),
      listGuildRoles(guild.id).catch(() => []),
      getServerLayout(guild.id).catch(() => null),
      listGuildEmojis(guild.id).catch(() => []),
    ]);
  const ent = entitlements(plan);
  const stats = ent["tickets.stats"] ? await ticketStats(db, guild.id, since) : null;
  const limit = panelLimit(ent);
  const full = config.panels.length >= limit;
  const pausedPanels = Math.max(0, config.panels.length - limit);
  const editing = typeof query.edit === "string" ? query.edit : null;
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const categories = layout?.categories.map(({ id, name }) => ({ id, name })) ?? [];
  const staffRoles = roles.filter((r) => !r.managed);
  const base = `/servers/${guild.id}/parley`;
  const countFor: Partial<Record<TicketView, number>> = {
    staff: counts.staff,
    member: counts.member,
    unclaimed: counts.unclaimed,
  };
  const flash = await readFlash();
  const noStaff = config.staffRoleIds.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tickets</h1>
          <p>
            A panel in Discord opens a private channel for a member and your staff. Garrison keeps
            the transcript, and the queue here shows who's waiting on whom.
          </p>
        </div>
      </div>

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
      {pausedPanels ? (
        <div className="notice notice--pro" role="status">
          <span>
            This server has {config.panels.length} panels and its plan runs {limit}, so the last{" "}
            {plural(pausedPanels, "panel is", "panels are")} paused: still saved, buttons resting. A
            paid plan brings {pausedPanels === 1 ? "it" : "them"} back.{" "}
            <PlansLink guildId={guild.id} className="" />
          </span>
        </div>
      ) : null}

      <RequestsPanel
        guildId={guild.id}
        kinds={["post_ticket_panel", "ticket_action"]}
        query={query}
      />

      <section className="queue-stats" aria-label="Tickets">
        <div className="g-card queue-stat">
          <span className="g-label">Open now</span>
          <span className="g-stat">{counts.open}</span>
        </div>
        <div className="g-card queue-stat">
          <span className="g-label">Need a reply</span>
          <span className={`g-stat${counts.staff ? " tone-caution" : ""}`}>{counts.staff}</span>
        </div>
        <div className="g-card queue-stat">
          <span className="g-label">Unclaimed</span>
          <span className="g-stat">{counts.unclaimed}</span>
        </div>
        {stats ? (
          <>
            <div className="g-card queue-stat">
              <span className="g-label">Opened, 30 days</span>
              <span className="g-stat">{stats.opened}</span>
            </div>
            <div className="g-card queue-stat">
              <span className="g-label">Closed, 30 days</span>
              <span className="g-stat">{stats.closed}</span>
            </div>
            <div className="g-card queue-stat">
              <span className="g-label">Median first reply</span>
              <span className="g-stat">{minutes(stats.medianFirstReplyMinutes)}</span>
            </div>
          </>
        ) : null}
      </section>

      <div className="page-split">
        <div className="page-split__main">
          {q ? null : (
            <ListHead
              filters={VIEWS.map((v) => ({
                key: v.key,
                label: v.label,
                n: countFor[v.key],
                href: `${base}?view=${v.key}`,
              }))}
              current={view}
            />
          )}
          <section className="g-card queue" aria-labelledby="queue-title">
            <div className="queue__head">
              <h2 className="card-title" id="queue-title">
                {q ? "Search" : (VIEWS.find((v) => v.key === view)?.label ?? "Queue")}
                <span className="count">{list.length}</span>
              </h2>
              <search>
                <form className="queue__search" method="get">
                  <label className="sr-only" htmlFor="ticket-q">
                    Search tickets
                  </label>
                  <input
                    className="g-input g-input--sm"
                    id="ticket-q"
                    name="q"
                    type="search"
                    defaultValue={q ?? ""}
                    placeholder="#42, member or words"
                    maxLength={64}
                  />
                  <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                    Search
                  </button>
                </form>
              </search>
            </div>
            {q ? (
              <p className="g-help">
                {plural(list.length, "ticket")} matching “{q}”.{" "}
                <Link href={base}>Back to the queue</Link>
              </p>
            ) : null}
            {list.length ? (
              <ul className="queue__list">
                {list.map((t) => {
                  const waits = waitingOn(t);
                  const last = t.closedAt ?? t.lastMessageAt ?? t.openedAt;
                  return (
                    <li key={t.id}>
                      <Link className="ticket-row" href={`${base}/${t.number}`}>
                        <span className="ticket-row__num mono">#{t.number}</span>
                        <span className="ticket-row__main">
                          <span className="ticket-row__topic">{t.topicLabel}</span>
                          <span className="ticket-row__who">
                            {t.openerName}
                            {t.viaDm ? " · by DM" : ""}
                            {t.claimedName ? ` · claimed by ${t.claimedName}` : " · unclaimed"}
                          </span>
                        </span>
                        <span
                          className={`g-badge ${waits === "staff" ? "g-badge--caution" : waits === "member" ? "g-badge--intel" : "g-badge--off"}`}
                        >
                          {waits === "staff"
                            ? "Needs reply"
                            : waits === "member"
                              ? "Replied"
                              : "Closed"}
                        </span>
                        <span className="ticket-row__when mono">
                          {ago(last)}
                          {waits === "staff" ? (
                            <progress
                              className="xpbar duration__bar duration__bar--caution"
                              value={Math.min(Date.now() - last.getTime(), TWO_DAYS_MS)}
                              max={TWO_DAYS_MS}
                              aria-label="Time waiting for staff, out of two days"
                            />
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="queue__empty muted">
                {q
                  ? "No ticket matches that."
                  : view === "closed"
                    ? "No closed tickets kept right now."
                    : config.panels.length
                      ? "Nothing waiting here."
                      : "No tickets yet. Add a panel below and post it in a channel members can see."}
              </p>
            )}
          </section>
        </div>

        <aside className="page-split__side" aria-label="Setup">
          <AutoSaveCard
            id="setup"
            title="Who handles tickets"
            action={saveTicketOptions}
            undo={undoChange}
            guildId={guild.id}
            stamp={contentKey({ ...config, panels: null })}
            saveLabel="Save who handles tickets"
          >
            {noStaff ? (
              <p className="g-help g-help--warn">
                No staff roles yet, so only people with Manage Server see new tickets.
              </p>
            ) : null}
            <CheckList
              name="staffRoleIds"
              label="Staff roles"
              value={config.staffRoleIds}
              options={staffRoles.map((r) => ({ id: r.id, label: `@${r.name}` }))}
              help={
                <>
                  They see and answer every ticket. Up to {TICKET_LIMITS.staffRoles}. People with
                  Manage Server count as staff too.
                </>
              }
            />
            <label className="g-field" htmlFor="parentId">
              <span>Open tickets in</span>
              <select
                className="g-input"
                id="parentId"
                name="parentId"
                defaultValue={config.parentId ?? ""}
              >
                <option value="">No category (top of the list)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="g-help">Each ticket is its own channel, named ticket-0042.</span>
            </label>
            <label className="g-field" htmlFor="logChannelId">
              <span>Post a summary when one closes</span>
              <select
                className="g-input"
                id="logChannelId"
                name="logChannelId"
                defaultValue={config.logChannelId ?? ""}
              >
                <option value="">Don't post (dashboard only)</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
            <Segmented
              name="maxOpen"
              label="Open tickets per member"
              value={String(config.maxOpen)}
              options={Array.from({ length: TICKET_LIMITS.maxOpen }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
            />
            <Switch
              name="pingStaff"
              defaultChecked={config.pingStaff}
              label="Ping the staff roles when a ticket opens"
              help="The only ping a ticket makes besides the member's own."
            />
            <Switch
              name="modmail"
              defaultChecked={config.modmail}
              label="Members can open a ticket by DMing Garrison"
              help="Staff-only tickets: what staff write goes to the member's DMs; start a line with // to keep it in the channel."
            />
            <label className="switch">
              <input
                type="checkbox"
                name="autoAssign"
                defaultChecked={config.autoAssign}
                disabled={!ent["tickets.autoAssign"] && !config.autoAssign}
              />
              <span className="switch__text">
                <span className="field-label">
                  Hand each new ticket to the staff member with the fewest open{" "}
                  <ProTag on={ent["tickets.autoAssign"]} />
                </span>
                <span className="g-help">
                  {ent["tickets.autoAssign"]
                    ? "They're pinged in the ticket. Anyone on staff can still claim it."
                    : config.autoAssign
                      ? "Saved on Pro and paused on Free: tickets open unclaimed."
                      : "Part of Garrison Pro."}
                </span>
              </span>
            </label>
          </AutoSaveCard>
          {stats ? null : (
            <ProUpsell guildId={guild.id}>
              Ticket stats: opened and closed each month, and how long members wait for a first
              reply.
            </ProUpsell>
          )}
        </aside>
      </div>

      <ListHead
        title="Ticket panels"
        count={`${config.panels.length} of ${limit} panels`}
        create={{
          label: "New panel",
          href: `${base}?edit=new#new`,
          disabled: full
            ? `${limit} of ${limit} panels used${plan === "pro" ? "" : `. Pro runs ${PANEL_HARD_MAX}`}.`
            : undefined,
        }}
      />

      <div className="item-grid" id="panels">
        {config.panels.map((panel, index) => {
          const post = posts.find((p) => p.panelId === panel.id) ?? null;
          const paused = isPanelPaused(index, ent);
          const facts = [
            plural(panel.topics.length, "topic"),
            ...(post ? [`in #${channelName.get(post.channelId) ?? "deleted-channel"}`] : []),
          ];
          return (
            <details
              className="g-card panel item-tile"
              id={panel.id}
              key={`${panel.id}-${contentKey(panel)}`}
              open={editing === panel.id}
            >
              <summary className="panel__summary">
                <span className="item-tile__mark" aria-hidden="true" />
                <span className="panel__title panel__title--lg">{panel.name}</span>
                {paused ? <span className="g-badge g-badge--caution">Paused</span> : null}
                <span className="panel__facts">
                  {facts.map((f) => (
                    <span className="fact" key={f}>
                      {f}
                    </span>
                  ))}
                </span>
                <span className={`item-tile__state g-badge${post ? " g-badge--go" : ""}`}>
                  {post ? "Posted" : "Not posted"}
                </span>
                <span className="panel__cue" aria-hidden="true" />
              </summary>
              <div className="panel__body">
                <TicketPanelEditor
                  guildId={guild.id}
                  saved={panel}
                  ent={ent}
                  channels={channels}
                  roleNames={roles.map(({ id, name }) => ({ id, name }))}
                  postedIn={post?.channelId ?? null}
                  paused={paused}
                  planHref={`/servers/${guild.id}/plan`}
                  saveAction={savePanel}
                  removeAction={removePanel}
                  requestAction={requestAction}
                  serverEmoji={serverEmoji}
                />
              </div>
            </details>
          );
        })}
        <FormPanel
          id="new"
          className="item-tile item-tile--new"
          title="New ticket panel"
          hint={
            full
              ? `${limit} of ${limit} panels used${plan === "pro" ? "" : `. Pro runs ${PANEL_HARD_MAX}.`}`
              : "Start from a ready-made card, then change every word"
          }
          open={config.panels.length === 0 || editing === "new"}
        >
          <form action={addPanel} className="card-col">
            <input type="hidden" name="guildId" value={guild.id} />
            <div className="preset-grid" role="radiogroup" aria-label="Start from">
              {Object.entries(TICKET_PANEL_PRESETS).map(([key, p], i) => (
                <label className="preset" key={key}>
                  <input type="radio" name="preset" value={key} defaultChecked={i === 0} />
                  <span className="preset__body">
                    <span className="preset__name">{p.name}</span>
                    <span className="preset__title">{p.card.title}</span>
                    <span className="g-help">{p.topics.join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="field-row">
              <label className="g-field">
                <span>Name</span>
                <input
                  className="g-input"
                  name="name"
                  maxLength={TICKET_LIMITS.name}
                  placeholder="Keeps the starting point's name"
                />
              </label>
            </div>
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--primary" disabled={full}>
                {full ? `${limit} of ${limit} panels used` : "Add panel"}
              </button>
              {plan === "free" ? (
                <span className="g-help">
                  Free servers run 1 panel of {ent["tickets.topics"]} topics and keep transcripts{" "}
                  {ent["tickets.historyDays"]} days. Pro runs {PANEL_HARD_MAX} panels of{" "}
                  {TOPIC_HARD_MAX}, with forms, auto-assign and 365 days.
                </span>
              ) : null}
            </div>
          </form>
        </FormPanel>
      </div>
    </>
  );
}
