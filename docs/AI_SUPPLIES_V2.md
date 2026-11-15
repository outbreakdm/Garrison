# Supplies v2: a hard ceiling on AI cost, and supply packs

Proposed 2026-11-15. Not built. Goal: however hard a server uses the AI assistant, its AI
bill stays **under half of what it pays us**, so the other half covers hosting, Stripe,
disputes and a price change at Anthropic. Measured costs are in `docs/pricing.md`.

## Why today's model can't promise that

Today a message costs a flat 3 supplies whatever it really costs, and supplies reset daily
(Free 40, Pro 300, Agency 400 per server). A message's real cost varies about 6x: $0.0026 on
average, up to about $0.016 when it looks at settings in 4 rounds and every round writes the
most it's allowed. A flat price can't bound a cost that varies like that, and a daily
allowance multiplies by 30 into a month nobody could be charged for:

| Plan | Net a month (yearly billing) | Worst case today |
|---|---|---|
| Pro | $6.45 | $48.00 |
| Agency | $28.30 | $319.20 |
| Free, per person | $0 | $6.24 |

## The proposal

### 1. A supply is worth a fixed amount of AI: $0.001

Messages are charged by what they really cost, rounded up: **1 supply per $0.001 of AI**
(`QM_MICROS_PER_SUPPLY = 1000`). A typical message ($0.0026) is 3 supplies, the same as
today, so nothing changes for normal use. A message that reads settings first is about 4.
A message can never cost more than the supplies it was charged, so **supplies become a
dollar ceiling**: a pool of N supplies can never cost more than N × $0.001 in AI.

- **Before a message runs**, the bot holds the most it could cost (see 3) and refuses if the
  pool can't cover it. **After**, it charges what was used and gives the rest back. The
  reply shows "used 3 supplies".
- **Changes still cost 1 supply each.** They cost no AI, so they only make the ceiling
  safer, and they keep a plan's size honest (a full plan is still about 23).
- **Failed calls cost what they used** (today: nothing). A failure still costs us the tokens;
  under a ceiling we can't give those back. Refusals by Garrison's own checks (an unsafe plan)
  still cost nothing, because those are our rules, not the admin's.
- **Cheaper calls give admins more.** Prompt caching and lower reasoning effort (pricing.md,
  levers 1 and 3) cut the real cost, and with metering the savings go straight to admins as
  more messages, without touching the ceiling.

### 2. A monthly pool instead of a daily allowance

Setting up a server is bursty: a lot on day one, little after. A monthly pool fits that and
has the same worst case as a daily allowance of a thirtieth of it.

| Plan | Pool | Worst-case AI | Share of net (monthly / yearly billing) | That's about |
|---|---|---|---|---|
| Free | 200 a month per person, across their Free servers | $0.20 | n/a | 65 messages, or 8 full plans |
| Pro | 3,000 a month per server | $3.00 | 36% / 47% | 1,000 messages, or 130 full plans |
| Agency | 13,000 a month shared by its 5 servers | $13.00 | 39% / 46% | 4,300 messages, or 565 full plans |

- **Paid pools follow the billing period** (`current_period_end`, a month at a time for yearly
  plans too), so subscribing on the 30th doesn't get two pools in two days. Free resets on
  the 1st (UTC).
- **Compared with today:** Pro's 300 a day was at most 3,000 messages a month; real servers
  send a few dozen. 1,000 a month covers any real setup and leaves the ceiling at 47%.

### 3. A message's own ceiling

Make the hold small and exact:

- **At most 3 rounds a message** (today 4): one or two looks at settings, then the answer.
- **The hold is 13 supplies**: 3 rounds × (12,000 input tokens at $0.10/M + 6,000 output at
  $0.50/M) = $0.0126. `QM_MAX_INPUT_TOKENS` goes from 6,000 to 12,000, because a round now
  takes 6,500 to 12,000 (pricing.md), and the global budget hold uses the same figure.
- **Near the end of a pool** (fewer than 13 left, 4 or more): the message runs as a quick
  answer, one round, no looks, with its output capped to what's left. Below 4: "out of
  supplies", with a link to buy a pack.

