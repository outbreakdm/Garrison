/**
 * What a settings save tells the page. A plain form post still redirects with the outcome in
 * the URL (it works before scripts load); a form that saves itself sends `_auto=1` and gets
 * this back instead, so the page stays put and shows a toast with Undo.
 */

export type AutoResult =
  | { status: "saved"; message: string; changeId: string | null }
  | { status: "unchanged" }
  | { status: "error"; message: string };

/** Was this form sent by a form that saves itself? */
export const isAuto = (form: FormData) => form.get("_auto") === "1";

export const SAVED: Record<string, string> = {
  watch: "Saved moderation settings.",
  antiraid: "Saved anti-raid settings.",
  verification: "Saved verification settings.",
  ops: "Saved the raid time zone.",
  members: "Saved. Members see the pages that are on.",
  ranks: "Saved leveling settings.",
  ledger: "Saved log settings.",
  escalation: "Saved the escalation ladder. It applies from the next warning.",
  rewards: "Saved level rewards. Members get them at their next level-up.",
  gatehouse: "Saved backup settings.",
  undo: "Undone.",
};

export const ERRORS: Record<string, string> = {
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
  forbidden: "Only someone with Manage Server can undo a change to who has access.",
};

/**
 * A settings action as a plain `<form action>`, for forms that don't save themselves yet.
 * The browser ignores what it returns (a plain post is redirected before it gets there).
 */
export const formAction = (action: (form: FormData) => Promise<AutoResult>) =>
  action as unknown as (form: FormData) => Promise<void>;

/**
 * The fields a self-saving panel owns (its `_fields`), when one action's settings are split
 * over several panels. Null: the form holds every field, as a plain full form does.
 */
export function ownedFields(form: FormData): Set<string> | null {
  const v = form.get("_fields");
  return typeof v === "string" && v ? new Set(v.split(",")) : null;
}
