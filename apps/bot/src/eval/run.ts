import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QM_MODELS, type QmModelChoice, qmHoldSupplies, qmTypicalSupplies } from "@garrison/db";
import { ClaudePlanner } from "../modules/quartermaster/planner.js";
import { CASES } from "./cases.js";
import { runEval, summarize } from "./harness.js";

/**
 * Runs the AI assistant's eval against the real Claude API. It costs money, so it says what
 * it would cost and stops unless given --yes.
 *
 *   pnpm --filter @garrison/bot eval                          # the cost, nothing run
 *   pnpm --filter @garrison/bot eval --yes                    # Fast and Smart, 3 runs each
 *   pnpm --filter @garrison/bot eval --models fast --reps 1 --yes
 *   pnpm --filter @garrison/bot eval --cases edit-rename,refusal-ban --yes
 *
 * Needs ANTHROPIC_API_KEY (the repo's .env is read). Writes results.jsonl, errors.jsonl and
 * summary.md to apps/bot/eval-results/<time>/.
 */

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const models = (flag("models") ?? "fast,smart")
  .split(",")
  .filter((m): m is QmModelChoice => m in QM_MODELS);
const reps = Math.max(1, Math.min(10, Number(flag("reps") ?? 3)));
const only = flag("cases")?.split(",");
const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
if (!models.length || !cases.length) {
  console.error("Nothing to run: check --models (fast, smart) and --cases.");
  process.exit(1);
}

const calls = cases.length * reps;
const dollars = (supplies: number) => `$${((supplies * calls) / 1000).toFixed(2)}`;
console.log(
  `${cases.length} cases × ${reps} runs on ${models.map((m) => QM_MODELS[m].label).join(" and ")}:`,
);
for (const m of models)
  console.log(
    `  ${QM_MODELS[m].label}: about ${dollars(qmTypicalSupplies(QM_MODELS[m].id))}, at most ${dollars(qmHoldSupplies(QM_MODELS[m].id, 3))}`,
  );
if (!args.includes("--yes")) {
  console.log("Nothing was sent. Add --yes to run it.");
  process.exit(0);
}
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("Set ANTHROPIC_API_KEY (in the repo's .env) to run the eval.");
  process.exit(1);
}

const planners = Object.fromEntries(
  models.map((m) => [m, new ClaudePlanner(key, QM_MODELS[m].id)]),
);
let done = 0;
const total = calls * models.length;
const { rows, errors } = await runEval(planners, cases, reps, {
  onDone: (r) => {
    done++;
    const what = "row" in r ? (r.row.grade.pass ? "pass" : "fail") : `error (${r.error.kind})`;
    const c = "row" in r ? r.row : r.error;
    console.log(`[${done}/${total}] ${QM_MODELS[c.model].label} ${c.case} #${c.rep}: ${what}`);
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../eval-results", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "results.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n"));
writeFileSync(join(out, "errors.jsonl"), errors.map((e) => JSON.stringify(e)).join("\n"));
const summary = summarize(rows, errors, cases);
writeFileSync(join(out, "summary.md"), summary);
console.log(`\n${summary}\nSaved to ${out}`);
