import type { ReactNode } from "react";

/**
 * The pieces every page uses to show and edit its own settings: the result
 * notice, the collapsible panel, and the form controls. Server components
 * only: the panels are <details>, so they work without JavaScript.
 */

type Query = Record<string, string | string[] | undefined>;

const SAVED: Record<string, string> = {
  watch: "Saved Watch settings.",
  antiraid: "Saved anti-raid settings.",
  verification: "Saved verification settings.",
  ops: "Saved the raid time zone.",
  ranks: "Saved Ranks settings.",
  ledger: "Saved Ledger settings.",
  escalation: "Saved the escalation ladder. It applies from the next warning.",
  rewards: "Saved level rewards. Members get them at their next level-up.",
  undo: "Undone.",
};

const ERRORS: Record<string, string> = {
  range: "Some values were out of range. Nothing was saved.",
  bad_channel: "That channel isn't a text channel in this server. Nothing was saved.",
  timezone: "That isn't a time zone. Use a name like America/Chicago.",
  role: "Pick roles from this server's list. Nothing was saved.",
  dangerous_role:
    "That role has admin or moderation powers, so it can't be handed out by the Verify button.",
  ladder:
    "Nothing was saved. Each step needs warnings (1 to 50), a time window and an action, a timeout needs a length, and no two steps can share a warning count.",
  reward_level: "Levels go from 1 to 500. Nothing was saved.",
  reward_role: "Pick each reward role from this server's list. Nothing was saved.",
  reward_duplicate: "Each level can have one reward. Nothing was saved.",
  reward_dangerous: "A reward role can't have admin or moderation powers. Nothing was saved.",
  unchanged: "Nothing changed.",
  pro: "That's part of Garrison Pro. Nothing was saved.",
  not_ready: "Garrison hasn't finished setting up this server. Try again in a minute.",
  not_found: "That change doesn't exist.",
  already_undone: "That change was already undone.",
  is_undo: "That's an undo. Change the setting again instead.",
  conflict: "Someone changed these settings since. Undo the newer change first.",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Is this panel the one the URL asks to open (?edit=panel)? */
export const isEditing = (query: Query, panel: string) => one(query.edit) === panel;

/** The outcome of the last save, on whichever page the setting lives. */
export function SettingsNotice({ query }: { query: Query }) {
  const ok = SAVED[one(query.saved) ?? ""];
  const error = ERRORS[one(query.error) ?? ""];
  if (error)
    return (
      <div className="notice" role="alert">
        {error}
      </div>
    );
  if (ok)
    return (
      <div className="notice notice--ok" role="status">
        {ok}
      </div>
    );
  return null;
}

export function GearIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M6.6 1.5h2.8l.4 2 1.7 1 1.9-.7 1.4 2.4-1.5 1.3v2l1.5 1.3-1.4 2.4-1.9-.7-1.7 1-.4 2H6.6l-.4-2-1.7-1-1.9.7-1.4-2.4 1.5-1.3v-2L1.2 6.2l1.4-2.4 1.9.7 1.7-1z" />
      <circle cx="8" cy="8.5" r="2" />
    </svg>
  );
}

export interface Fact {
  label: string;
  value: string;
}

/**
 * A page's own settings: one row showing the current values, opening into the
 * form. Link to it with ?edit=<id>#<id> to land on it already open.
 */
export function SettingsPanel({
  id = "settings",
  title,
  facts,
  open,
  children,
}: {
  id?: string;
  title: string;
  facts: Fact[];
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details className="g-card panel" id={id} open={open}>
      <summary className="panel__summary">
        <GearIcon />
        <span className="panel__title">{title}</span>
        <span className="panel__facts">
          {facts.map((f) => (
            <span className="fact" key={f.label}>
              <span className="fact__label">{f.label}</span> {f.value}
            </span>
          ))}
        </span>
        <span className="panel__cue" aria-hidden="true" />
      </summary>
      <div className="panel__body">{children}</div>
    </details>
  );
}

/**
 * A form that folds into one row until it's needed (post a group, create a raid,
 * edit the ladder): the same row and brackets as a settings panel, with a hint
 * instead of current values.
 */
export function FormPanel({
  id,
  title,
  hint,
  open,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details className="g-card panel" id={id} open={open}>
      <summary className="panel__summary">
        <span className="panel__title panel__title--lg">{title}</span>
        <span className="panel__hint">{hint}</span>
        <span className="panel__cue" aria-hidden="true" />
      </summary>
      <div className="panel__body">{children}</div>
    </details>
  );
}

/** The foot of every settings form: the save button, and where the change is recorded. */
export function FormFoot({ label, guildId }: { label: string; guildId: string }) {
  return (
    <div className="form-foot">
      <button type="submit" className="g-btn g-btn--primary">
        {label}
      </button>
      <span className="g-help">
        Recorded in <a href={`/servers/${guildId}/settings#history`}>Settings history</a>, where it
        can be undone.
      </span>
    </div>
  );
}

export function ChannelSelect({
  name,
  value,
  channels,
  none,
}: {
  name: string;
  value: string | null;
  channels: { id: string; name: string }[];
  none: string;
}) {
  return (
    <select className="g-input" name={name} defaultValue={value ?? ""} id={name}>
      <option value="">{none}</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
    </select>
  );
}

/** A checkbox drawn as a switch. Still a real checkbox: it posts "on" or nothing. */
export function Switch({
  name,
  defaultChecked,
  label,
  help,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  help?: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="switch__text">
        <span>{label}</span>
        {help ? <span className="g-help">{help}</span> : null}
      </span>
    </label>
  );
}
