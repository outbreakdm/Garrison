# Release checklist

Everything left before the official release, in order. Written 2026-11-15. The code is
release-ready: no page mentions early access, and every price and limit is published. What's
left is owner setup in outside services. Tick items off here as they're done.

Checked on 2026-11-15:

- GitHub has `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, `DATABASE_URL`, `WEB_DATABASE_URL` and
  the Cloudflare secrets. **Missing:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TWITCH_*`,
  `BNET_*`, `TURNSTILE_*`, every `STRIPE_*` and `BILLING_DATABASE_URL`.
- Production has no AI builder usage at all, so it has most likely never had an Anthropic key.
- The `garrison_billing` database role can't log in yet.

## 1. Blockers: the release doesn't work without these

### Payments (Stripe live mode)
Until these are set, the Plan page says "Checkout isn't available right now" and nothing can
be bought. Full steps in `docs/pricing.md`, "Turning checkout on". In **live** mode:

- [x] Products "Garrison Pro" and "Garrison Agency", tax code `txcd_10103000`, four prices,
      tax-exclusive: $8.99/mo, $79.99/yr, $34.99/mo, $349.99/yr (lookup keys
      `garrison_pro_monthly`, `garrison_pro_yearly`, `garrison_agency_monthly`,
      `garrison_agency_yearly`). Created 2026-11-15.
- [x] Webhook "Garrison dashboard: plans and billing" to
      `https://dash.garrisonbot.com/api/stripe/webhook`, the ten events, API version
      `2026-10-28.endive`. Its signing secret is under Developers, Webhooks, that endpoint,
      Signing secret, Reveal.
- [x] Customer portal: a default with no plan switching, and one per plan that switches
      monthly and yearly within that plan only (`docs/pricing.md` step 3).
- [x] Restricted key (`rk_live_...`) with the permissions in `docs/pricing.md` step 5:
      Developers, API keys, Create restricted key.
- [ ] Decide on Managed Payments (Stripe as seller of record, handles sales tax) or Stripe Tax
      with your own registrations.
- [ ] Settings, Public details: support email `support@garrisonbot.com`, website
      `https://garrisonbot.com`, Terms `https://garrisonbot.com/terms`, Privacy
      `https://garrisonbot.com/privacy`, Refunds `https://garrisonbot.com/refunds`.
- [x] Supabase SQL editor: `ALTER ROLE garrison_billing LOGIN PASSWORD '<long random>';`
      and build its connection string like the dashboard's.
- [x] GitHub secrets: `STRIPE_SECRET_KEY` (the restricted key), `STRIPE_WEBHOOK_SECRET`, the
      four `STRIPE_PRICE_*` IDs (find each in the Stripe Dashboard by its lookup key), and
      `BILLING_DATABASE_URL`.

### AI
- [x] `ANTHROPIC_API_KEY` in GitHub secrets: the AI builder doesn't work without it, and the
      landing page and every plan advertise it. Set a monthly spend limit in the Anthropic
      console as well as the built-in $5 a day cap.
- [x] `OPENAI_API_KEY`: AI moderation (Pro). The OpenAI moderation model is free to call.

### Support
- [ ] `support@garrisonbot.com` receives mail. The Terms, Privacy and Refund pages all send
      people there, and Stripe shows it on receipts.

## 2. Discord Developer Portal

Assets are in `apps/web/art/discord/`: `avatar.png` (1024 square) and `banner.png` (1360×480,
Discord's 680×240 at 2x).

**General Information**
- [x] App icon: `avatar.png`.
- [x] Name: `Garrison`.
- [x] Description (it shows as the bot's About me; 400 characters max):

      Run your Discord server from one dashboard. Moderation, anti-raid, logs, tickets, role menus, welcome messages, LFG and raids, and an AI server builder.

      Every change can be undone, and Garrison never asks for Administrator.

      Dashboard: https://dash.garrisonbot.com
      Status: https://garrisonbot.com/status

- [x] Tags (5 max): `Moderation`, `Security`, `LFG`, `Gaming`, `Utility`.
- [x] Terms of Service URL: `https://garrisonbot.com/terms`.
- [x] Privacy Policy URL: `https://garrisonbot.com/privacy`.

**Bot**
- [x] Icon: `avatar.png`. Banner: `banner.png`. Username: `Garrison`.
- [ ] Public Bot on. Requires OAuth2 Code Grant off.
- [ ] Privileged intents on: Server Members and Message Content (Presence stays off). The bot
      uses Guilds, Members, Moderation, Invites, Voice States, Messages, Reactions, Direct
      Messages and Message Content.

**Installation**
- [ ] Installation contexts: Guild Install only (User Install off).
- [ ] Install link: Discord Provided Link, so the bot's profile gets an Add App button.
- [ ] Guild Install scopes `bot` and `applications.commands`; permissions integer
      `1099865091254`. That's exactly `inviteSettings` in `packages/brand` (Kick, Ban, Manage
      Channels, Manage Server, View Audit Log, View Channel, Send Messages, Manage Messages,
      Embed Links, Read Message History, Connect, Move Members, Change Nickname, Manage
      Roles, Moderate Members). Never Administrator. If `inviteSettings` changes, update this.

**OAuth2**
- [ ] Redirect: `https://dash.garrisonbot.com/auth/callback`.

**Verification**
- [ ] Apply for verification when Garrison reaches 75 servers. Discord stops new installs at
      100 for unverified bots, and Server Members and Message Content need approval then.
      The verification form asks what the privileged intents are for: Members for welcome
      messages, verification, anti-raid and member pages; Message Content for automod, logs
      that keep message text (opt-in), tickets, suggestions and the starboard.

## 3. Recommended before release

- [ ] `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` (dev.twitch.tv app): stream alerts for
      Twitch. YouTube alerts work without a key.
- [ ] `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` (develop.battle.net, redirect
      `https://dash.garrisonbot.com/auth/battlenet/callback`): verified World of Warcraft
      accounts on Game accounts. Without them the Battle.net button is hidden.
- [ ] `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (Cloudflare Turnstile): a bot check on the
      web verification page. Without them verification still works, with no captcha.
- [x] Free AI limit per person (built 2026-11-15): 2 plans a day across all of someone's Free
      servers, Pro 15 and Agency 20 per server. A separate Free budget pool is optional; see
      `docs/pricing.md`.
- [ ] Ask existing servers to grant Move Members (voice rooms) or re-invite; `/health` flags it.
- [ ] Have a lawyer read the Terms, Privacy and Refund pages.

## 4. Release day

1. Set the GitHub secrets above, then deploy:
   `gh workflow run deploy-cloudflare.yml --ref <branch> -f target=everything -f register_commands=true`.
2. Check `https://dash.garrisonbot.com/healthz`, and `/status` says Garrison is online.
3. On a test server: Upgrade to Pro with a real card, confirm Pro turns on, then refund and
   cancel it from the Stripe dashboard.
4. Ask the AI builder for a small plan, check it previews, build it, undo it.
5. Paste `https://garrisonbot.com` in a Discord channel: the preview shows the new image.
