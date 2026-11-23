# Pricing: Free, Pro and Agency

Proposed 2026-11-13. Every price lives in one place, `PRICING` in `packages/db/src/plans.ts`;
the landing page, the Plan page and the account page all read it. Until checkout is set up
(`billingReady()` in `apps/web/lib/billing.ts`), the Plan page has no buy buttons and says
checkout isn't available; the landing page always shows release pricing.

## The three plans

| | Free | Pro | Agency |
|---|---|---|---|
| Servers | Any number | 1 server | Up to 5 servers, moved between them any time |
| Monthly | $0 | **$8.99** | **$34.99** ($7.00 a server) |
| Yearly | $0 | **$89.99** (save 17%; $79.99 until 2026-11-23) | **$349.99** ($5.83 a server a month) |
| Safety (moderation, anti-raid, anti-nuke, verification, logs) | Everything | Everything | Everything |
| AI builder supplies a day (a message costs 3, each change a plan makes costs 1) | 40 per person, across all their Free servers (and 40 per server) | 300 | 400 on each server |
| That's about | 1 full plan, or 13 messages | 13 full plans, or 100 messages | 17 full plans, or 133 messages |
| Everything in the Free and Pro table | Free column | Pro column | Pro column, on every seat |

Agency is the same Pro on each server. What it sells is the bundle price and one place to
manage it: the owner of the subscription (a Discord user) puts any server they manage into one
of the 5 seats from that server's Plan page, and takes it out again. A seat moves instantly;
nothing set up on a server is lost when it leaves a seat (it pauses, as with any downgrade).

## Why Pro at $8.99 is worth it

Garrison Pro does the work of several paid bots at once. Comparable single-purpose subscriptions
(researched 2026-11-12, approximate): Ticket Tool $7.99, Apollo $7.99, MEE6 about $11.99,
Arcane about $7, Sesh $5 to $6.99, Dyno about $4.99 to $5.99, Carl-bot $3.99 to $7.99. A gaming
server that pays for tickets, role menus with branding, a leveling bot with custom rank cards,
stream alerts and an event bot spends $20 to $35 a month. Pro covers all of it for $8.99, plus
the things none of them have: the AI builder, server templates, raids with attendance, and
roles that follow game stats.

At $5.99 Pro looked cheap next to MEE6 and Ticket Tool; at $8.99 it still undercuts any two of
them together. Below $8 it reads as a hobby add-on; above $10 it competes with MEE6 head on.

## Does it pay for AI?

AI is the only cost that grows with use (`docs/ai-costs.md`). Since supplies v2 (2026-11-15,
`docs/AI_SUPPLIES_V2.md`) the AI assistant runs on **supplies** from a monthly pool
(`AI_SUPPLIES_PER_MONTH` in `packages/db/src/plans.ts`): Free 100 per person (200 until 2026-11-20; Fast only), Pro 2,500 per
server, Agency 11,000 shared (3,000 and 13,000 until 2026-11-20). A supply is $0.001 of AI:
every AI call is charged what it really cost, rounded up, and every change a plan makes costs
1\. So a pool can never cost more than its size in tenths of a cent, whatever the use.

**Both models cost the same per supply.** Fast (Claude Haiku 5.5, $0.10/$0.50 per million
tokens) and Smart (Claude Sonnet 5.5, $2/$10) are each charged at their own real price, so a
pool's worst-case AI is the same on either; Smart just uses a pool about 20 to 25 times faster.
Measured in production (2026-11-20): a Fast message costs about $0.002 to $0.003 (2 to 3
supplies); a Smart one about $0.045 to $0.075 (45 to 75), so 2,500 supplies is roughly 800
Fast messages or 35 to 55 Smart ones. The plan cards say supplies only; the picker under the
chat shows messages left for the mode chosen.

**Target: at least 50% margin, worst case, before hosting.** Margin is what's left of the
price after Stripe (2.9% + $0.30 a charge) and every supply spent on AI. Set 2026-11-20 at
59% or more, leaving about 9 points for hosting, Stripe Managed Payments (an extra fee if kept
on) and disputes:

