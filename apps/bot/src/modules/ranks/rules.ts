import { DANGEROUS_PERMISSIONS, permissionNames } from "../gatehouse/nuke.js";

export const XP_COOLDOWN_MS = 60_000;
export const XP_MIN = 15;
export const XP_MAX = 25;

export interface RoleFacts {
  id: string;
  name: string;
  managed: boolean;
  position: number;
  permissions: bigint;
}

export type RewardProblem = "everyone" | "managed" | "above_bot" | "dangerous";

/**
 * Can this role be a level reward? Never one with moderation or admin powers:
 * otherwise anyone could chat their way to them. Checked when a reward is set
 * and again every time it's granted, in case the role was edited since.
 */
export function rewardProblem(
  role: RoleFacts,
  everyoneId: string,
  botTop: number,
): RewardProblem | null {
  if (role.id === everyoneId) return "everyone";
  if (role.managed) return "managed";
  if ((role.permissions & DANGEROUS_PERMISSIONS) !== 0n) return "dangerous";
  if (role.position >= botTop) return "above_bot";
  return null;
}

export function rewardProblemText(problem: RewardProblem, role: RoleFacts) {
  switch (problem) {
    case "everyone":
      return "@everyone can't be a reward.";
    case "managed":
      return `<@&${role.id}> is managed by an integration, so I can't give it.`;
    case "dangerous":
      return `<@&${role.id}> has ${permissionNames(role.permissions & DANGEROUS_PERMISSIONS)}. Rewards can't carry moderation or admin powers: anyone could chat their way to them.`;
    case "above_bot":
      return `I can't give <@&${role.id}>: my role sits below it. Drag Garrison above it in Server Settings → Roles.`;
  }
}

/** Rewards earned at `level`: every reward at or below it. */
export const earnedRewards = <T extends { level: number }>(rewards: T[], level: number) =>
  rewards.filter((r) => r.level <= level);

/** A plain progress bar for embeds: "▰▰▰▱▱▱▱▱▱▱". */
export function progressBar(into: number, needed: number, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.floor((into / needed) * width)));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}
