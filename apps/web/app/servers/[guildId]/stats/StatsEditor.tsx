"use client";

import {
  newStatKey,
  STAT_KIND_LIST,
  STAT_KINDS,
  STATS_CATEGORY_NAME,
  STATS_LIMITS,
  type StatCounter,
  type StatKind,
  statName,
} from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;
interface Named {
  id: string;
  name: string;
}

interface Props {
  guildId: string;
  counters: StatCounter[];
  categoryId: string | null;
  /** How many counters this plan runs. */
  limit: number;
  roles: Named[];
  voice: Named[];
  categories: Named[];
  /** What each kind counts now, where the dashboard knows it (members, channels, roles). */
  known: Partial<Record<StatKind, number>>;
  /** What each counter last showed in Discord, by key: the bot's own count. */
  shown: Record<string, number>;
  action: Action;
  undo: Action;
  stamp: string;
}

/** The counters as a panel that saves itself, beside the channel list as Discord shows it. */
export function StatsEditor(props: Props) {
  return (
    <AutoSaveCard
      id="settings"
      title="Counters"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save server stats"
    >
      <StatsFields {...props} />
    </AutoSaveCard>
  );
}

function SpeakerGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M2.5 6v4h2.6L8.5 13V3L5.1 6H2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M11 5.5a3.5 3.5 0 0 1 0 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg
      className="dc-side__lock"
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7h1Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}

