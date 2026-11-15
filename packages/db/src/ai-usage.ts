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

/** Writing the prompt cache costs 1.25x an input token; reading it back costs 0.1x. */
export const CACHE_WRITE_RATE = 1.25;
export const CACHE_READ_RATE = 0.1;

/**
 * Millionths of a dollar: tokens × $/1M tokens is exactly that. `inputTokens` is the
 * uncached input; cached input is priced at the cache's own rates.
 */
export function costMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: { read?: number; write?: number } = {},
) {
  const p = priceFor(model);
  return Math.ceil(
    inputTokens * p.input +
      (cache.write ?? 0) * p.input * CACHE_WRITE_RATE +
      (cache.read ?? 0) * p.input * CACHE_READ_RATE +
      outputTokens * p.output,
  );
}

/**
 * The AI assistant's ceiling on one round with the model: the instructions, the server and
 * the conversation (6,500 to 12,000 tokens, docs/pricing.md), and the output cap. A full
 * 20-change plan with a topic on every channel is about 2,500 tokens, plus reasoning.
 */
export const QM_MAX_INPUT_TOKENS = 12_000;
export const QM_MAX_OUTPUT_TOKENS = 6000;

/** The most one round can cost: every input token written to the cache, and the output cap. */
export const qmReserveMicros = (model: string) =>
  costMicros(model, 0, QM_MAX_OUTPUT_TOKENS, { write: QM_MAX_INPUT_TOKENS });

/**
 * A supply is a fixed amount of AI: $0.001. A message is charged what it really cost,
 * rounded up, so a pool of N supplies can never cost more than N × $0.001
 * (docs/AI_SUPPLIES_V2.md). A change a plan makes is 1 more, and costs no AI.
 */
export const QM_MICROS_PER_SUPPLY = 1000;
export const suppliesFor = (micros: number) =>
  Math.ceil(Math.max(0, micros) / QM_MICROS_PER_SUPPLY);

/** What a message holds while it runs: the most its rounds can cost. */
export const qmHoldSupplies = (model: string, rounds: number) =>
  suppliesFor(qmReserveMicros(model) * rounds);

/** The fewest supplies a message can run on: one round with a short answer. */
export const QM_MIN_MESSAGE_SUPPLIES = 4;

/**
 * The output a one-round answer may write and still cost at most `supplies`, for a message
 * near the end of a pool. Never more than the usual cap.
 */
export function quickOutputTokens(model: string, supplies: number) {
  const p = priceFor(model);
  const room = supplies * QM_MICROS_PER_SUPPLY - QM_MAX_INPUT_TOKENS * p.input * CACHE_WRITE_RATE;
  return Math.max(0, Math.min(QM_MAX_OUTPUT_TOKENS, Math.floor(room / p.output)));
}

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

/** The 1st of `now`'s month, midnight UTC: Free's pool renews then. */
export function utcMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextUtcMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * `anchor` moved by whole months, keeping its day and time; a day the month doesn't have
 * becomes its last day (the 31st is the 30th in April), as Stripe bills.
 */
export function addMonths(anchor: Date, months: number) {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(anchor.getUTCDate(), last),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/**
 * The month of a billing period that `now` falls in, from any date the period renews on
 * (its end, say). A yearly plan's pool renews a month at a time on the same day.
 */
export function billingMonth(anchor: Date, now = new Date()) {
  let k =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  while (addMonths(anchor, k) > now) k--;
  while (addMonths(anchor, k + 1) <= now) k++;
  return { start: addMonths(anchor, k), resetsAt: addMonths(anchor, k + 1) };
}