### 4. Supply packs

One-time purchases for a server, used after the month's pool runs out.

| Pack | Price | Stripe (2.9% + $0.30) | Net | Worst-case AI | Share | That's about |
|---|---|---|---|---|---|---|
| Small | 1,000 supplies, $2.99 | $0.39 | $2.60 | $1.00 | 38% | 330 messages |
| Large | 5,000 supplies, $11.99 | $0.65 | $11.34 | $5.00 | 44% | 1,650 messages |

- **For any server, Free included.** A Free server can top up without subscribing. Per
  supply a pack costs about what Pro does ($0.0026 net against Pro's $0.0021 to $0.0028), so
  packs don't undercut Pro, and Pro still brings 3,000 a month plus everything else in Pro.
- **Bought on the server's Plan page** through Stripe Checkout in payment mode, the same
  account and webhook as subscriptions. Fulfilled only from the webhook
  (`checkout.session.completed` with `payment_status: paid`, and
  `checkout.session.async_payment_succeeded`), never from the success page. One
  `supply_grants` row per purchase, keyed by the Checkout Session id so a webhook retried by
  Stripe can't grant twice.
- **Valid 12 months**, used oldest first, after the monthly pool.
- **Refunds:** an unused pack within 14 days, in full. Once used, the AI it paid for can't be
  given back, the same rule as subscriptions.
- **Tax** goes through the same setup as subscriptions (the pending Managed Payments decision
  in the Roadmap applies to packs too).

### 5. Safety nets that stay

- **The hourly limits** per server (40 chat messages, 10 plans) stop a runaway script.
- **The global daily budget** stays as a circuit breaker, not an allowance. Set it so normal
  use can't trip it: $2 plus, for each paying server, three times its average daily pool
  value (Pro: 3 × $3.00 / 30 = $0.30 a day). With 100 Pro servers, $32 a day.
- **Abuse:** a pack bought with a stolen card and spent at once is a chargeback of the price
  plus $15 in Stripe fees, while the AI cost is capped at 38 to 44% of the price. Stripe
  Radar blocks most of these; packs can be held to one purchase a day per server if that
  ever happens.

## What it costs Garrison at most, all together

- A Pro server, everything maxed, every month: **$3.00** of AI on $6.45 to $8.43 net.
- An Agency: **$13.00** on $28.30 to $33.68 net.
- Every pack: **at most 44%** of what it brings in.
- Free: **$0.20 per active person** a month, plus the circuit breaker.

## What changes for admins

- The rail and the supplies bar under the chat show **this month's** supplies, packs on top,
  and when the pool renews.
- Each reply says what it used ("used 3 supplies").
- A "Buy supplies" button where the supplies bar says you're low or out.
- Plan cards, the landing page and Plan page lines: "3,000 AI supplies a month, about 1,000
  messages", and the Refund Policy counts supplies against Free's monthly 200.

## Building it (for when it's approved)

1. **Metering:** `ai_usage` gains `supplies` (the charge), the hold logic moves from a flat 3
   to the 13-supply hold and charge-what-was-used, rounds 4 → 3, `QM_MAX_INPUT_TOKENS` 12,000.
   *Medium.*
2. **Monthly pools:** count supplies used since the period start (paid) or the 1st (Free);
   new constants in `plans.ts`; rail, bar, landing, Plan page, Refund Policy and pricing
   updated. *Medium.*
3. **Packs:** `supply_grants` table and migration, two Stripe prices, Checkout in payment
   mode, webhook fulfilment, the Buy button. *Medium.*
4. **Prompt caching** (pricing.md lever 1), independent and free. *Small.*

Open questions for the owner:

- The pool sizes and pack prices above (they're set for at most 50% of net; more generous
  pools mean a higher share).
- Whether Free servers may buy packs, or packs are Pro and Agency only.
- Whether a failed call should cost what it used (proposed) or stay free (today), which
  leaves a small amount outside the ceiling.
