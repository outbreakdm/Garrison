# AI costs

What Garrison spends on AI, which model Quartermaster uses, and the daily credit
allowance that keeps AI well inside what Pro brings in.

> **Decided 2026-11-12 and built:** Claude Haiku 5.5, called **directly through Anthropic**
> (no OpenRouter fee), with the credits and limits below. Without OpenRouter's 5.5% fee, the
> figures below are about 5% lower: a typical plan costs $0.0013, and a Pro server that
> uses every credit every day costs at most **$1.17 a month**. Anthropic has no server-side
> refusal fallback for Haiku, so a refusal fails the plan and the credit is given back. Prices are OpenRouter's public list
on 2026-11-12 (per 1M tokens); check them again before switching.

## Where Garrison uses AI

| Feature | Model | Cost |
| --- | --- | --- |
| **Quartermaster** (`/qm build`, dashboard plans) | Claude Opus 5.5 today (`QM_MODEL`) | Paid per token. The only real AI cost. |
| **AI automod** (Pro) | OpenAI `omni-moderation-latest` | Free. OpenAI rate-limits it by account tier, so at scale it needs a back-off. |

Production has no `ANTHROPIC_API_KEY` today, so Quartermaster is off and costs nothing.
Before these changes, every server (Free included) could run 5 Opus builds an hour with no
ceiling. Apply migration `0049_ai_usage` in production before setting the key.

## How big one build is

Measured from the planner's real prompt, with realistic servers:

| Server | Input tokens | Output tokens |
| --- | --- | --- |
| Small (5 categories, 15 roles, 25 channels) | ~2,000 | |
| Medium (12, 40, 80) | ~3,400 | |
| Large (25, 120, 150; the snapshot stops at 150 channels) | ~5,900 | |
| An 8-change plan | | ~600 |
| A 20-change plan (the most allowed) | | ~1,400 |

Reasoning adds output on top (about 1,000–2,500 at medium effort). Below, a **typical** build
is 3,400 in and 2,000 out; a **heavy** build is 6,000 in and 4,000 out, with output capped at
4,000 (today the cap is 16,000).

## Cost per build

Including OpenRouter's 5.5% fee on credit purchases:

| Model | In / out ($ per 1M) | Typical build | Heavy build | Pro, every credit used (15 a day) |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 (current) | 4.00 / 20.00 | $0.057 | $0.110 | $49.37/mo |
| Claude Sonnet 5.5 | 2.00 / 10.00 | $0.028 | $0.055 | $24.69/mo |
| Gemini 3.8 Flash | 0.825 / 4.125 | $0.012 | $0.023 | $10.18/mo |
| DeepSeek V4.1 Flash | 0.30 / 1.20 | $0.004 | $0.007 | $3.13/mo |
| **Claude Haiku 5.5** | 0.10 / 0.50 | **$0.0014** | **$0.0027** | **$1.23/mo** |
| GPT-6 Luna | 0.10 / 0.50 | $0.0014 | $0.0027 | $1.23/mo |
| Qwen 3.8 Flash | 0.15 / 0.47 | $0.0015 | $0.0029 | $1.32/mo |

## What Pro brings in

After Stripe (2.9% + $0.30 a charge), Pro at the proposed price nets **$5.52 a month** on
monthly billing, or **$4.02 a month** on the $49.99 annual plan. Budget against the lower
figure.

## Recommendation

1. **Model: Claude Haiku 5.5**, with **GPT-6 Luna** as the fallback (same price, other
   provider). A plan is a small structured list that Garrison validates and a person approves,
   so a large model isn't needed. That cuts the cost of a build about 40×. Run the eval below before
   switching.
2. **Daily credits per server.** One credit is one plan (asking for a change is a new plan).
   Credits reset at midnight UTC and don't roll over.
   - **Free: 3 a day.** At most $0.25 a month per server, even if used every single day.
   - **Pro: 15 a day.** At most $1.23 a month (31% of the lowest net), even if used every
     single day. A realistic admin (10–40 builds a month) costs $0.01–0.06.
   - A failed call (provider down, refused, invalid plan) gives the credit back.
3. **Hard limits in code**, so a bug or abuse can't run up a bill:
   - Output capped at 4,000 tokens; the snapshot stays capped at 150 channels.
   - A global daily spend cap (start at $5 a day). Quartermaster pauses for everyone when it's
     reached and says so.
   - A spending limit on the OpenRouter key itself, as the last backstop.
   - Log tokens and cost per build (OpenRouter returns usage on each call), and show today's
     credits on the Quartermaster page.
4. **OpenRouter or direct?** Through OpenRouter, one key reaches every model, and Haiku can
   fall back to GPT-6 Luna when Anthropic is down. It costs the 5.5% fee and the move from the
   Anthropic SDK to OpenRouter's OpenAI-style API with `response_format: json_schema`.
   Garrison already validates every plan, so the schema only needs to match.
   Calling Anthropic directly with Haiku avoids the fee and keeps the current code, but has no
   cross-provider fallback. Either way the cost picture above holds; OpenRouter is the better
   fit if you want to change models later without code changes.

**Bottom line:** with Haiku and these credits, the most a Pro server can cost in AI is about
$1.23 a month, against $4.02–5.52 net. Typical servers will cost a few cents. Opus as it is
today could cost more than the subscription brings in.

## Before switching: a small eval

Twenty real-style requests (game sections, staff areas, events, "delete everything",
injection attempts in channel names) against Haiku, GPT-6 Luna and DeepSeek V4.1 Flash. Score
each on: valid plan first try, follows the request, refuses what it must, and tokens used.
Pick the cheapest model that matches Sonnet on validity and refusals. This needs an
OpenRouter key (a few cents total).
