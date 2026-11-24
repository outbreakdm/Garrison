import {
  type ClearRule,
  entitlements,
  getGuildPlan,
  getUtilitySettings,
  listTimedRoles,
  readClearRules,
  readStickies,
  type Sticky,
  UTILITY_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoSaveCard } from "@/components/AutoSave";
import { formatTime } from "@/components/format";
import { HowItWorks } from "@/components/HowItWorks";
import { HeadStatus } from "@/components/ModuleHead";
import { CheckList } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { undoChange } from "../settings/actions";
import { removeClearing, removeSticky, saveClearing, saveRestore, saveSticky } from "./actions";

export const metadata: Metadata = { title: "Utilities" };

type Channel = { id: string; name: string };

function ChannelSelect({ channels, value }: { channels: Channel[]; value?: string }) {
  return (
    <label className="g-field">
      <span className="g-label">Channel</span>
      <select className="g-input" name="channelId" defaultValue={value ?? ""} required>
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
  );
}

function OnOff({ on }: { on: boolean }) {
  return (
    <label className="g-field">
      <span className="g-label">State</span>
      <select className="g-input" name="enabled" defaultValue={on ? "on" : "off"}>
        <option value="on">On</option>
        <option value="off">Paused</option>
      </select>
    </label>
  );
}

function StickyFields({ s, channels }: { s: Sticky | null; channels: Channel[] }) {
  return (
    <div className="appl__fields">
      <div className="appl__pair">
        <ChannelSelect channels={channels} value={s?.channelId} />
        <OnOff on={s?.enabled ?? true} />
      </div>
      <label className="g-field">
        <span className="g-label">Message</span>
        <textarea
          className="g-input"
          name="text"
          rows={3}
          defaultValue={s?.text ?? ""}
          maxLength={UTILITY_LIMITS.stickyText}
          placeholder="Post clips only. Questions go in #help."
          required
        />
        <span className="g-help">Discord markdown. It never pings anyone.</span>
      </label>
    </div>
  );
}

function ClearFields({ c, channels }: { c: ClearRule | null; channels: Channel[] }) {
  const days = c && c.hours % 24 === 0;
  return (
    <div className="appl__fields">
      <div className="appl__pair">
        <ChannelSelect channels={channels} value={c?.channelId} />
        <OnOff on={c?.enabled ?? true} />
      </div>
      <div className="appl__pair">
        <label className="g-field">
          <span className="g-label">Delete messages older than</span>
          <input
            className="g-input"
            type="number"
            name="amount"
            min={1}
            max={UTILITY_LIMITS.maxHours}
            defaultValue={c ? (days ? c.hours / 24 : c.hours) : 24}
            required
          />
        </label>
        <label className="g-field">
          <span className="g-label">Unit</span>
          <select className="g-input" name="unit" defaultValue={days ? "days" : "hours"}>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" name="keepPinned" defaultChecked={c?.keepPinned ?? true} />
        <span className="switch__text">
          <span>Keep pinned messages</span>
        </span>
      </label>
    </div>
  );
}

