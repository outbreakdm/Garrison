import type { CaseAction } from "@garrison/db";
import { formatDuration } from "../../lib/duration.js";
import type { HierarchyProblem } from "./hierarchy.js";

/** Actions that target one member (everything except purge). */
export type MemberAction = Exclude<CaseAction, "purge">;

const verbs: Record<
  MemberAction,
  { base: string; past: string; noun: string; permission: string }
> = {
  warn: { base: "warn", past: "warned", noun: "Warning", permission: "Moderate Members" },
  timeout: { base: "time out", past: "timed out", noun: "Timeout", permission: "Moderate Members" },
  kick: { base: "kick", past: "kicked", noun: "Kick", permission: "Kick Members" },
  ban: { base: "ban", past: "banned", noun: "Ban", permission: "Ban Members" },
};

export const actionNoun = (action: CaseAction) =>
  action === "purge" ? "Purge" : verbs[action].noun;

/** Errors say what failed, why, and the fix, in one line. */
export function hierarchyError(problem: HierarchyProblem, action: MemberAction, target: string) {
  const v = verbs[action];
  switch (problem) {
    case "self":
      return `You can't ${v.base} yourself.`;
    case "bot":
      return `I can't ${v.base} myself. Remove Garrison from the server instead.`;
    case "owner":
      return `Nobody can ${v.base} the server owner.`;
    case "actor_below":
      return `You can't ${v.base} ${target}: their highest role is level with or above yours.`;
    case "bot_below":
      return `I can't ${v.base} ${target}: their highest role sits above mine. Drag Garrison above it in Server Settings → Roles.`;
    case "bot_missing_permission":
      return `I can't ${v.base} members: I'm missing ${v.permission}. Give Garrison that permission in Server Settings → Roles.`;
  }
}

/** Confirmation title, e.g. "Timeout applied to Kel for 1 h". */
export function confirmationTitle(
  action: MemberAction,
  targetName: string,
  durationSeconds?: number | null,
) {
  const forDuration = durationSeconds ? ` for ${formatDuration(durationSeconds)}` : "";
  return `${verbs[action].noun} applied to ${targetName}${forDuration}`;
}

/** Moderation DMs are neutral and factual: the action, the reason, how to appeal. No humor. */
export function dmTitle(action: MemberAction, guildName: string, durationSeconds?: number | null) {
  const forDuration = durationSeconds ? ` for ${formatDuration(durationSeconds)}` : "";
  const where = action === "warn" ? `in ${guildName}` : `from ${guildName}`;
  if (action === "timeout") return `You were timed out in ${guildName}${forDuration}`;
  if (action === "ban") return `You were banned from ${guildName}${forDuration}`;
  return `You were ${verbs[action].past} ${where}`;
}

export const DEFAULT_APPEAL_TEXT = "Contact the server's staff if you think this was a mistake.";

/** "3 warnings in 24 h". Windows up to two days read in hours, as moderators think of them. */
export function escalationReason(warnCount: number, windowMinutes: number) {
  const window =
    windowMinutes % 60 === 0 && windowMinutes <= 2880
      ? `${windowMinutes / 60} h`
      : formatDuration(windowMinutes * 60);
  return `${warnCount} warnings in ${window}`;
}

export const NO_REASON = "No reason given";

export function canUndo(action: CaseAction) {
  return action === "warn" || action === "timeout" || action === "ban";
}