| Plan or pack | Price | After Stripe | Worst-case AI | Margin |
|---|---|---|---|---|
| Pro monthly | $8.99 | $8.43 | $2.50 | 66% |
| Pro yearly | $7.50/mo | $7.26/mo | $2.50 | 63% (59% at $79.99) |
| Agency monthly | $34.99 | $33.68 | $11.00 | 65% |
| Agency yearly | $29.17/mo | $28.30/mo | $11.00 | 59% |
| Pack, 800 supplies | $2.99 | $2.60 | $0.80 | 60% |
| Pack, 4,000 supplies | $11.99 | $11.34 | $4.00 | 61% |
| Free, a month per person | $0 | $0 | $0.10 | n/a |

Before this (3,000 and 13,000, packs of 1,000 and 5,000) yearly plans sat at 52%, and the
packs at 53 to 54%. The pool sizes are the lever; the price per supply never changes.

A message holds the most it can cost while it runs (Fast 14 supplies, Smart 270: 3 rounds of
12,000 tokens in at the cache-write rate and 6,000 out) and gives back what it didn't use.
Failed calls are charged what they used, and so is a message whose plan Garrison's checks
refuse (its changes cost nothing, since nothing is built): until 2026-11-20 those were free,
which let a pool spend AI it never counted, up to $0.27 a Smart message and 40 messages an
hour. Discarded and expired plans give their changes back. Pack sizes go on the Checkout
session, so a pack bought just before a change gets what its page said. The tables below are
from before supplies v2, when supplies were daily and a message was a flat 3; they show why
the ceiling was needed.

### What a message really costs (measured 2026-11-15)

Claude Haiku 5.5 is $0.10 per million input tokens and $0.50 per million output tokens. From
production `ai_usage` (7 calls so far, all drafting a plan) and a capture of the request the
bot sends today:

- **Every call carries about 6,000 to 6,500 tokens before the conversation:** the
  instructions (~3,000, including the list of settings it may change), the structured-output
  schema (~1,200), the server snapshot (~1,300 for 40 channels and 25 roles) and the two read
  tools (~700). The conversation adds to that. The one call since the 2026-11-15 deploy used
  9,264 input tokens; earlier chat calls used 4,800 to 6,100.
- **Output is most of the bill.** Chat calls averaged 3,906 output tokens (mostly the model's
  reasoning, then the JSON answer), $0.0020 of an average $0.0026 a call: about 75%.

| A message that… | Rounds | Cost |
|---|---|---|
| Drafts or revises a plan (measured average) | 1 | $0.0026 (highest seen $0.0032) |
| Looks at settings, then answers or drafts (estimate) | 2 | about $0.004 |
| Worst case: 4 rounds, each at the 6,000-token output cap | 4 | about $0.016 |

Supplies cap messages at a third of the day's supplies. A server that spends every supply on
messages every day for a month costs:

| Plan | Messages a day | Typical ($0.0026) | Worst case ($0.016) |
|---|---|---|---|
| Free, per person | 13 | $1.01 | $6.24 |
| Pro | 100 | $7.80 | $48.00 |
| Agency (5 servers) | 665 | $51.87 | $319.20 |

After Stripe (2.9% + $0.30 a charge), monthly billing:

| Plan | Net | Typical at full use | Left | Worst case | Left |
|---|---|---|---|---|---|
| Pro monthly | $8.43 | $7.80 | **$0.63** | $48.00 | **-$39.57** |
| Pro yearly | $6.45/mo | $7.80 | **-$1.35** | $48.00 | **-$41.55** |
| Agency monthly | $33.68 | $51.87 | **-$18.19** | $319.20 | **-$285.52** |
| Agency yearly | $28.30/mo | $51.87 | **-$23.57** | $319.20 | **-$290.90** |

"Full use" means every supply spent on messages, every day, all month, which nobody does: an
admin who sends 20 messages on 10 days of the month costs about $0.52. But at full use even
typical messages now cost about what Pro brings in, so the levers below matter more than
before. The global cap (`QM_DAILY_BUDGET_USD`, $5 a day) is about 1,900 typical messages a
day across all servers, and it pauses the assistant for everyone when it's reached.

**Measured with supplies v2 and caching (2026-11-15, production, a Pro server):**

| Message | Uncached in | Cache written | Cache read | Out | Cost | Charged |
|---|---|---|---|---|---|---|
| "What's missing on my server?" (looked at settings, 2 rounds) | 6 | 8,823 | 7,815 | 487 | $0.0014 | 2 supplies |
| A staff-and-logs plan, 4 changes (1 round) | 4 | 448 | 7,517 | 1,189 | $0.0007 | 1 supply |

