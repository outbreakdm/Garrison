# Deploying Garrison on Cloudflare

> Want to do it all in the browser, with nothing installed? Follow **[GO-LIVE.md](GO-LIVE.md)** instead.

Garrison is two programs and a database:

| Part                       | Where it runs                               | What it does                                              |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| **Dashboard** (`apps/web`) | A Cloudflare **Worker**                     | The website: landing page, status page, server dashboard. |
| **Bot** (`apps/bot`)       | A Cloudflare **Container** (one, always on) | Stays connected to Discord and does the work.             |
| **Database**               | Your **Supabase** project                   | Already created and migrated.                             |

The steps below go in order. Each ends with a check, so you know it worked
before moving on. Plan for about an hour the first time.

> **Secrets rule.** The bot token, client secret and database passwords only
> ever go into the Discord/Supabase/Cloudflare pages, your local `.env` file,
> or `wrangler secret put` prompts. Never into chat, a commit, or a file in the
> repository other than `.env` (which git ignores).

---

## Step 0. What you need

**Accounts**

- **Discord**: the application you already made in the Developer Portal.
- **Supabase**: the `Garrison` project (already set up).
- **Cloudflare**: a free account, upgraded to **Workers Paid** ($5/month).
  Containers aren't available on the free plan. An always-on container is
  billed for its usage on top of that. Check the current Containers pricing on
  Cloudflare's site before you start.

**On your computer**

- **Git**
- **Node.js 22**: `node -v` should print `v22…`.
- **pnpm 10**: run `corepack enable` once, then `pnpm -v`.
- **Docker Desktop**, running. Cloudflare's tool builds the bot's container
  image on your machine, then uploads it.

**Optional:** a domain on Cloudflare for the dashboard (like `dash.yourname.gg`).
You can start without one on a free `*.workers.dev` address and add a domain later.

---

## Step 1. Get the code and install

```sh
git clone https://github.com/outbreakdm/Garrison.git
cd Garrison
git checkout claude/zealous-hawking-mj0uj8   # until this is merged into main
pnpm install
cp .env.example .env
```

✅ **Check:** `pnpm install` ends with "Done", and you now have a `.env` file.

---

## Step 2. Discord Developer Portal

Open https://discord.com/developers/applications and pick your application.

1. **General Information** → copy **Application ID**. In `.env`, set
   `DISCORD_CLIENT_ID=` to it.
2. **Bot** → **Reset Token** → copy it. In `.env`, set `DISCORD_TOKEN=` to it.
   (You can only see it once. If you lose it, reset again.)
3. **Bot** → **Privileged Gateway Intents**:
   - **Server Members Intent**: **on** (required).
   - **Message Content Intent**: on, as you planned. Garrison won't ask Discord
     for it until automod exists.
   - Presence Intent: off.
   - Click **Save Changes**.
4. **Bot** → **Public Bot**: **off** while you're testing, so only you can add it.
5. **OAuth2** → **Reset Secret** → copy it. In `.env`, set `DISCORD_CLIENT_SECRET=`.
6. Leave **OAuth2 → Redirects** for Step 6, once you know the dashboard's address.

✅ **Check:** `.env` has `DISCORD_CLIENT_ID`, `DISCORD_TOKEN` and `DISCORD_CLIENT_SECRET` filled in.

---

## Step 3. Supabase: let Garrison's database roles log in

Garrison never uses Supabase's all-powerful `postgres` login. The bot and the
dashboard each have a limited role (`garrison_bot`, `garrison_web`). They exist,
but can't log in until you give them passwords.

1. Make two strong passwords, one per role, with letters and digits only so
   they're safe in a URL:

   ```sh
   openssl rand -hex 24   # run twice
   ```

   (Or use your password manager, letters and digits only.)

2. Supabase → your project → **SQL Editor** → **New query**, paste, put your
   passwords in, and **Run**:

   ```sql
   ALTER ROLE garrison_bot WITH LOGIN PASSWORD 'PASTE-BOT-PASSWORD';
   ALTER ROLE garrison_web WITH LOGIN PASSWORD 'PASTE-DASHBOARD-PASSWORD';
   ```

   Then clear the query box. (Supabase keeps query history; you can delete the
   query from the list on the left.)

