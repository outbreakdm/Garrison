# Pricing: Free, Pro and Agency

Proposed 2026-11-13. Every price lives in one place, `PRICING` in `packages/db/src/plans.ts`;
the landing page, the Plan page and the account page all read it. While `PAID_PLANS_LIVE` is
false, every page shows the prices as "at launch" and nothing can be bought.

## The three plans

| | Free | Pro | Agency |
|---|---|---|---|
| Servers | Any number | 1 server | Up to 5 servers, moved between them any time |
| Monthly | $0 | **$8.99** | **$34.99** ($7.00 a server) |
| Yearly | $0 | **$79.99** (save 26%) | **$349.99** ($5.83 a server a month) |
| Safety (moderation, anti-raid, anti-nuke, verification, logs) | Everything | Everything | Everything |
| AI builder plans a day | 3 | 15 | 15 on each server |
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

AI is the only cost that grows with use (Claude Haiku 5.5, `docs/ai-costs.md`). A heavy plan
costs about $0.0027, so a server that uses every credit every day for a month costs at most:

- Free (3 a day): **$0.25**
- Pro (15 a day): **$1.23**
- Agency (5 servers × 15 a day): **$6.15**

After Stripe (2.9% + $0.30 a charge), worst-case AI use, monthly billing:

| Plan | Price | Stripe | Net | Worst-case AI | Left | AI share |
|---|---|---|---|---|---|---|
| Pro monthly | $8.99 | $0.56 | $8.43 | $1.23 | **$7.20** | 15% |
| Pro yearly | $6.67/mo | $0.22/mo | $6.45 | $1.23 | **$5.22** | 19% |
| Agency monthly | $34.99 | $1.31 | $33.68 | $6.15 | **$27.53** | 18% |
| Agency yearly | $29.17/mo | $0.87/mo | $28.30 | $6.15 | **$22.15** | 22% |

A realistic admin asks for 10 to 40 plans a month, about $0.01 to $0.11, so real AI use is a
rounding error; the worst case above assumes every credit is spent every day.

**The one real exposure is Free.** Free servers bring in nothing, and 3 heavy plans a day costs
$0.25 a month each. Today the global cap (`QM_DAILY_BUDGET_USD`, $5 a day, $150 a month) bounds
it. Recommended before launch: split that cap into a Free pool ($2 a day, shared) and paid
servers, which are never stopped by Free use. Logged as a follow-up, not built yet.

## What's built now (2026-11-13)

- `PRICING` and `PAID_PLANS_LIVE` in `packages/db/src/plans.ts`.
- Migration `0050_plan_bundles`: a `plan_bundles` table (one row per Agency subscription:
  owner, seats, source), `guild_plans.bundle_id`, and database functions that only let the
  bundle's owner fill or empty a seat, never past its seat count and never over a server that
  pays for Pro itself. Staff can give an Agency bundle for free (a comp), like Pro.
- Plan page: the three plans side by side with what each adds, the server's current plan, and
  (for an Agency owner) "Use a seat on this server" / "Free this seat".
- Account page: your Agency plan, its seats and the servers in them.
- Staff page: give or remove a complimentary Agency plan for a user.
- Landing page: the three plans with prices marked "at launch".

## Still to do (Phase 2, Stripe)

- Two Stripe products (Pro, Agency), each with a monthly and a yearly price.
- Checkout for Agency carries the buyer's Discord user ID; the webhook creates or updates the
  `plan_bundles` row (seats 5, source `stripe`) instead of a `guild_plans` row.
- Cancelling an Agency plan frees every seat at period end (the servers drop to Free, paused,
  nothing deleted).
- Flip `PAID_PLANS_LIVE` once checkout works end to end in test mode.