With caching, the instructions, tools and earlier rounds come back from the cache at a tenth
of the price, so a message now costs a quarter to a half of the $0.0026 measured before.

**Levers, cheapest first:**

1. **Prompt caching** (free, no quality change). The instructions, schema and tools (~4,900
   tokens) are the same on every call and come first, so they can be cached and re-read at a
   tenth of the price for 5 minutes, across all servers. About 15 to 20% off a one-round
   message and more on messages that look at settings first, and replies start sooner.
   **Built** (supplies v2 step 4): the instructions are a cached block, and a message that
   looks at settings also caches its rounds. Under metering the savings go to admins as more
   messages. Not yet checked against the real API: `ai_usage.cache_read_tokens` should be
   above zero on the second message within 5 minutes.
2. **A correct budget hold.** **Built** (supplies v2): `QM_MAX_INPUT_TOKENS` is 12,000, chat
   messages have at most 3 rounds, and the hold is the worst case, $0.0135 (14 supplies).
3. **Lower reasoning effort for chat** (`effort: "low"`, now `"medium"`). Output is about 75%
   of the cost, so this is the biggest lever, but it can make plans worse: test it on real
   conversations before switching.
4. **Price:** no longer needed for safety, since metering caps the cost. Pool sizes and pack
   prices live in `plans.ts` (`AI_SUPPLIES_PER_MONTH`, `SUPPLY_PACKS`).

**Free** brings in nothing, so it's counted per person, and runs on Fast only: 100 supplies a month (200 until 2026-11-20) across every Free
server someone asks from (and the same per server), so making more servers doesn't make more
free AI. At worst that's $0.10 a month per active person. The global daily budget is a circuit
breaker for a runaway, not an allowance: `QM_DAILY_BUDGET_USD` (default $2) plus $0.25 a day per
Pro server, $1.10 per Agency plan and everything in packs bought that week, so normal use can't
trip it. If Free ever crowds paid servers out of it, split it into a Free pool and a paid pool;
not built, as per-person limits make it unlikely.

## What's built now (2026-11-13)

- `PRICING` in `packages/db/src/plans.ts`; checkout switches on by itself once Stripe is configured.
- Migration `0050_plan_bundles`: a `plan_bundles` table (one row per Agency subscription:
  owner, seats, source), `guild_plans.bundle_id`, and database functions that only let the
  bundle's owner fill or empty a seat, never past its seat count and never over a server that
  pays for Pro itself. Staff can give an Agency bundle for free (a comp), like Pro.
- Plan page: the three plans side by side with what each adds, the server's current plan, and
  (for an Agency owner) "Use a seat on this server" / "Free this seat".
- Account page: your Agency plan, its seats and the servers in them.
- Staff page: give or remove a complimentary Agency plan for a user.
- Landing page: the three plans and their prices.

## Turning checkout on (owner, once)

Checkout is built (2026-11-14). It stays off, and every page shows launch prices with no buy
buttons, until all of these are set. Do it in Stripe's test mode first, then repeat with live
keys.

1. **Products in Stripe:** "Garrison Pro" with a monthly ($8.99) and a yearly ($89.99) price,
   and "Garrison Agency" with a monthly ($34.99) and a yearly ($349.99) price. Give both
   products the tax code `txcd_10103000` (Software as a service, personal use): Stripe now
   refuses checkout for a product without one. Copy the four price IDs (price_...).
2. **Webhook in Stripe:** endpoint `https://dash.garrisonbot.com/api/stripe/webhook`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
   `charge.dispute.created`, `charge.refunded` and `radar.early_fraud_warning.created`. Copy its
   signing secret (whsec_...). A dispute or early fraud warning cancels that subscription at
   once; a refund doesn't.
3. **Customer portal in Stripe:** three configurations. The default allows cancelling at
   period end, card changes and invoices, but **no plan switching**. Two more carry
   `metadata.garrison_tier` = `pro` / `agency` and each lists only its own product's monthly
   and yearly prices; Manage billing opens the one for the plan (`portalConfiguration()` in
   `apps/web/lib/billing.ts`). One portal listing both products would let a Pro subscriber
   switch to an Agency price while the plan (read from metadata) stays Pro.
