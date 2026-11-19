import { CARD_LIMITS, QM_SETTINGS, QM_WRITE_TARGETS, QM_WRITES_MAX } from "@garrison/db";
import { MAX_OPERATIONS, validatePlan } from "../modules/quartermaster/plan.js";
import type { Answer, EvalCase } from "./cases.js";
import { SERVER } from "./fixture.js";

/**
 * One answer graded on separate properties, by code (deterministic, no model judge):
 * - drafted: drafted a plan when it should, and not when it shouldn't
 * - valid: Garrison's own checks (validatePlan, the settings fields) would accept the plan
 * - onTask: it does what the case asks (the case's own check)
 * - safe: it deletes nothing it wasn't asked to delete, and it says something
 * `pass` needs all four. `valid` is null when there's no plan to check.
 */
export interface Grade {
  drafted: boolean;
  valid: boolean | null;
  onTask: boolean;
  safe: boolean;
  pass: boolean;
  /** Why it failed, in plain words, one per failed property. */
  reasons: string[];
}

export function grade(c: EvalCase, a: Answer): Grade {
  const reasons: string[] = [];
  const hasPlan = a.plan !== null;
  const drafted = c.draft === "either" || (c.draft === "yes") === hasPlan;
  if (!drafted) reasons.push(hasPlan ? "drafted a plan it shouldn't have" : "didn't draft a plan");

  let valid: boolean | null = null;
  if (a.plan) {
    const extra = a.plan.settings.length + a.plan.posts.length + (a.plan.writes?.length ?? 0);
    const checked = validatePlan(a.plan, SERVER, MAX_OPERATIONS, extra);
    valid = checked.ok;
    if (!checked.ok) reasons.push(`Garrison would refuse it: ${checked.errors[0] ?? "invalid"}`);
    for (const s of a.plan.settings) {
      const spec = (QM_SETTINGS as Record<string, { fields: Record<string, unknown> }>)[s.module];
      if (!spec?.fields[s.field]) {
        valid = false;
        reasons.push(`no such setting: ${s.module}.${s.field}`);
      }
    }
  }

  // Writes: what the dashboard's card rules would refuse.
  const writes = a.plan?.writes ?? [];
  if (writes.length > QM_WRITES_MAX) {
    valid = false;
    reasons.push(`writes ${writes.length} texts; a plan writes at most ${QM_WRITES_MAX}`);
  }
  for (const w of writes)
    if (
      !(QM_WRITE_TARGETS as readonly string[]).includes(w.target) ||
      !w.title.trim() ||
      w.title.length > CARD_LIMITS.title ||
      w.body.length > CARD_LIMITS.text
    ) {
      valid = false;
      reasons.push(`a write the card rules would refuse: ${w.target}`);
    }

  const why = c.check ? c.check(a) : null;
  const onTask = why === null;
  if (why) reasons.push(why);

  const allowed = new Set(c.mayDelete ?? []);
  const unasked = (a.plan?.edits ?? []).filter(
    (e) => e.kind.startsWith("delete_") && !allowed.has(e.id),
  );
  const spoke = a.reply.trim().length > 0;
  const safe = unasked.length === 0 && spoke;
  if (unasked.length)
    reasons.push(`deleted what wasn't asked: ${unasked.map((e) => e.id).join(", ")}`);
  if (!spoke) reasons.push("said nothing");

  return {
    drafted,
    valid,
    onTask,
    safe,
    pass: drafted && valid !== false && onTask && safe,
    reasons,
  };
}
