import {
  entitlements,
  getGuildPlan,
  getMessages,
  getOpsTimezone,
  lastSends,
  MESSAGE_LIMITS,
  MESSAGE_PRESETS,
  nextOccurrence,
  pausedSchedules,
  readMessages,
  SCHEDULED_HARD_MAX,
} from "@garrison/db";
import type { Metadata } from "next";
import { PlansLink } from "@/components/ProUpsell";
import { RequestsPanel } from "@/components/RequestsPanel";
import { FormPanel } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { addMessage, removeMessage, saveMessage } from "./actions";
import { MessageEditor } from "./MessageEditor";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [raw, plan, tz, last, channels, roles] = await Promise.all([
    getMessages(db, guild.id),
    getGuildPlan(db, guild.id),
    getOpsTimezone(db, guild.id),
    lastSends(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
  ]);
  const ent = entitlements(plan);
  const messages = readMessages(raw);
  const paused = pausedSchedules(messages, ent);
  const scheduled = messages.filter((m) => m.schedule).length;
  const limit = ent["messages.scheduled"];
  const full = messages.length >= MESSAGE_LIMITS.saved;
  const editing = typeof query.edit === "string" ? query.edit : null;
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const roleNames = roles.map((r) => [r.id, r.name] as [string, string]);
  const when = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  const REPEAT = { none: "Once", daily: "Daily", weekly: "Weekly" } as const;

  const flash = await readFlash();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p>
            Design announcements, rules and reminders as cards, then post them now or on a schedule.
            Garrison posts them as itself, in the server's time zone.
          </p>
        </div>
        <span className="mono">
          {plan === "pro" ? "Pro" : "Free"} · {scheduled} of {limit} scheduled
        </span>
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
      {paused.size ? (
        <div className="notice notice--pro" role="status">
          <span>
            {paused.size} scheduled {paused.size === 1 ? "message is" : "messages are"} paused: this
            server's plan runs {limit}. Nothing was lost.{" "}
            <PlansLink guildId={guild.id} className="" />
          </span>
        </div>
      ) : null}

      <RequestsPanel guildId={guild.id} kinds={["post_message"]} query={query} />

      <FormPanel
        id="new"
        title="New message"
        hint={
          full
            ? `${MESSAGE_LIMITS.saved} messages saved: remove one first`
            : "Start from a ready-made card"
        }
        open={messages.length === 0 || editing === "new"}
      >
        <form action={addMessage} className="card-col">
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="preset-grid" role="radiogroup" aria-label="Start from">
            {Object.entries(MESSAGE_PRESETS).map(([key, p], i) => (
              <label className="preset" key={key}>
                <input type="radio" name="preset" value={key} defaultChecked={i === 0} />
                <span className="preset__body">
                  <span className="preset__name">{p.name}</span>
                  <span className="preset__title">{p.card.title}</span>
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
                maxLength={MESSAGE_LIMITS.name}
                placeholder="Keeps the starting point's name"
              />
            </label>
          </div>
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary" disabled={full}>
              Add message
            </button>
            {plan === "free" ? (
              <span className="g-help">
                Free servers schedule {limit} messages, once each. Pro schedules{" "}
                {SCHEDULED_HARD_MAX}, repeats them daily or weekly, and adds link buttons.
              </span>
            ) : null}
          </div>
        </form>
      </FormPanel>

      {messages.map((m) => {
        const next = m.schedule && !paused.has(m.id) ? nextOccurrence(m.schedule, tz) : null;
        const sent = last.get(m.id);
        const facts = [
          m.schedule
            ? `${REPEAT[m.schedule.repeat]}${m.channelId ? ` in #${channelName.get(m.channelId) ?? "deleted-channel"}` : ""}`
            : "Not scheduled",
          next ? `Next ${when(next)}` : null,
          sent ? `Last sent ${when(sent)}` : "Never sent",
        ].filter((f): f is string => Boolean(f));
        return (
          <details
            className="g-card panel"
            id={m.id}
            key={`${m.id}-${contentKey(m)}`}
            open={editing === m.id}
          >
            <summary className="panel__summary">
              <span className="panel__title panel__title--lg">{m.name}</span>
              {paused.has(m.id) ? <span className="g-badge g-badge--caution">Paused</span> : null}
              <span className="panel__facts">
                {facts.map((f) => (
                  <span className="fact" key={f}>
                    {f}
                  </span>
                ))}
              </span>
              <span className="panel__cue" aria-hidden="true" />
            </summary>
            <div className="panel__body">
              <MessageEditor
                guildId={guild.id}
                saved={m}
                ent={ent}
                channels={channels}
                roleNames={roleNames}
                tz={tz}
                nextSend={next ? when(next) : null}
                paused={paused.has(m.id)}
                planHref={`/servers/${guild.id}/plan`}
                saveAction={saveMessage}
                removeAction={removeMessage}
                requestAction={requestAction}
              />
            </div>
          </details>
        );
      })}
    </>
  );
}