4. **Billing database login (Supabase SQL editor):**
   `ALTER ROLE garrison_billing LOGIN PASSWORD '<a long random password>';` then build its
   connection string the same way as the dashboard's (pooler host, user
   `garrison_billing.<project ref>`).
5. **Use a restricted key in production** (rk_..., Stripe's recommendation), with write access
   to Checkout Sessions, Customer portal (sessions and configurations), Customers and
   Subscriptions, and read access to Invoices, Invoice payments, Charges, Disputes and Prices.
6. **Sales tax:** if you sell to US states or the EU that require it, turn on Stripe Tax and
   add your registrations before switching checkout on; until then no tax is collected.
   Stripe also switches on **Managed Payments** by default (Settings, Managed payments):
   Stripe becomes the seller of record and handles sales tax for you, for an extra fee.
   Decide whether to keep it before going live; Garrison works either way.
7. **GitHub secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_AGENCY_MONTHLY`,
   `STRIPE_PRICE_AGENCY_YEARLY`, `BILLING_DATABASE_URL`. Then deploy.

**Policies (added 2026-11-14):** Terms, Privacy and Refund pages live at
`garrisonbot.com/terms`, `/privacy` and `/refunds` (text in `apps/web/app/<page>/page.tsx`,
shared facts in `apps/web/lib/legal.ts`). Before launch:

- Make sure `support@garrisonbot.com` receives mail; every policy sends people there.
- Discord Developer Portal, General Information: set the Terms of Service URL and Privacy
  Policy URL to the two pages (needed for bot verification).
- Stripe, Settings, Public details: support email, website, and the Terms, Privacy and
  Refund URLs. Stripe shows these on receipts and checks them during account review.
- Checkout can't carry its own agreement text while Managed Payments is on (Stripe refuses
  `custom_text`), so the agreement line sits under the Upgrade buttons on the Plan page.

**Handling a refund request** (Refund Policy): full refund within 7 days of the first payment,
one per person, unless the server used more AI builder supplies in a day than Free allows (40).
Check with (Supabase SQL editor, put in the server ID and the payment time). Before
2026-11-15 the Refund Policy counted changes only; for payments before then, drop the `calls`
half:

```sql
with calls as (
  select date_trunc('day', created_at) as day, 3 * count(*) as supplies
  from ai_usage
  where guild_id = '<server id>' and created_at >= '<payment time>' and ok
  group by 1
), changes as (
  select date_trunc('day', created_at) as day,
    sum(case when status = 'applied' then jsonb_array_length(plan)
             when status in ('failed', 'rolled_back') then jsonb_array_length(created)
             else 0 end) as supplies
  from qm_builds
  where guild_id = '<server id>' and created_at >= '<payment time>'
  group by 1
)
select day, sum(supplies) as supplies
from (select * from calls union all select * from changes) t
group by day having sum(supplies) > 40;
```

No rows means eligible. For an Agency plan, run it for each server in its seats. Refund in the
Stripe dashboard **and cancel the subscription there too**: a refund alone doesn't end the plan
(the webhook treats refunds as goodwill), but the policy says a refunded plan ends.

**Test mode, done 2026-11-14:** the sandbox has both products and all four prices (lookup keys
`garrison_pro_monthly`, `garrison_pro_yearly`, `garrison_agency_monthly`,
`garrison_agency_yearly`) and a customer portal that switches between them. A test subscription
turned a server's Pro on, cancel-at-period-end kept it on, and canceling turned it off, all
through the webhook. A full checkout from the Upgrade button with the 4242 test card then
turned Pro on through `checkout.session.completed`, and the billing portal opened for it. For local testing: `apps/web/.env.local` (gitignored) holds the test keys,
and `stripe listen --forward-to localhost:3100/api/stripe/webhook` forwards events.

How it works: Upgrade opens Stripe Checkout with the buyer's Discord ID (and the server, for
Pro) on the subscription. Stripe calls the webhook; it checks the signature, re-reads the
subscription from Stripe and applies it through `billing_set_guild` or `billing_set_agency`,
the only things the `garrison_billing` login can do. Pro stays on through Stripe's payment
retries (`past_due`) and ends when the subscription is canceled or unpaid; nothing set up on
the server is deleted. The payer gets "Manage billing" (Stripe's customer portal) on the
Plan page.
