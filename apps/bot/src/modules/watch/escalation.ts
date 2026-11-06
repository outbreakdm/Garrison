import type { EscalationRule } from "@garrison/db";

export type RuleLike = Pick<
  EscalationRule,
  "warnCount" | "windowMinutes" | "action" | "durationSeconds"
>;

/**
 * Pick the rule a new warning triggers. A rule fires when the member's active
 * warnings inside its window reach exactly its threshold, so it fires once as
 * the count crosses it, not again on every later warning. When several rules
 * fire together, the one with the highest threshold wins.
 */
export function pickEscalation<R extends RuleLike>(
  rules: R[],
  activeWarnings: (windowMinutes: number) => number,
): R | null {
  let best: R | null = null;
  for (const rule of rules) {
    if (rule.action === "timeout" && !rule.durationSeconds) continue;
    if (activeWarnings(rule.windowMinutes) !== rule.warnCount) continue;
    if (!best || rule.warnCount > best.warnCount) best = rule;
  }
  return best;
}
