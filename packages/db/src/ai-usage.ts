/**
 * What AI calls cost, and the limits that keep that cost inside what Pro brings
 * in (docs/ai-costs.md). Shared by the bot, which records every call, and the
 * dashboard, which shows a server's credits for the day.
 */

/** Anthropic list prices, $ per 1M tokens (Haiku 5.5's rate for prompts up to 100K). */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** An unknown model is priced as the most expensive known one, so limits stay safe. */
export function priceFor(model: string) {
  const known = Object.entries(MODEL_PRICES).find(([id]) => model.startsWith(id));
  return known?.[1] ?? { input: 4, output: 20 };
}

/** Millionths of a dollar: tokens × $/1M tokens is exactly that. */
export function costMicros(model: string, inputTokens: number, outputTokens: number) {
  const p = priceFor(model);
  return Math.ceil(inputTokens * p.input + outputTokens * p.output);
}

/** Quartermaster's ceiling on one call: the largest snapshot, and the output cap. */
export const QM_MAX_INPUT_TOKENS = 6000;
export const QM_MAX_OUTPUT_TOKENS = 4000;

/** Held against the day's budget while a call runs, before its real cost is known. */
export const qmReserveMicros = (model: string) =>
  costMicros(model, QM_MAX_INPUT_TOKENS, QM_MAX_OUTPUT_TOKENS);

/** Attempts per server per hour, failed ones included, so failures can't run up a bill. */
export const QM_ATTEMPTS_PER_HOUR = 10;

/** The default spend cap for all servers together, per UTC day. */
export const QM_DEFAULT_DAILY_BUDGET_USD = 5;

/** Midnight UTC at the start of `now`'s day: credits and the budget reset then. */
export function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcDayStart(now = new Date()) {
  return new Date(utcDayStart(now).getTime() + 86_400_000);
}
