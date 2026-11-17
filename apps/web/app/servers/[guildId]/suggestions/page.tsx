import {
  countSuggestions,
  entitlements,
  getGuildPlan,
  getSuggestionSettings,
  listSuggestions,
  SUGGESTION_LIMITS,
  SUGGESTION_STATUS_LABEL,
  SUGGESTION_STATUSES,
  type SuggestionStatus,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoSaveCard } from "@/components/AutoSave";
import { ProTag } from "@/components/cards/CardEditor";
import { EmptyState } from "@/components/EmptyState";
import { HowItWorks } from "@/components/HowItWorks";
import { ListHead } from "@/components/ListHead";
import { HeadNote, HeadSwitch } from "@/components/ModuleHead";
import { CompactLayout } from "@/components/PageLayouts";
import { RequestsPanel } from "@/components/RequestsPanel";
import { SettingsNotice } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { pageStatus } from "@/lib/module-states";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { requestAction } from "../requests";
import { undoChange } from "../settings/actions";
import { saveSuggestions } from "./actions";

export const metadata: Metadata = { title: "Suggestions" };

const BADGE: Record<SuggestionStatus, string> = {
  open: "g-badge--accent",
  planned: "g-badge--intel",
  done: "g-badge--go",
  declined: "g-badge--off",
};

export default async function SuggestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  // On but can't work (a missing channel, a missing permission): said in the head.
  const status = await pageStatus(guild.id, "/suggestions");
  const query = await searchParams;
  const filter = SUGGESTION_STATUSES.find((s) => s === query.status) ?? null;
  const db = await getDb();
  const [config, plan, list, counts, channels, flash] = await Promise.all([
    getSuggestionSettings(db, guild.id),
    getGuildPlan(db, guild.id),
    listSuggestions(db, guild.id, filter, 50),
    countSuggestions(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const total = SUGGESTION_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const base = `/servers/${guild.id}/suggestions`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Suggestions</h1>
          <p>
            Members post ideas with <code>/suggest</code>, and the server votes on them.
          </p>
          <HowItWorks>
            Each idea becomes a card in your suggestions channel with For and Against buttons. Mark
            it Planned, Done or Declined here, with a note the card shows.
          </HowItWorks>
        </div>
        <HeadSwitch
          key={contentKey(config)}
          label="Suggestions"
          name="enabled"
          form="settings-form"
          defaultChecked={config.enabled}
        />
        {status.state === "blocked" ? (
          <HeadNote
            reason={status.reason ?? "Something it needs is missing."}
            href={"#settings"}
            action={"Pick a channel"}
          />
        ) : null}
      </div>

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}
      <SettingsNotice query={query} />
      <RequestsPanel guildId={guild.id} kinds={["suggestion_status"]} query={query} />

      <CompactLayout
        liveFirst={list.length > 0}
        settings={
          <AutoSaveCard
            id="settings"
            title="Suggestions"
            action={saveSuggestions}
            undo={undoChange}
            guildId={guild.id}
            stamp={contentKey(config)}
            saveLabel="Save suggestions"
          >
            <p className="g-help">Off stops /suggest; cards already posted keep their votes.</p>
            <label className="g-field" htmlFor="channelId">
              <span>Post suggestions in</span>
              <select
                className="g-input"
                id="channelId"
                name="channelId"
                defaultValue={config.channelId ?? ""}
              >
                <option value="">Pick a channel</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              <span className="g-help">
                A channel members can read but not post in keeps it tidy: Garrison posts the cards.
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                name="anonymous"
                defaultChecked={config.anonymous}
                disabled={!ent["suggestions.anonymous"] && !config.anonymous}
              />
              <span className="switch__text">
                <span>
                  Anonymous suggestions <ProTag on={ent["suggestions.anonymous"]} />
                </span>
                <span className="g-help">
                  Cards don't say who posted. You still see it here, to deal with abuse.
                </span>
              </span>
            </label>
          </AutoSaveCard>
        }
        live={
          <>
            <ListHead
              filters={[
                { key: "all", label: "All", n: total, href: base },
                ...SUGGESTION_STATUSES.map((st) => ({
                  key: st,
                  label: SUGGESTION_STATUS_LABEL[st],
                  n: counts[st] ?? 0,
                  href: `${base}?status=${st}`,
                })),
              ]}
              current={filter ?? "all"}
            />
            <section className="g-card queue" aria-labelledby="sg-title">
              <div className="table-card__head">
                <h2 className="card-title" id="sg-title">
                  {filter ? SUGGESTION_STATUS_LABEL[filter] : "Board"}{" "}
                  <span className="count">{list.length}</span>
                </h2>
              </div>
              {list.length ? (
                <ul className="queue__list">
                  {list.map((s) => {
                    const status = s.status as SuggestionStatus;
                    const votes = s.up + s.down;
                    return (
                      <li key={s.id} className="sg-row">
                        <div className="sg-row__head">
                          <span className="ticket-row__topic">#{s.number}</span>
                          <span className={`g-badge ${BADGE[status]}`}>
                            {SUGGESTION_STATUS_LABEL[status]}
                          </span>
                          <span className="sg-row__votes">
                            {s.up} for · {s.down} against
                            {votes ? ` · ${Math.round((s.up / votes) * 100)}%` : ""}
                          </span>
                        </div>
                        <p className="sg-row__text">{s.text}</p>
                        <span className="ticket-row__who">
                          {s.authorName}
                          {s.anonymous ? " (hidden on the card)" : ""} · {ago(s.createdAt)}
                          {s.messageId && s.channelId ? (
                            <>
                              {" · "}
                              <a
                                href={`https://discord.com/channels/${guild.id}/${s.channelId}/${s.messageId}`}
                              >
                                Open in Discord
                              </a>
                            </>
                          ) : null}
                          {s.decidedBy ? ` · decided by ${s.decidedBy}` : ""}
                        </span>
                        <form action={requestAction} className="sg-row__decide">
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value="suggestions" />
                          <input type="hidden" name="kind" value="suggestion_status" />
                          <input type="hidden" name="id" value={s.id} />
                          <label className="g-field" htmlFor={`status-${s.id}`}>
                            <span className="sr-only">Status for #{s.number}</span>
                            <select
                              className="g-input"
                              id={`status-${s.id}`}
                              name="status"
                              defaultValue={status}
                            >
                              {SUGGESTION_STATUSES.map((x) => (
                                <option key={x} value={x}>
                                  {SUGGESTION_STATUS_LABEL[x]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="g-field" htmlFor={`note-${s.id}`}>
                            <span className="sr-only">Note for #{s.number}</span>
                            <input
                              className="g-input"
                              id={`note-${s.id}`}
                              name="note"
                              maxLength={SUGGESTION_LIMITS.note}
                              defaultValue={s.staffNote ?? ""}
                              placeholder="A note on the card (optional)"
                            />
                          </label>
                          <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                            Update
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  compact
                  mark="inbox"
                  title={
                    filter
                      ? `Nothing ${SUGGESTION_STATUS_LABEL[filter].toLowerCase()}`
                      : "No suggestions yet"
                  }
                >
                  {config.enabled
                    ? "When a member uses /suggest, it shows up here."
                    : "Turn suggestions on and pick a channel, then members can use /suggest."}
                </EmptyState>
              )}
            </section>
          </>
        }
      />
    </>
  );
}
