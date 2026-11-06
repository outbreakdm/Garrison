import type { MemberAction } from "./copy.js";

export interface HierarchyInput {
  action: MemberAction;
  actorId: string;
  botId: string;
  ownerId: string;
  targetId: string;
  /** Position of each member's highest role. Null when the target is not in the server. */
  actorTop: number;
  botTop: number;
  targetTop: number | null;
  /** Whether Garrison holds the Discord permission this action needs. */
  botHasPermission: boolean;
}

export type HierarchyProblem =
  | "self"
  | "bot"
  | "owner"
  | "actor_below"
  | "bot_below"
  | "bot_missing_permission";

/**
 * Decide whether `actor` may apply `action` to `target`, and whether Garrison
 * can carry it out. Mirrors Discord's own rules so we can explain a refusal
 * before Discord returns "Missing Permissions".
 */
export function checkHierarchy(input: HierarchyInput): HierarchyProblem | null {
  if (input.action !== "warn" && !input.botHasPermission) return "bot_missing_permission";
  if (input.targetId === input.actorId) return "self";
  if (input.targetId === input.botId) return "bot";
  if (input.targetId === input.ownerId) return "owner";
  if (input.targetTop === null) return null;
  if (input.actorId !== input.ownerId && input.targetTop >= input.actorTop) return "actor_below";
  if (input.action !== "warn" && input.targetTop >= input.botTop) return "bot_below";
  return null;
}
