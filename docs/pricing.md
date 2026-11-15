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
| Yearly | $0 | **$79.99** (save 26%) | **$349.99** ($5.83 a server a month) |
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

AI is the only cost that grows with use (Claude Haiku 5.5, `docs/ai-costs.md`). Since
2026-11-15 the AI builder has one daily currency, **supplies** (`AI_SUPPLIES_PER_DAY` in
`packages/db/src/plans.ts`, design in `docs/AI_ASSISTANT.md`). Every AI call (a chat message, a
plan, a revision) costs 3, because each is a paid model call; every change a plan makes costs 1.
A full plan is 23 (the message plus 20 changes). Failed calls and discarded or expired plans
give their supplies back.

The heaviest possible call (6,000 tokens in, 6,000 out) costs $0.0036. Supplies cap the calls at
a third of the day's supplies, so a server that spends every supply on messages every day for a
month, each at the ceiling, costs at most:

- Free (13 a day per person): **$1.40** a person
- Pro (100 a day): **$10.80**
- Agency (5 servers × 133 a day): **$71.82**

That's lower than before supplies (Pro could make 40 plan requests and 100 chat messages a day,
$15.12), but above what Pro and Agency bring in, so the table below is a theoretical bound only.

After Stripe (2.9% + $0.30 a charge), that absolute worst case, monthly billing:

| Plan | Price | Stripe | Net | Worst-case AI | Left | AI share |
|---|---|---|---|---|---|---|
| Pro monthly | $8.99 | $0.56 | $8.43 | $10.80 | **-$2.37** | 128% |
| Pro yearly | $6.67/mo | $0.22/mo | $6.45 | $10.80 | **-$4.35** | 167% |
| Agency monthly | $34.99 | $1.31 | $33.68 | $71.82 | **-$38.14** | 213% |
| Agency yearly | $29.17/mo | $0.87/mo | $28.30 | $71.82 | **-$43.52** | 254% |

That worst case needs every message at the token ceiling, every day, all month, which the
hourly limits (40 chat messages and 10 plans an hour per server) and the global cap
(`QM_DAILY_BUDGET_USD`, $5 a day) make impractical: the global cap stops the AI builder for
everyone long before many servers could do it. A typical message costs $0.0005 to $0.002, so
even 100 a day every day is about $1.50 to $6 a month, and a realistic admin sends far fewer.
If real use ever trends toward the cap, raise `AI_SUPPLIES_PER_MESSAGE` first (each step of 1
cuts the message ceiling by about a quarter); the supplies a day can stay as sold.

**The one real exposure is Free.** Free brings in nothing, so since 2026-11-15 it's counted per
person: 40 supplies a day across every Free server someone asks from (and the same per
server), so making more servers doesn't make more free AI. At worst that's $1.40 a month per
active person. The global cap (`QM_DAILY_BUDGET_USD`, $5 a day, $150 a month) still bounds the total.
If Free ever crowds paid servers out of that cap, split it into a Free pool and a paid pool;
not built, as per-person limits make it unlikely. The limits live in `AI_SUPPLIES_PER_DAY`
(`packages/db/src/plans.ts`).

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

1. **Products in Stripe:** "Garrison Pro" with a monthly ($8.99) and a yearly ($79.99) price,
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
