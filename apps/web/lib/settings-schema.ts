import { isValidTimeZone } from "@garrison/db";
import { z } from "zod";

/**
 * Form validation for dashboard settings. Ranges match the slash commands.
 * Channel IDs are checked for shape here and against the server's real
 * channels in the action. Pure, so it's unit tested.
 */

const snowflakeOrNone = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d{17,20}$/.test(v), "Pick a channel from the list.");

const checkbox = z.union([z.literal("on"), z.null(), z.undefined()]).transform((v) => v === "on");

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be ${min} to ${max}.`)
    .max(max, `${label} must be ${min} to ${max}.`);

export const watchForm = z.object({
  logChannelId: snowflakeOrNone,
  dmMembers: checkbox,
  appealText: z
    .string()
    .trim()
    .max(300, "Appeal text can be 300 characters at most.")
    .transform((v) => v || null),
});

export const gatehouseForm = z.object({
  alertChannelId: snowflakeOrNone,
  antiRaidEnabled: checkbox,
  raidJoinCount: int(3, 200, "Raid joins"),
  raidWindowSeconds: int(5, 600, "Raid window"),
  raidResponse: z.enum(["lockdown", "alert"], { message: "Pick what happens on a raid." }),
  autoUnlockMinutes: int(0, 1440, "Auto-unlock"),
  flagAccountAgeDays: int(0, 365, "Account age"),
});

export const opsForm = z.object({
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine(isValidTimeZone, "That isn't a time zone. Use a name like America/Chicago."),
});

export const ranksForm = z
  .object({
    enabled: checkbox,
    announce: z.enum(["off", "same_channel", "channel"], { message: "Pick where level-ups go." }),
    announceChannelId: snowflakeOrNone,
  })
  .refine((v) => v.announce !== "channel" || v.announceChannelId !== null, {
    message: "Pick the channel for level-up messages.",
    path: ["announceChannelId"],
  })
  // Only keep a channel when it's used, so history doesn't show a stale one.
  .transform((v) => ({
    ...v,
    announceChannelId: v.announce === "channel" ? v.announceChannelId : null,
  }));

export const ledgerForm = z.object({
  channelId: snowflakeOrNone,
  // Matches /logs settings and the database check; ledger_prune() clamps to the same range.
  retentionDays: int(7, 365, "Keep events for"),
});

/** Choices offered on the ladder form. Anything else is refused, whatever the browser sends. */
export const LADDER_WINDOWS = [60, 360, 1440, 10080, 43200] as const;
export const LADDER_DURATIONS = [600, 3600, 21600, 86400, 604800, 2419200] as const;
export const LADDER_MAX_STEPS = 5;

const ladderStep = z
  .object({
    warnCount: int(1, 50, "Warnings"),
    windowMinutes: z.coerce
      .number()
      .refine((v) => (LADDER_WINDOWS as readonly number[]).includes(v), "Pick a time window."),
    action: z.enum(["timeout", "kick", "ban"], { message: "Pick an action." }),
    durationSeconds: z.coerce.number().nullable(),
  })
  .transform((s) => ({
    ...s,
    durationSeconds: s.action === "timeout" ? s.durationSeconds : null,
  }))
  .refine(
    (s) =>
      s.action !== "timeout" ||
      (LADDER_DURATIONS as readonly number[]).includes(s.durationSeconds ?? -1),
    "Pick how long the timeout lasts.",
  );

/**
 * The ladder form posts LADDER_MAX_STEPS rows as step0_warns, step0_window,
 * step0_action, step0_duration… A row with no warnings or no action is empty
 * and dropped; the rest must be valid, with different warning counts.
 */
export function parseLadder(form: FormData) {
  const rows: unknown[] = [];
  for (let i = 0; i < LADDER_MAX_STEPS; i++) {
    const warns = String(form.get(`step${i}_warns`) ?? "").trim();
    const action = String(form.get(`step${i}_action`) ?? "");
    if (!warns || !action) continue;
    const duration = String(form.get(`step${i}_duration`) ?? "");
    rows.push({
      warnCount: warns,
      windowMinutes: String(form.get(`step${i}_window`) ?? ""),
      action,
      durationSeconds: duration === "" ? null : duration,
    });
  }
  return z
    .array(ladderStep)
    .max(LADDER_MAX_STEPS)
    .refine(
      (steps) => new Set(steps.map((s) => s.warnCount)).size === steps.length,
      "Each step needs a different number of warnings.",
    )
    .safeParse(rows);
}

const span = (seconds: number) =>
  seconds % 86400 === 0
    ? `${seconds / 86400} d`
    : seconds % 3600 === 0
      ? `${seconds / 3600} h`
      : `${seconds / 60} min`;

export const windowText = (minutes: number) =>
  minutes <= 2880 && minutes % 60 === 0 ? `${minutes / 60} h` : span(minutes * 60);
export const durationText = span;

/** "3 in 24 h: timeout 1 h; 5 in 7 d: ban", for history entries. */
export function ladderText(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "no steps";
  return value
    .map(
      (r: {
        warnCount: number;
        windowMinutes: number;
        action: string;
        durationSeconds: number | null;
      }) =>
        `${r.warnCount} in ${windowText(r.windowMinutes)}: ${r.action}${r.action === "timeout" && r.durationSeconds ? ` ${durationText(r.durationSeconds)}` : ""}`,
    )
    .join("; ");
}

/** Read only the expected keys from FormData, so extra fields are ignored rather than trusted. */
export function pick(form: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, form.get(k) ?? undefined]));
}

/** Human labels for history entries. */
export const FIELD_LABELS: Record<string, string> = {
  logChannelId: "Log channel",
  dmMembers: "DM members",
  appealText: "Appeal text",
  alertChannelId: "Alert channel",
  antiRaidEnabled: "Anti-raid",
  raidJoinCount: "Raid joins",
  raidWindowSeconds: "Raid window (s)",
  raidResponse: "On a raid",
  autoUnlockMinutes: "Auto-unlock (min)",
  flagAccountAgeDays: "Flag accounts under (days)",
  timezone: "Time zone",
  enabled: "Ranks",
  announce: "Level-ups",
  announceChannelId: "Level-up channel",
  channelId: "Ledger channel",
  retentionDays: "Keep events (days)",
  rules: "Escalation ladder",
};