3. Find your **pooler host**: Supabase → **Connect** (top of the project page).
   Under **Transaction pooler** you'll see a string like:

   ```
   postgresql://postgres.pijtbyfnhdxhtyidgcda:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres
   ```

   The host is the part after `@` and before `:` (for example
   `aws-0-us-west-2.pooler.supabase.com`). Use whatever your panel shows.

4. In `.env`, write the **bot's** string. The user is `garrison_bot.` plus your
   project ref, on port **6543**, with `?sslmode=require` at the end:

   ```
   DATABASE_URL=postgresql://garrison_bot.pijtbyfnhdxhtyidgcda:BOT-PASSWORD@POOLER-HOST:6543/postgres?sslmode=require
   ```

   And the **dashboard's**, for the local check in Step 4:

   ```
   WEB_DATABASE_URL=postgresql://garrison_web.pijtbyfnhdxhtyidgcda:DASHBOARD-PASSWORD@POOLER-HOST:6543/postgres?sslmode=require
   ```

✅ **Check:** Step 4 checks both.

---

## Step 4. Check everything from your computer

Before touching Cloudflare, prove the token, intents and database logins work.
This changes nothing anywhere:

```sh
pnpm preflight
```

You want every line to be ✓ or ! (warnings), with no ✗. Typical fixes:

- `DISCORD_TOKEN was rejected`: copy the token again (Step 2.2).
- `Server Members Intent is off`: Step 2.3, then **Save Changes**.
- `couldn't log in`: check the password, and that the user is
  `garrison_bot.pijtbyfnhdxhtyidgcda` (with the dot and the ref).
- `logs in as "postgres"`: you used Supabase's own string. Use the role strings from Step 3.

Then register Garrison's slash commands with Discord, once:

```sh
pnpm commands:deploy
```

✅ **Check:** preflight ends with "All set", and `commands:deploy` prints
`Registered … commands globally`. (Global commands can take a few minutes to show up in Discord.)

Preflight also prints an **invite link**. Keep it for Step 8.

---

## Step 5. Cloudflare account and login

1. Cloudflare dashboard → **Workers & Pages** → **Plans** → choose **Workers Paid**.
2. Still in **Workers & Pages**, note your **workers.dev subdomain** (shown on the
   overview page, like `yourname.workers.dev`). If you're asked to pick one, do.
