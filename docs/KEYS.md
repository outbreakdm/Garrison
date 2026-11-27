# Keys: getting and setting each one

Every key Garrison uses, where to get it, and how to set it. Written 2026-11-21.

All keys live in **GitHub secrets** on `outbreakdm/Garrison`. The deploy workflow copies each one
into the bot or the dashboard on Cloudflare. A key does nothing until the next deploy.

## How to set a key

Use the GitHub CLI. It asks for the value, so the key never lands in your shell history:

```powershell
gh secret set KICK_CLIENT_ID --repo outbreakdm/Garrison
```

Or on github.com: the repository → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, with the exact name from this page.

Then deploy the part that uses it (no need to register commands again):

```powershell
gh workflow run deploy-cloudflare.yml --repo outbreakdm/Garrison --ref claude/garrison-dashboard-errors-c0gcd3 -f target=bot -f register_commands=false
```

Use `-f target=dashboard` for dashboard keys, or `everything` when you set both kinds. Check a
key took: the deploy's **Preflight** step lists each optional feature as on or off.

To see which secrets are set (names only, never values):

```powershell
gh secret list --repo outbreakdm/Garrison
```

## Already set (2026-11-21)

`DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, `DATABASE_URL`, `WEB_DATABASE_URL`,
`BILLING_DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `BNET_CLIENT_ID`,
`BNET_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the four
`STRIPE_PRICE_*`. Nothing to do for these.

WoW Forever characters link through the same Battle.net app (`BNET_CLIENT_ID`,
`BNET_CLIENT_SECRET`), so Forever needs no key of its own, and it hides with the rest of the
Battle.net link when those are missing. ForeverDB's API key is not needed: its API has game data
only and can't prove who owns a character, so Garrison doesn't use it.

## Still to set

Every one of these is optional. Without it, its feature stays off and its page says so.

### 1. Twitch subscriber roles: `TWITCH_EVENTSUB_SECRET` (dashboard)

The Twitch app is already set up for stream alerts. Subscriber roles need two more things:

1. **The secret.** Make up 10 to 100 random characters. This makes 64:

   ```powershell
   -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
   ```

   Set it as `TWITCH_EVENTSUB_SECRET`. Twitch signs every webhook with it, and Garrison
   refuses any message that isn't signed with it.
2. **The redirect URL.** Go to [dev.twitch.tv/console](https://dev.twitch.tv/console) →
   **Applications** → **Manage** on the Garrison app → **OAuth Redirect URLs** → **Add**:
   `https://dash.garrisonbot.com/auth/twitch/callback`. Keep the one that's already there.
   Click **Save**.

Deploy the dashboard. On Stream alerts, the Twitch subscriber role card now shows **Connect your
Twitch channel** (on Pro servers).

### 2. Kick alerts: `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` (bot)

1. Sign in at [kick.com](https://kick.com), then open **Settings** → **Developer**. Turn on
   two-factor authentication first if Kick asks.
2. **Create new app**. Name: `Garrison`. Redirect URL: `https://dash.garrisonbot.com` (Garrison
   uses an app token and never sends anyone through it). Description: `Live alerts for Discord
   servers`. Leave every scope off: reading a channel's live status needs none.
3. Copy the **Client ID** and **Client Secret** into `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET`.

Deploy the bot. Kick feeds stop saying "Waiting for Garrison's Kick keys" within 2 minutes.

### 3. Reddit alerts: `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (bot)

Reddit refuses anonymous reads from servers, so Garrison reads subreddits as a registered app.

1. Read Reddit's [Data API terms](https://redditinc.com/policies/data-api-terms) and
   [Developer Terms](https://redditinc.com/policies/developer-terms). Commercial use (Garrison
   sells Pro) can need Reddit's approval: in Reddit's Help Center, search "Data API access"
   for the request form, and describe the use as "polls new posts in subreddits a Discord
   server follows, every 10 minutes, read only".
2. Signed in to the Reddit account that should own the app, open
   [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → **create another app...**
3. Name `Garrison`, type **script**, redirect uri `https://dash.garrisonbot.com` (unused).
   **create app**.
4. The **client ID** is the short string under the app's name ("personal use script"); the
   **secret** is labeled secret. Set them as `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.

Deploy the bot.

### 4. Steam stat roles: `STEAM_API_KEY` (bot)

1. Sign in to Steam with an account that has spent at least $5 on Steam (Valve's rule for API
   keys) and has Steam Guard on.
2. Open [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Domain:
   `garrisonbot.com`. Agree to the Steam Web API Terms and **Register**.
3. Copy the key into `STEAM_API_KEY`.

Deploy the bot. Steam level and games owned show up within about 6 hours of someone linking
Steam (5 accounts a minute are looked up).

### 5. League rank roles: `RIOT_API_KEY` (bot)

1. Sign in at [developer.riotgames.com](https://developer.riotgames.com) with a Riot account.
2. The dashboard shows a **Development API key**. It works for testing but **expires every 24
   hours**, so don't use it in production.
3. For a key that lasts: **Register Product** → **Production API Key**. Product: Garrison, a
   Discord bot that gives roles from League of Legends ranked tier. URL
   `https://garrisonbot.com`. APIs used: account-v1 (by Riot ID, and the active League
   region) and league-v4 (entries by PUUID). Riot reviews it, which takes days to weeks; their
   rules want the product working and described before they approve.
4. When approved, copy the key into `RIOT_API_KEY`.

Deploy the bot. Valorant ranks are not built: they need Riot Sign-On, a further approval.

### 6. Captcha on web verification: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (dashboard)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com) → **Turnstile** → **Add widget**.
2. Name `Garrison verify`. Hostname: `dash.garrisonbot.com`. Widget mode: **Managed**.
   **Create**.
3. Copy the **Site Key** into `TURNSTILE_SITE_KEY` and the **Secret Key** into
   `TURNSTILE_SECRET`.

Deploy the dashboard. The web verification page then shows the check.

## Outside keys: Stripe account tasks (not secrets)

These are done in the [Stripe dashboard](https://dashboard.stripe.com), live mode. Found on
2026-11-21:

1. **Identity check overdue.** Stripe asks for a live photo of your ID ("document live
   capture"). Until it's done Stripe can pause payouts or payments. Do it under **Settings** →
   **Business** → **Verification**, or from the banner on the home page.
2. **Public details.** **Settings** → **Business** → **Public details**: support email
   `support@garrisonbot.com` (it's empty now), support website `https://garrisonbot.com`,
   Terms `https://garrisonbot.com/terms`, Privacy `https://garrisonbot.com/privacy`, Refunds
   `https://garrisonbot.com/refunds`. Customers see these on receipts and checkout.
3. **Sales tax.** Stripe Tax is set up but not finished: it's missing the head office address,
   and no checkout collects tax yet. Decide first: Stripe Managed Payments (Stripe is the
   seller and handles tax) or Stripe Tax with your own registrations (then **Settings** →
   **Tax**: add the head office, then registrations). Tell Claude which, and it turns on
   automatic tax in the checkouts.
4. **Branding (optional).** **Settings** → **Branding**: the icon and logo from
   `apps/web/art/discord/`, and the accent color, so checkout and receipts look like Garrison.
