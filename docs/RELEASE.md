# Release checklist

Everything left before the official release, in order. Written 2026-11-15, re-checked
2026-11-20 after the twelve "best bot" features shipped. The code is release-ready: no page
mentions early access, and every price and limit is published. What's left is owner setup in
outside services and a hands-on pass in Discord. Tick items off here as they're done.

- **Every key, where to get it and how to set it:** [`docs/KEYS.md`](KEYS.md).
- **How to test every feature, automated and by hand:** [`docs/TESTING.md`](TESTING.md).

Checked on 2026-11-20 (live, from production and the deploy's preflight):

- GitHub has every secret the release needs: Discord, both database URLs, Cloudflare, Anthropic,
  OpenAI, Twitch, Battle.net, every `STRIPE_*` and `BILLING_DATABASE_URL`. **Missing (optional):**
  `TURNSTILE_*`, and the new feature keys in section 3.
- Discord: the token works, Server Members and Message Content intents are on, Public Bot is on,
  and the dashboard's sign-in works (so its OAuth redirect is right).
- Both database logins connect and the schema is current (migrations through 0087; **0088**
  is waiting for the next deploy). Supabase's security advisor has no warnings.
- The bot checks in every minute; `/healthz` and every public page answer 200; the link
  preview (`og:image`) is set; garrisonbot.com has mail servers (IONOS).
- AI works in production: assistant chats since the 2026-11-20 fix all went through.
- Two servers have Garrison today. Their health checks flag only setup: one has no moderation
  log channel, the other hasn't granted Move Members.
- The dashboard, signed in as the owner on 2026-11-21: all 60 server pages (both servers,
  every page and settings tab), the account tabs, member pages and status load without an
  error; an off public page is a 404; Download your data works.
- Stripe, live (2026-11-21): the four prices, the webhook (enabled, ten events, the right URL
  and API version) and payments and payouts are on. Three tasks are open, below.

## 1. Blockers: the release doesn't work without these

### Payments (Stripe live mode)
Until these are set, the Plan page says "Checkout isn't available right now" and nothing can
be bought. Full steps in `docs/pricing.md`, "Turning checkout on". In **live** mode:

- [x] Products "Garrison Pro" and "Garrison Agency", tax code `txcd_10103000`, four prices,
      tax-exclusive: $8.99/mo, $79.99/yr, $34.99/mo, $349.99/yr (lookup keys
      `garrison_pro_monthly`, `garrison_pro_yearly`, `garrison_agency_monthly`,
      `garrison_agency_yearly`). Created 2026-11-15.
- [x] **Pro yearly is now $89.99** (2026-11-23, save 17% like Agency). Done 2026-11-27: new
      price `price_1UgEz9B8kUlw6ISQdYOzcW5t` holds the lookup key, the $79.99 one is archived, the
      Pro portal offers it, the secret is set and live checkout shows $89.99/yr. A Stripe price can't
      change, so: Product catalog, Garrison Pro, Add another price, $89.99 yearly, tax-exclusive,
      and move the lookup key `garrison_pro_yearly` to it (archive the $79.99 one). Put its
      `price_...` ID in the GitHub secret `STRIPE_PRICE_PRO_YEARLY`, then deploy. Until then
      the Plan page shows $89.99 and Pro yearly checkout pauses itself ("That price is being
      updated"): checkout compares Stripe's amount with the page before charging. Monthly,
      Agency and packs are unaffected.
- [x] Webhook "Garrison dashboard: plans and billing" to
      `https://dash.garrisonbot.com/api/stripe/webhook`, the ten events, API version
      `2026-10-28.endive`. Its signing secret is under Developers, Webhooks, that endpoint,
      Signing secret, Reveal.
- [x] Customer portal: a default with no plan switching, and one per plan that switches
      monthly and yearly within that plan only (`docs/pricing.md` step 3).
- [x] Restricted key (`rk_live_...`) with the permissions in `docs/pricing.md` step 5:
      Developers, API keys, Create restricted key.
- [ ] **Stripe identity check is overdue**: it asks for a live photo of your ID. Until it's
      done Stripe can pause payouts. Settings → Business → Verification, or the home banner.
- [ ] Decide on Managed Payments (Stripe as seller of record, handles sales tax) or Stripe Tax
      with your own registrations. Stripe Tax is half set up (no head office address) and no
      checkout collects tax yet; once you decide, the checkouts get automatic tax.
- [ ] Settings, Public details (dashboard only; the API can't set them on your own account): support email `support@garrisonbot.com` (empty in Stripe on
      2026-11-21), website `https://garrisonbot.com` (set), Terms
      `https://garrisonbot.com/terms`, Privacy `https://garrisonbot.com/privacy`, Refunds
      `https://garrisonbot.com/refunds`.
- [ ] Optional: Settings → Branding, the logo and color, so checkout and receipts look like
      Garrison.
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
- [x] `support@garrisonbot.com` receives mail (set up and tested by the owner, 2026-11-21).

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
- [x] Public Bot on (checked 2026-11-20). Requires OAuth2 Code Grant off.
- [x] Privileged intents on: Server Members and Message Content (Presence stays off). The bot
      uses Guilds, Members, Moderation, Invites, Voice States, Messages, Reactions, Direct
      Messages and Message Content.

**Installation**
- [ ] Installation contexts: Guild Install only (User Install off).
- [ ] Install link: Discord Provided Link, so the bot's profile gets an Add App button.
- [ ] Guild Install scopes `bot` and `applications.commands`; permissions integer
      `1546577637110` (changed 2026-11-15, update it if you set the old one). That's exactly
      `inviteSettings` in `packages/brand`: Kick, Ban, Manage Channels, Manage Server, View
      Audit Log, View Channel, Send Messages, Manage Messages, Embed Links, Read Message
      History, Connect, Move Members, Change Nickname, Manage Roles, Moderate Members, plus the
      member permissions the AI builder can give (Add Reactions, Video, Attach Files, External
      Emojis and Stickers, Speak, Voice Activity, Create Threads, Talk in Threads). Never
      Administrator. Servers that added Garrison before get a /health note to re-grant them.

**OAuth2**
- [x] Redirect: `https://dash.garrisonbot.com/auth/callback` (sign-in works).

**Verification**
- [ ] Apply for verification when Garrison reaches 75 servers. Discord stops new installs at
      100 for unverified bots, and Server Members and Message Content need approval then.
      The verification form asks what the privileged intents are for: Members for welcome
      messages, verification, anti-raid and member pages; Message Content for automod, logs
      that keep message text (opt-in), tickets, suggestions and the starboard.

## 3. Recommended before release

- [x] `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` (dev.twitch.tv app): stream alerts for
      Twitch. YouTube alerts work without a key.
- [x] `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` (develop.battle.net, redirect
      `https://dash.garrisonbot.com/auth/battlenet/callback`): verified World of Warcraft
      accounts on Game accounts. Without them the Battle.net button is hidden.
- [ ] `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (Cloudflare Turnstile): a bot check on the
      web verification page. Without them verification still works, with no captcha.
- [ ] Keys for the 2026-11-20 features (step by step in [`docs/KEYS.md`](KEYS.md)). Each stays
      off, and says so on its page, until set:
  - [ ] Bot: `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` (Kick alerts, a kick.com developer app).
  - [ ] Bot: `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (Reddit alerts, reddit.com/prefs/apps).
        Reddit blocks anonymous reads from servers, and its API terms want approval for
        commercial use: read them first.
  - [ ] Bot: `STEAM_API_KEY` (Steam level and games roles, steamcommunity.com/dev).
  - [ ] Bot: `RIOT_API_KEY` (League rank roles). A development key expires daily; apply for a
        production key at developer.riotgames.com. Valorant ranks would need Riot Sign-On too.
  - [ ] Dashboard: `TWITCH_EVENTSUB_SECRET` (10 to 100 random characters you make up) for
        Twitch subscriber roles, and add `https://dash.garrisonbot.com/auth/twitch/callback`
        as a redirect URL on the Twitch app. `TWITCH_CLIENT_ID`/`SECRET` are already set.
- [ ] Have a native speaker check the Spanish, Portuguese, German and French text in
      `packages/db/src/i18n.ts` (slash command descriptions, level-ups, alerts, public page).
- [x] Free AI limit per person (built 2026-11-15): 2 plans a day across all of someone's Free
      servers, Pro 15 and Agency 20 per server. A separate Free budget pool is optional; see
      `docs/pricing.md`.
- [ ] Ask existing servers to grant Move Members (voice rooms) or re-invite; `/health` flags it.
- [ ] Have a lawyer read the Terms, Privacy and Refund pages. The Privacy Policy was updated
      2026-11-20 for birthdays, applications, kept roles, public leaderboards, Steam and Riot
      lookups, Twitch subscriber lists and AI ticket help; "Download your data" and "Erase your
      data" now cover birthdays.

## 4. Release day

1. Set the GitHub secrets above, then deploy:
   `gh workflow run deploy-cloudflare.yml --ref <branch> -f target=everything -f register_commands=true`.
2. Check `https://dash.garrisonbot.com/healthz`, and `/status` says Garrison is online.
3. On a test server: Upgrade to Pro with a real card, confirm Pro turns on, then refund and
   cancel it from the Stripe dashboard.
4. Ask the AI builder for a small plan, check it previews, build it, undo it.
5. Paste `https://garrisonbot.com` in a Discord channel: the preview shows the new image.
6. Run the hands-on pass in [`docs/TESTING.md`](TESTING.md). At the least, try each 2026-11-20
   feature once in Discord (none could be tried before it was deployed):
   - `/tag` and a word auto-responder (Messages page).
   - Post an application panel, apply from a second account, accept it: the role lands.
   - `/ticket assist` in an open ticket (Pro): a summary and a reply, a few supplies used.
   - Utilities: a sticky message reposts after chat; a 1-hour self-clearing channel; leave
     and rejoin with a second account to get roles back; `/temprole give ... 2m` and watch it
     come off.
   - Stream alerts: add an RSS feed and a Bluesky account; wait 10 minutes for a new post.
   - Settings → Public page: turn it on and open `garrisonbot.com/s/<server ID>`.
   - Settings → Server → Language: Español, then level up: the message is in Spanish.
   - Fun: a counting channel (count, then break it), `/birthday set`, `/trivia`.
   - "Set up in three clicks" on a new server's Overview.
