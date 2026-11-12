import { z } from "zod";

/**
 * Validation for Rally and Ops requests from the dashboard. Ranges match
 * /raid create. The bot parses everything again before acting; this is so the
 * dashboard can say what's wrong right away. Pure, so it's unit tested.
 */

const snowflake = z.string().regex(/^\d{17,20}$/, "Pick a channel from the list.");

export const createRaidForm = z
  .object({
    channelId: snowflake,
    title: z.string().trim().min(1, "Give the raid a title.").max(80),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time."),
    roles: z.string().trim().min(1, "Say which roles it needs.").max(120),
    note: z
      .string()
      .trim()
      .max(200)
      .transform((v) => v || null),
    repeatWeekly: z.union([z.literal("on"), z.null(), z.undefined()]).transform((v) => v === "on"),
  })
  .transform(({ date, time, ...rest }) => ({ ...rest, when: `${date} ${time}` }));

export const moveSignupForm = z.object({
  eventId: z.string().uuid(),
  userId: z.string().regex(/^\d{17,20}$/),
  role: z.string().min(1).max(40),
});

export const callSignupsForm = z.object({ eventId: z.string().uuid() });

/** Plain words for a request's state on the dashboard. */
export const ACTION_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Queued", tone: "g-badge" },
  running: { label: "Working", tone: "g-badge g-badge--intel" },
  done: { label: "Done", tone: "g-badge g-badge--go" },
  failed: { label: "Failed", tone: "g-badge g-badge--alert" },
};

export const ACTION_KIND: Record<string, string> = {
  create_raid: "Create raid",
  move_signup: "Move from bench",
  call_signups: "Call for signups",
  lockdown_start: "Lock the server",
  lockdown_end: "Lift lockdown",
  release_quarantine: "Restore roles",
  undo_case: "Undo case",
  cancel_raid: "Cancel raid",
  close_lfg: "Close group",
  undo_build: "Undo build",
  run_health: "Health check",
  post_verify_panel: "Post Verify button",
  anti_nuke: "Anti-nuke settings",
  mod_action: "Moderate member",
  purge: "Clear messages",
  create_lfg: "Post group",
  lfg_join: "Join group",
  lfg_leave: "Leave group",
  raid_signup: "Raid signup",
  raid_withdraw: "Withdraw from raid",
  qm_plan: "Plan build",
  qm_apply: "Apply build",
  qm_cancel: "Discard plan",
  post_role_menu: "Post role menu",
  bot_profile: "Change Garrison's profile",
  post_message: "Post message",
  post_ticket_panel: "Post ticket panel",
  ticket_action: "Ticket: claim, close or reopen",
  start_giveaway: "Start giveaway",
  giveaway_action: "Giveaway",
  test_alert: "Test alert",
  backup_create: "Back up the server",
  backup_restore: "Restore a backup",
  season_start: "End the season",
  template_save: "Save a server template",
  template_apply: "Apply a server template",
};