export default async function UtilitiesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId, "utilities");
  const db = await getDb();
  const [s, plan, timed, channels, allRoles, flash] = await Promise.all([
    getUtilitySettings(db, guild.id),
    getGuildPlan(db, guild.id),
    listTimedRoles(db, guild.id, undefined, 50),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const stickies = readStickies(s.stickies);
  const clearing = readClearRules(s.clearing);
  const stickyLimit = ent["utilities.stickies"];
  const clearLimit = ent["utilities.clearing"];
  const textChannels = channels.map((c) => ({ id: c.id, name: c.name }));
  const channelName = new Map(textChannels.map((c) => [c.id, c.name]));
  const roles = allRoles
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position);
  const roleName = new Map(allRoles.map((r) => [r.id, r.name]));
  const on = [s.restoreRoles, stickies.length > 0, clearing.length > 0].filter(Boolean).length;
  const hoursText = (h: number) =>
    h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Utilities</h1>
          <p>Small tools for roles and channels that keep a server tidy.</p>
          <HowItWorks>
            Roles come back when a member rejoins, sticky messages stay at the bottom of a channel,
            and self-clearing channels delete old messages. Staff give roles for a while with{" "}
            <code>/temprole</code>.
          </HowItWorks>
        </div>
        <HeadStatus
          on={on > 0}
          word={null}
          text={on ? `${on} of 3 tools on` : "Nothing on yet"}
          href={on ? undefined : "#rejoin"}
          action="Start here"
        />
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

      <AutoSaveCard
        id="rejoin"
        title="Roles back on rejoin"
        action={saveRestore}
        undo={undoChange}
        guildId={guild.id}
        stamp={contentKey([s.restoreRoles, s.restoreSkipRoleIds])}
        saveLabel="Save roles back on rejoin"
      >
        <p className="card-sub">
          When a member leaves, Garrison keeps their roles for 180 days and gives them back if they
          return. Bot roles, roles above Garrison's and roles with moderation powers are never given
          back.
        </p>
        <div className="appl__edit">
          <label className="switch">
            <input type="checkbox" name="restoreRoles" defaultChecked={s.restoreRoles} />
            <span className="switch__text">
              <span>Give roles back when members rejoin</span>
              <span className="g-help">Only for members who leave after you turn it on.</span>
            </span>
          </label>
          <CheckList
            name="restoreSkipRoleIds"
            label="Never give back"
            value={s.restoreSkipRoleIds}
            options={roles.map((r) => ({ id: r.id, label: `@${r.name}` }))}
            help={`Up to ${UTILITY_LIMITS.skipRoles}, like a role that only means "here right now".`}
          />
        </div>
      </AutoSaveCard>

      <section className="g-card appl" id="stickies" aria-labelledby="stickies-title">
        <h2 className="card-title" id="stickies-title">
          Sticky messages
        </h2>
        <p className="card-sub">
          Garrison posts the message again at the bottom 10 seconds after chat goes quiet, and
          deletes its last one. {stickies.length} of {stickyLimit} used.
          {plan === "free" ? ` Garrison Pro runs up to ${UTILITY_LIMITS.stickies}.` : ""}
        </p>
        {stickies.length ? (
          <ul className="appl__list">
            {stickies.map((x, i) => (
              <li key={x.id} className="appl__form">
                <details>
                  <summary className="appl__summary">
                    <span className="appl__name">
                      #{channelName.get(x.channelId) ?? "a deleted channel"}
                    </span>
                    <span className="muted">
                      {x.text.length > 60 ? `${x.text.slice(0, 59)}…` : x.text}
                      {!x.enabled ? " · paused" : i >= stickyLimit ? " · paused on this plan" : ""}
                    </span>
                  </summary>
                  <form action={saveSticky} className="appl__edit">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="id" value={x.id} />
                    <StickyFields s={x} channels={textChannels} />
                    <div className="appl__do">
                      <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                        Save
                      </button>
                    </div>
                  </form>
                  <form action={removeSticky} className="appl__remove">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="id" value={x.id} />
                    <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                      Remove
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        ) : null}
        {stickies.length >= stickyLimit ? (
          <p className="appl__empty">This server has its plan's most sticky messages.</p>
        ) : (
          <details className="appl__new" open={!stickies.length}>
            <summary className="g-btn g-btn--secondary g-btn--sm">New sticky message</summary>
            <form action={saveSticky} className="appl__edit">
              <input type="hidden" name="guildId" value={guild.id} />
              <StickyFields s={null} channels={textChannels} />
              <div className="appl__do">
                <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                  Add sticky
                </button>
              </div>
            </form>
          </details>
        )}
      </section>

      <section className="g-card appl" id="clearing" aria-labelledby="clearing-title">
        <h2 className="card-title" id="clearing-title">
          Self-clearing channels
        </h2>
        <p className="card-sub">
          Messages older than the time you set are deleted every 10 minutes, up to 14 days old.
          Garrison needs Manage Messages in the channel. {clearing.length} of {clearLimit} used.
          {plan === "free" ? ` Garrison Pro runs up to ${UTILITY_LIMITS.clearing}.` : ""}
        </p>
        {clearing.length ? (
          <ul className="appl__list">
            {clearing.map((x, i) => (
              <li key={x.id} className="appl__form">
                <details>
                  <summary className="appl__summary">
                    <span className="appl__name">
                      #{channelName.get(x.channelId) ?? "a deleted channel"}
                    </span>
                    <span className="muted">
                      after {hoursText(x.hours)}
                      {x.keepPinned ? ", pins kept" : ""}
                      {!x.enabled ? " · paused" : i >= clearLimit ? " · paused on this plan" : ""}
                    </span>
                  </summary>
                  <form action={saveClearing} className="appl__edit">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="id" value={x.id} />
                    <ClearFields c={x} channels={textChannels} />
                    <div className="appl__do">
                      <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                        Save
                      </button>
                    </div>
                  </form>
                  <form action={removeClearing} className="appl__remove">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="id" value={x.id} />
                    <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                      Remove
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        ) : null}
        {clearing.length >= clearLimit ? (
          <p className="appl__empty">This server has its plan's most self-clearing channels.</p>
        ) : (
          <details className="appl__new" open={!clearing.length}>
            <summary className="g-btn g-btn--secondary g-btn--sm">
              New self-clearing channel
            </summary>
            <form action={saveClearing} className="appl__edit">
              <input type="hidden" name="guildId" value={guild.id} />
              <ClearFields c={null} channels={textChannels} />
              <div className="appl__do">
                <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                  Add channel
                </button>
              </div>
            </form>
          </details>
        )}
      </section>

      <section className="g-card appl" id="timed" aria-labelledby="timed-title">
        <h2 className="card-title" id="timed-title">
          Timed roles
        </h2>
        <p className="card-sub">
          Staff with Manage Roles run <code>/temprole give</code> with a member, a role and a time
          like 2h or 3d; Garrison takes the role off when it's up. {timed.length} of{" "}
          {ent["utilities.timedRoles"].toLocaleString("en-US")} running.
        </p>
        {timed.length ? (
          <ul className="appl__done">
            {timed.map((t) => (
              <li key={t.id}>
                <strong>@{roleName.get(t.roleId) ?? "a deleted role"}</strong> for member{" "}
                <code>{t.userId}</code>, until {formatTime(t.expiresAt, "UTC")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="appl__empty">None running.</p>
        )}
      </section>
    </>
  );
}