function StatsFields({
  counters: saved,
  categoryId,
  limit,
  roles,
  voice,
  categories,
  known,
  shown,
}: Props) {
  const [rows, setRows] = useState<StatCounter[]>(saved);
  const [category, setCategory] = useState(categoryId ?? "");
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(rows));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const set = (i: number, patch: Partial<StatCounter>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    if (rows.length >= Math.min(limit, STATS_LIMITS.counters)) return;
    // The first kind not in use yet, so a fresh row says something new.
    const kind = STAT_KIND_LIST.find((k) => k !== "role" && !rows.some((r) => r.kind === k));
    setRows([
      ...rows,
      {
        key: newStatKey(),
        kind: kind ?? "members",
        roleId: null,
        template: STAT_KINDS[kind ?? "members"].template,
        channelId: null,
      },
    ]);
  };
  const blocked = rows.some((r) => r.kind === "role" && !r.roleId)
    ? "Pick the role for each “Members with a role” counter."
    : rows.some((r) => r.template.trim() && !r.template.includes("{count}"))
      ? "Each name needs {count}, where the number goes."
      : null;
  const value = (r: StatCounter) =>
    shown[r.key] ?? (r.kind === "role" ? null : (known[r.kind] ?? null));
  const nameOf = (r: StatCounter) =>
    statName(
      r.template.trim() || STAT_KINDS[r.kind].template,
      value(r),
      r.roleId ? roleName.get(r.roleId) : null,
    );
  const ours = rows.filter((r) => !r.channelId);
  const theirs = rows.filter((r) => r.channelId);
  const catName = category
    ? (categories.find((c) => c.id === category)?.name ?? STATS_CATEGORY_NAME)
    : STATS_CATEGORY_NAME;
  const over = rows.length > limit;

  return (
    <div ref={signal} className="editor-layout" data-hold={blocked ?? undefined}>
      <input type="hidden" name="counters" value={JSON.stringify(rows)} />
      <div className="editor-fields">
        {rows.length ? (
          <ol className="counter-rows">
            {rows.map((r, i) => (
              <li className="counter-row" key={r.key} data-paused={i >= limit ? "" : undefined}>
                <div className="counter-row__head">
                  <span className="counter-row__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <label className="g-field counter-row__kind">
                    <span className="sr-only">Counter {i + 1} counts</span>
                    <select
                      className="g-input"
                      value={r.kind}
                      onChange={(e) => {
                        const kind = e.target.value as StatKind;
                        const standard = r.template === STAT_KINDS[r.kind].template;
                        set(i, {
                          kind,
                          roleId: kind === "role" ? r.roleId : null,
                          // A name still the standard one follows the new kind.
                          template: standard ? STAT_KINDS[kind].template : r.template,
                        });
                      }}
                    >
                      {STAT_KIND_LIST.map((k) => (
                        <option key={k} value={k}>
                          {STAT_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="list-rows__remove"
                    aria-label={`Remove counter ${i + 1}`}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="counter-row__body">
                  {r.kind === "role" ? (
                    <label className="g-field">
                      <span className="field-label">Role</span>
                      <select
                        className="g-input"
                        value={r.roleId ?? ""}
                        aria-invalid={!r.roleId}
                        onChange={(e) => set(i, { roleId: e.target.value || null })}
                      >
                        <option value="">Pick a role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            @{role.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="g-field">
                    <span className="field-label">Channel name</span>
                    <input
                      className="g-input"
                      value={r.template}
                      maxLength={STATS_LIMITS.template}
                      placeholder={STAT_KINDS[r.kind].template}
                      aria-invalid={Boolean(r.template.trim() && !r.template.includes("{count}"))}
                      onChange={(e) => set(i, { template: e.target.value })}
                    />
                  </label>
                  <label className="g-field">
                    <span className="field-label">Shows in</span>
                    <select
                      className="g-input"
                      value={r.channelId ?? ""}
                      onChange={(e) => set(i, { channelId: e.target.value || null })}
                    >
                      <option value="">A channel Garrison makes</option>
                      {voice.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={rows.some((x, j) => j !== i && x.channelId === c.id)}
                        >
                          🔊 {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {i >= limit ? (
                  <p className="g-help counter-row__note">Paused on Free: Garrison Pro runs it.</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="g-help">
            No counters yet. Add one and Garrison makes a voice channel named with the number.
          </p>
        )}
        <div className="list-rows__foot">
          <button
            type="button"
            className="g-btn g-btn--secondary g-btn--sm"
            onClick={add}
            disabled={rows.length >= Math.min(limit, STATS_LIMITS.counters)}
          >
            Add a counter
          </button>
          <span className="g-help">
            {Math.min(rows.length, STATS_LIMITS.counters)} of {limit}
            {limit < STATS_LIMITS.counters ? ` on Free; up to ${STATS_LIMITS.counters} on Pro` : ""}
          </span>
        </div>
        <p className="g-help">
          <code>{"{count}"}</code> is the number; <code>{"{role}"}</code> is the role's name.
          Numbers refresh every ten minutes, Discord's limit for renaming a channel.
        </p>
        {blocked ? (
          <p className="g-help g-help--warn" role="status">
            {blocked} Nothing saves until then.
          </p>
        ) : null}
        <label className="g-field" htmlFor="categoryId">
          <span className="field-label">Garrison's channels go in</span>
          <select
            className="g-input"
            id="categoryId"
            name="categoryId"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">A “{STATS_CATEGORY_NAME}” category at the top</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="g-help">
            Members see them but can't join. Removing a counter deletes the channel Garrison made
            for it; a channel you picked is left as it is.
          </span>
        </label>
      </div>

      <div className="preview-pane">
        <div className="preview-pane__head">
          <span className="g-label">In Discord</span>
          <span className="g-help">{over ? "Free runs the first three" : "Live preview"}</span>
        </div>
        <figure className="dc dc-side">
          <figcaption className="sr-only">
            How the channels look in Discord's channel list
          </figcaption>
          {ours.length ? (
            <div className="dc-side__cat">
              <span className="dc-side__cat-name">{catName}</span>
              <ul className="dc-side__list">
                {ours.map((r) => (
                  <li
                    className="dc-side__row"
                    key={r.key}
                    data-paused={rows.indexOf(r) >= limit ? "" : undefined}
                  >
                    <span className="dc-side__glyph">
                      <SpeakerGlyph />
                      <LockGlyph />
                    </span>
                    <span className="dc-side__name">{nameOf(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {theirs.length ? (
            <div className="dc-side__cat">
              <span className="dc-side__cat-name">Your channels</span>
              <ul className="dc-side__list">
                {theirs.map((r) => (
                  <li
                    className="dc-side__row"
                    key={r.key}
                    data-paused={rows.indexOf(r) >= limit ? "" : undefined}
                  >
                    <span className="dc-side__glyph">
                      <SpeakerGlyph />
                    </span>
                    <span className="dc-side__name">{nameOf(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!rows.length ? <p className="dc-side__empty">Your counters show here.</p> : null}
        </figure>
        <p className="g-help">
          “…” is a number Garrison counts in Discord; it shows within a minute of turning on.
        </p>
      </div>
    </div>
  );
}