3. Log Wrangler (Cloudflare's command-line tool, already installed by Step 1)
   into your account. A browser window opens. Approve it:

   ```sh
   pnpm --filter @garrison/web exec wrangler login
   pnpm --filter @garrison/web exec wrangler whoami
   ```

✅ **Check:** `whoami` shows your Cloudflare email and account.

---

## Step 6. Deploy the dashboard

### 6a. Decide its address

- **Without a domain:** it'll be `https://garrison-dashboard.YOURNAME.workers.dev`
  (YOURNAME is your subdomain from Step 5.2).
- **With a domain on Cloudflare:** pick a subdomain, like `dash.yourname.gg`.

Call this your **dashboard URL**.

### 6b. Connect it to the database (Hyperdrive)

Hyperdrive is Cloudflare's connection pooler for Postgres. The Worker talks to
the database only through it.

1. Supabase → **Connect** → **Session pooler**: same host as before, but port **5432**.
2. Cloudflare dashboard → **Storage & Databases** → **Hyperdrive** →
   **Create configuration**. Doing it in the dashboard keeps the password out
   of your terminal history.
   - Name: `garrison-web`
   - Connection: enter the parts separately:
     - Host: your pooler host
     - Port: `5432`
     - Database: `postgres`
     - User: `garrison_web.pijtbyfnhdxhtyidgcda`
     - Password: the **dashboard** password from Step 3
   - Create it, then copy its **ID**.

### 6c. Fill in the dashboard's settings

Open `apps/web/wrangler.jsonc` and change three things:

```jsonc
"vars": {
  "APP_URL": "https://YOUR-DASHBOARD-URL",       // from 6a, no trailing slash
  "DISCORD_CLIENT_ID": "YOUR-APPLICATION-ID"     // from Step 2.1
},
```

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "YOUR-HYPERDRIVE-ID",                   // from 6b
    ...
```

If you're using your own domain, also uncomment `routes` and set it:

```jsonc
"routes": [{ "pattern": "dash.yourname.gg", "custom_domain": true }],
```

None of these values are secret, so it's fine to commit this file.

### 6d. Add the dashboard's secrets

Each command asks for the value. Paste it and press Enter:

```sh
cd apps/web
npx wrangler secret put DISCORD_CLIENT_SECRET     # from Step 2.5
npx wrangler secret put DISCORD_TOKEN             # from Step 2.2
cd ../..
```

(If Wrangler says the Worker doesn't exist yet and offers to create it, say yes.)

Optional, only if you set up World of Warcraft linking: `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET`.

### 6e. Deploy

```sh
pnpm cf:dashboard
```

This builds the site for Cloudflare and uploads it (a couple of minutes).

### 6f. Tell Discord where sign-in returns to

Discord Developer Portal → **OAuth2** → **Redirects** → **Add Redirect**:

```
https://YOUR-DASHBOARD-URL/auth/callback
```

**Save Changes.** It must match `APP_URL` exactly, plus `/auth/callback`.

✅ **Check:**

- `https://YOUR-DASHBOARD-URL/healthz` shows `ok`.
- `https://YOUR-DASHBOARD-URL/status` loads. It says "not responding" until the bot is up; that's expected.
- `https://YOUR-DASHBOARD-URL/` shows the landing page.

---

## Step 7. Deploy the bot

### 7a. Settings

Open `apps/bot-cloudflare/wrangler.jsonc` and set:

```jsonc
"vars": {
  "DISCORD_CLIENT_ID": "YOUR-APPLICATION-ID",
  "LOG_LEVEL": "info"
},
```

### 7b. Secrets

```sh
cd apps/bot-cloudflare
npx wrangler secret put DISCORD_TOKEN       # same token as Step 2.2
npx wrangler secret put DATABASE_URL        # the bot's string from Step 3.4 (port 6543, garrison_bot)
npx wrangler secret put ANTHROPIC_API_KEY   # optional: only if you want /qm build (Claude Haiku 5.5, $5/day cap by default)
npx wrangler secret put TWITCH_CLIENT_ID     # optional: Twitch live alerts (dev.twitch.tv/console)
npx wrangler secret put TWITCH_CLIENT_SECRET # optional: the same Twitch app's secret
npx wrangler secret put OPENAI_API_KEY       # optional: AI moderation (Pro); the moderation endpoint is free
cd ../..
```

Use the **bot's** database string here, never the dashboard's or Supabase's
`postgres` one. The bot checks this when it starts and refuses the wrong one.

### 7c. Deploy

Make sure Docker Desktop is running, then:

```sh
pnpm cf:bot
```

Wrangler builds the bot's image from the repo's `Dockerfile` (a few minutes the
first time), uploads it, and deploys a small Worker that looks after it.

### 7d. Watch it come online

```sh
pnpm cf:bot:logs
```

Within a minute or two (a scheduled check starts it), you should see the bot log:

```
Online as Garrison#1234 in 0 servers
```

Leave the logs open for a while. The bot should stay online; this is the one
part of the Cloudflare setup that only a real deployment can prove. Press
Ctrl+C to stop watching (the bot keeps running).

✅ **Check:** "Online as …" in the logs, and `https://YOUR-DASHBOARD-URL/status` now says **Garrison is online**.

---

## Step 8. Add Garrison to your server and try it

1. Open the **invite link** from Step 4 (or run `pnpm preflight` again to print
   it). Pick your server. It asks for exactly the permissions Garrison uses,
   never Administrator.
2. In Discord, **Server Settings → Roles**: drag **Garrison**'s role above the
   roles it should moderate. Discord won't let a bot act on roles above its own.
3. In a channel, run `/health`. It lists anything to fix, with a **Fix
   permissions** button if needed.
4. Open `https://YOUR-DASHBOARD-URL`, **Sign in with Discord**, and pick your server.

✅ **Check:** `/health` shows mostly OK, and the dashboard shows your server's Overview.

---

## Step 9. Before you invite other people

- Run `/health` again and fix anything it marks **Fix**.
- When you're ready for other servers, turn **Public Bot** back on (Step 2.4).
- Keep `.env` on your computer only. Anyone with it controls the bot.
- If a secret ever leaks, reset it at its source (Discord or Supabase), then
  `wrangler secret put` it again and redeploy (`pnpm cf:bot` / `pnpm cf:dashboard`).

---

## Updating later

```sh
git pull
pnpm install
pnpm commands:deploy        # only if slash commands changed (release notes will say)
pnpm cf:dashboard
pnpm cf:bot
```

If an update includes a **database migration**, it's applied from your computer
with Supabase's admin string in `DATABASE_MIGRATION_URL` (`.env`):
`pnpm db:migrate`. Never put that string into Cloudflare.

---

## If something's wrong

| What you see                                                              | What to do                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight: `Used disallowed intents` / Server Members off                 | Step 2.3, then **Save Changes**.                                                                                                          |
| Preflight: `password authentication failed` or `Tenant or user not found` | User must be `garrison_bot.pijtbyfnhdxhtyidgcda` (or `garrison_web.…`), and the password from Step 3.                                     |
| Preflight: `logs in as "postgres"`                                        | You used Supabase's own string. Use the role strings from Step 3.                                                                         |
| Dashboard shows an error page; Cloudflare logs mention "database login"   | The Hyperdrive config's user must be `garrison_web.pijtbyfnhdxhtyidgcda` (6b).                                                            |
| Sign in goes back to the login page, or Discord says "Invalid redirect"   | `APP_URL` (6c) and the Discord redirect (6f) must match exactly, both `https://`. Redeploy after changing `APP_URL`.                      |
| `pnpm cf:bot` says Docker isn't running                                   | Start Docker Desktop and try again.                                                                                                       |
| Bot logs show it restarting over and over                                 | Usually a wrong `DATABASE_URL` or token. Run `pnpm preflight` with the same values in `.env`, fix, `wrangler secret put` again.           |
| Bot goes offline after a while and doesn't come back                      | Send me the output of `pnpm cf:bot:logs`. The fallback is running the bot on a small VPS (below) while the dashboard stays on Cloudflare. |
| Slash commands don't show up                                              | `pnpm commands:deploy`, then wait a few minutes and restart Discord.                                                                      |

Dashboard logs: Cloudflare dashboard → **Workers & Pages** → `garrison-dashboard`
→ **Logs** (or `cd apps/web && npx wrangler tail`).

---

## Appendix: one server with Docker Compose instead

The same code runs on any small Linux VPS (1 vCPU, 1–2 GB RAM) with
`docker compose`, which also gets the HTTPS certificate. Useful as a fallback
for the bot, or for everything.

1. Point a domain at the server's IP (an **A record**).
2. Install Docker: `curl -fsSL https://get.docker.com | sh`.
3. Open only ports 22, 80 and 443: `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`.
4. Clone the repo, `cp .env.example .env && chmod 600 .env`, and fill in
   `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
   `DATABASE_URL`, `WEB_DATABASE_URL`, `DOMAIN`, and optionally `ANTHROPIC_API_KEY`.
5. Start:

   ```sh
   docker compose build
   docker compose run --rm bot node dist/preflight.js
   docker compose run --rm bot node dist/deploy-commands.js
   docker compose up -d
   docker compose logs -f bot
   ```

To run only the bot there (dashboard on Cloudflare): `docker compose up -d bot`.
Run exactly **one** bot at a time, anywhere. Two would each answer every command.
