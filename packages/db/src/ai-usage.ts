/**
 * What AI calls cost, and the limits that keep that cost inside what Pro brings
 * in (docs/ai-costs.md). Shared by the bot, which records every call, and the
 * dashboard, which shows a server's credits for the day.
 */

/**
 * Anthropic list prices, $ per 1M tokens (Haiku 5.5's rate for prompts up to 100K). Cache
 * reads have each model's own rate. Only a model listed here may run (isPricedModel), so a
 * call is never priced on a guess. Claude Sonnet 5 is here as Sonnet 5.5's refusal fallback.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};

/** The most expensive known model, for anything a call reports that isn't listed. */
const HIGHEST = { input: 4, output: 20, cacheRead: 0.4 };

/** A model's prices: an exact id first, then the longest listed id it starts with. */
function knownPrice(model: string) {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const prefix = Object.keys(MODEL_PRICES)
    .filter((id) => model.startsWith(id))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? MODEL_PRICES[prefix] : undefined;
}

/** Whether Garrison knows what this model costs, and so may call it. */
export const isPricedModel = (model: string) => knownPrice(model) !== undefined;

/** An unknown model is priced as the most expensive known one, so limits stay safe. */
export function priceFor(model: string) {
  return knownPrice(model) ?? HIGHEST;
}

/** Writing the prompt cache (5 minutes) costs 1.25x an input token. */
export const CACHE_WRITE_RATE = 1.25;

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
      (cache.read ?? 0) * p.cacheRead +
      outputTokens * p.output,
  );
}

/**
 * The most one request can cost: every input token at the cache-write rate (the highest
 * an input token is billed) and all `maxTokens` written. `attempts` is 2 when a refusal
 * fallback may run the request again on another model inside the same call.
 */
export const roundWorstMicros = (
  model: string,
  inputTokens: number,
  maxTokens: number,
  attempts = 1,
) => attempts * costMicros(model, 0, maxTokens, { write: inputTokens });

/**
 * The most output a request may write and still cost at most `micros`, with `inputTokens`
 * of input: what's left once the input is paid for at the cache-write rate. Never more than
 * the usual cap.
 */
export function outputThatFits(model: string, micros: number, inputTokens: number, attempts = 1) {
  const p = priceFor(model);
  const room = micros / attempts - inputTokens * p.input * CACHE_WRITE_RATE;
  return Math.max(0, Math.min(QM_MAX_OUTPUT_TOKENS, Math.floor(room / p.output)));
}

/**
 * What a message holds before it runs: rounds of the instructions, the server and the
 * conversation (6,500 to 12,000 tokens, docs/pricing.md) and the output cap. Only the hold:
 * the planner counts each request's real input first and fits it, and its output, inside
 * what's held (planner.ts), so a bigger server gets a shorter answer, never a bigger bill. A full
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
