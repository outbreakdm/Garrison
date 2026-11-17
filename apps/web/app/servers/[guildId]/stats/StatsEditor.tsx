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
import { TemplateField, type TemplateVar } from "@/components/TemplateField";

const COUNT_VAR: TemplateVar = { key: "count", label: "Count", about: "the number, like 372" };
const ROLE_VAR: TemplateVar = { key: "role", label: "Role", about: "the role's name" };

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
  // A counter switched off and on again keeps its key, so it keeps its channel.
  const [kept] = useState(() => new Map<StatKind, StatCounter>());
  const max = Math.min(limit, STATS_LIMITS.counters);
  const full = rows.length >= max;
  const update = (key: string, patch: Partial<StatCounter>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggle = (kind: StatKind, on: boolean) => {
    if (!on) {
      const gone = rows.find((r) => r.kind === kind);
      if (gone) kept.set(kind, gone);
      setRows(rows.filter((r) => r.kind !== kind));
      return;
    }
    if (full) return;
    setRows([
      ...rows,
      kept.get(kind) ?? {
        key: newStatKey(),
        kind,
        roleId: null,
        template: STAT_KINDS[kind].template,
        channelId: null,
      },
    ]);
  };
  const addRole = () => {
    if (full) return;
    setRows([
      ...rows,
      {
        key: newStatKey(),
        kind: "role",
        roleId: null,
        template: STAT_KINDS.role.template,
        channelId: null,
      },
    ]);
  };
  const blocked = rows.some((r) => r.kind === "role" && !r.roleId)
    ? "Pick the role for each role counter."
    : rows.some((r) => r.template.trim() && !r.template.includes("{count}"))
      ? "Each name needs the number: type @ in it and pick Count."
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
  const paused = new Set(rows.slice(limit).map((r) => r.key));

  /** Where a counter shows and what it's called: the same two fields for every counter. */
  const details = (r: StatCounter) => (
    <div className="stat-option__fields">
      <div className="g-field">
        <span className="field-label" aria-hidden="true">
          Channel name
        </span>
        <TemplateField
          aria-label="Channel name"
          vars={r.kind === "role" ? [COUNT_VAR, ROLE_VAR] : [COUNT_VAR]}
          value={r.template}
          maxLength={STATS_LIMITS.template}
          placeholder={STAT_KINDS[r.kind].template}
          aria-invalid={Boolean(r.template.trim() && !r.template.includes("{count}"))}
          onChange={(template) => update(r.key, { template })}
        />
      </div>
      <label className="g-field">
        <span className="field-label">Shows in</span>
        <select
          className="g-input"
          value={r.channelId ?? ""}
          onChange={(e) => update(r.key, { channelId: e.target.value || null })}
        >
          <option value="">A channel Garrison makes</option>
          {voice.map((c) => (
            <option
              key={c.id}
              value={c.id}
              disabled={rows.some((x) => x.key !== r.key && x.channelId === c.id)}
            >
              🔊 {c.name}
            </option>
          ))}
        </select>
      </label>
      {paused.has(r.key) ? (
        <p className="g-help stat-option__note">Paused on Free: Garrison Pro runs it.</p>
      ) : null}
    </div>
  );
  const roleRows = rows.filter((r) => r.kind === "role");

  return (
    <div ref={signal} className="editor-layout" data-hold={blocked ?? undefined}>
      <input type="hidden" name="counters" value={JSON.stringify(rows)} />
      <div className="editor-fields">
        <ul className="stat-options">
          {STAT_KIND_LIST.filter((k) => k !== "role").map((kind) => {
            const r = rows.find((x) => x.kind === kind);
            const sample = known[kind];
            return (
              <li className="stat-option" key={kind} data-on={r ? "" : undefined}>
                <label className="stat-option__head">
                  <input
                    type="checkbox"
                    checked={Boolean(r)}
                    disabled={!r && full}
                    onChange={(e) => toggle(kind, e.target.checked)}
                  />
                  <span className="stat-option__name">
                    {STAT_KINDS[kind].label}
                    <span className="stat-option__about">
                      {STAT_KINDS[kind].about}
                      {sample !== undefined ? ` · ${sample.toLocaleString("en-US")} now` : ""}
                    </span>
                  </span>
                </label>
                {r ? details(r) : null}
              </li>
            );
          })}
          <li className="stat-option" data-on={roleRows.length ? "" : undefined}>
            <div className="stat-option__head">
              <span className="stat-option__name">
                {STAT_KINDS.role.label}
                <span className="stat-option__about">{STAT_KINDS.role.about}</span>
              </span>
              <button
                type="button"
                className="g-btn g-btn--secondary g-btn--sm"
                onClick={addRole}
                disabled={full}
              >
                Add a role
              </button>
            </div>
            {roleRows.map((r) => (
              <div className="stat-option__role" key={r.key}>
                <div className="stat-option__role-head">
                  <label className="g-field">
                    <span className="sr-only">Role to count</span>
                    <select
                      className="g-input"
                      value={r.roleId ?? ""}
                      aria-invalid={!r.roleId}
                      onChange={(e) => update(r.key, { roleId: e.target.value || null })}
                    >
                      <option value="">Pick a role</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          @{role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="list-rows__remove"
                    aria-label={`Remove the ${r.roleId ? `@${roleName.get(r.roleId) ?? "role"}` : "role"} counter`}
                    onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
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
                {details(r)}
              </div>
            ))}
          </li>
        </ul>
        <p className="g-help">
          {rows.length} of {max} counters on
          {limit < STATS_LIMITS.counters ? `; Pro runs up to ${STATS_LIMITS.counters}` : ""}.
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
