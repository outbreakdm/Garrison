import { costMicros, QM_MODELS, type QmModelChoice, qmHoldSupplies } from "@garrison/db";
import { MAX_OPERATIONS } from "../modules/quartermaster/plan.js";
import type { Planner, PlannerUsage } from "../modules/quartermaster/planner.js";
import type { Answer, EvalCase } from "./cases.js";
import { readFixture, SERVER_INPUT } from "./fixture.js";
import { type Grade, grade } from "./grade.js";

/**
 * Runs eval cases through the AI assistant's real entry point (Planner.chat, with the real
 * instructions, tools, schema and the same per-message hold as production) against the
 * Ironclad fixture, and grades each answer. A call that produced no answer to grade (an API
 * error, a timeout, the wrong model serving) is an error, kept apart from the results.
 */

export interface Row {
  case: string;
  category: string;
  model: QmModelChoice;
  rep: number;
  seconds: number;
  usage: PlannerUsage | null;
  costMicros: number;
  reads: string[];
  grade: Grade;
  reply: string;
  plan: Answer["plan"];
}

export interface ErrorRow {
  case: string;
  model: QmModelChoice;
  rep: number;
  /** "api" (an error from the API or the hold), "timeout", "wrong-model" or "declined". */
  kind: string;
  error: string;
  costMicros: number;
}

const DECLINED = /declined/i;
const SLOW = /took too long/i;

/** One case, once, on one model. */
export async function runCase(
  planner: Planner,
  choice: QmModelChoice,
  c: EvalCase,
  rep: number,
): Promise<{ row: Row } | { error: ErrorRow }> {
  if (!planner.chat) throw new Error("This planner can't chat.");
  const model = QM_MODELS[choice].id;
  const started = performance.now();
  const out = await planner.chat({
    ...SERVER_INPUT,
    history: [...(c.history ?? []), { role: "user", text: c.ask }],
    read: readFixture,
    maxOperations: MAX_OPERATIONS,
    // What a full message holds in production.
    budgetMicros: qmHoldSupplies(model, 3) * 1000,
  });
  const seconds = (performance.now() - started) / 1000;
  const spent = out.usage ? (out.usage.costMicros ?? priced(out.usage)) : 0;
  if (!out.ok) {
    const kind = DECLINED.test(out.error) ? "declined" : SLOW.test(out.error) ? "timeout" : "api";
    return { error: { case: c.id, model: choice, rep, kind, error: out.error, costMicros: spent } };
  }
  // A score from the wrong model measures nothing.
  if (!out.model.startsWith(model))
    return {
      error: {
        case: c.id,
        model: choice,
        rep,
        kind: "wrong-model",
        error: `asked for ${model}, served by ${out.model}`,
        costMicros: spent,
      },
    };
  const answer: Answer = { reply: out.reply, plan: out.plan };
  return {
    row: {
      case: c.id,
      category: c.category,
      model: choice,
      rep,
      seconds,
      usage: out.usage ?? null,
      costMicros: spent,
      reads: out.reads ?? [],
      grade: grade(c, answer),
      reply: out.reply,
      plan: out.plan,
    },
  };
}

const priced = (u: PlannerUsage) =>
  costMicros(u.model, u.inputTokens, u.outputTokens, {
    read: u.cacheReadTokens,
    write: u.cacheWriteTokens,
  });

/** Every case × rep × model, a few at a time. */
export async function runEval(
  planners: Partial<Record<QmModelChoice, Planner>>,
  cases: EvalCase[],
  reps: number,
  opts: { concurrency?: number; onDone?: (r: { row: Row } | { error: ErrorRow }) => void } = {},
) {
  const jobs: [QmModelChoice, EvalCase, number][] = [];
  for (const [choice, planner] of Object.entries(planners) as [QmModelChoice, Planner][])
    if (planner)
      for (const c of cases) for (let rep = 1; rep <= reps; rep++) jobs.push([choice, c, rep]);
  const rows: Row[] = [];
  const errors: ErrorRow[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [choice, c, rep] = jobs[next++] as (typeof jobs)[number];
      const r = await runCase(planners[choice] as Planner, choice, c, rep);
      if ("row" in r) rows.push(r.row);
      else errors.push(r.error);
      opts.onDone?.(r);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  return { rows, errors };
}

/** A mean and its 95% interval (normal approximation), as "82% ±6". */
function pct(values: boolean[]) {
  if (!values.length) return "–";
  const p = values.filter(Boolean).length / values.length;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / values.length);
  return `${Math.round(p * 100)}% ±${Math.round(half * 100)}`;
}
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};

/** The report: per model, overall and per property, per category, cost and time, failures. */
export function summarize(rows: Row[], errors: ErrorRow[], cases: EvalCase[]) {
  const models = [...new Set([...rows.map((r) => r.model), ...errors.map((e) => e.model)])];
  const lines: string[] = ["# AI assistant eval", ""];
  lines.push(
    "| Model | Pass | Drafted right | Valid | On task | Safe | Errors | $/message | p50 s | p90 s | Total $ |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const m of models) {
    const r = rows.filter((x) => x.model === m);
    const e = errors.filter((x) => x.model === m);
    const cost =
      (r.reduce((n, x) => n + x.costMicros, 0) + e.reduce((n, x) => n + x.costMicros, 0)) / 1e6;
    const secs = r.map((x) => x.seconds);
    lines.push(
      `| ${QM_MODELS[m].label} | ${pct(r.map((x) => x.grade.pass))} | ${pct(r.map((x) => x.grade.drafted))} | ${pct(
        r.filter((x) => x.grade.valid !== null).map((x) => x.grade.valid as boolean),
      )} | ${pct(r.map((x) => x.grade.onTask))} | ${pct(r.map((x) => x.grade.safe))} | ${e.length} | ${(
        cost / Math.max(1, r.length + e.length)
      ).toFixed(
        4,
      )} | ${quantile(secs, 0.5).toFixed(1)} | ${quantile(secs, 0.9).toFixed(1)} | ${cost.toFixed(3)} |`,
    );
  }
  const categories = [...new Set(cases.map((c) => c.category))];
  lines.push(
    "",
    "## By category",
    "",
    `| Category | ${models.map((m) => QM_MODELS[m].label).join(" | ")} |`,
  );
  lines.push(`| --- | ${models.map(() => "---").join(" | ")} |`);
  for (const cat of categories)
    lines.push(
      `| ${cat} | ${models.map((m) => pct(rows.filter((x) => x.model === m && x.category === cat).map((x) => x.grade.pass))).join(" | ")} |`,
    );
  const failed = rows.filter((r) => !r.grade.pass);
  if (failed.length) {
    lines.push("", "## Failures", "");
    for (const f of failed)
      lines.push(
        `- **${f.case}** (${QM_MODELS[f.model].label}, run ${f.rep}): ${f.grade.reasons.join("; ")}`,
      );
  }
  if (errors.length) {
    lines.push("", "## Errors (not graded)", "");
    for (const e of errors)
      lines.push(
        `- **${e.case}** (${QM_MODELS[e.model].label}, run ${e.rep}): ${e.kind}: ${e.error}`,
      );
  }
  return `${lines.join("\n")}\n`;
}
