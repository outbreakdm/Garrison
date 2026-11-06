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
};
