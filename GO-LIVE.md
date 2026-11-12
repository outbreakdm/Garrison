# Go live: the browser-only checklist

You don't need to install anything. GitHub's servers build Garrison and put it
on Cloudflare. You only click through five websites: **IONOS, Cloudflare,
Supabase, Discord and GitHub.**

Keep a private note open (Notepad is fine; don't save it anywhere shared). You
will collect **12 things** into it. Each one is marked like **[1]**.

Never paste the secret ones (token, secret, passwords, API token) into chat,
Discord, or a file in the repository.

Cost: Cloudflare Workers Paid is $5/month. The always-on bot container adds
about $7/month (1 GiB memory, around the clock). Supabase and GitHub stay free.

---

## Part 1. Put your IONOS domain on Cloudflare (10 min, then wait)

Cloudflare needs to run your domain's DNS so the dashboard can live at an
address like `dash.yourdomain.com`.

1. **IONOS: turn off DNSSEC, if it's on.** Log in at ionos.com → **Menu → Domains & SSL**
   → click your domain → look for **DNSSEC**. If it's **on**, turn it **off** and save.
   (If you don't see it, or it's already off, skip this.)
2. **Cloudflare: add the domain.** dash.cloudflare.com → **Add** (top right) →
   **Connect a domain** (or **Add a domain**) → type `yourdomain.com` → keep
   **Quick scan** → **Continue** → choose the **Free** plan → **Continue** through the
   DNS records screen.
3. Cloudflare now shows **two nameservers**, like `ada.ns.cloudflare.com` and
   `kai.ns.cloudflare.com`. Keep this page open.
4. **IONOS: switch the nameservers.** **Domains & SSL** → your domain → the
   **gear / ⋯** menu → **Adjust name servers** (may be called **Name server**
   settings) → choose **Use custom name servers** (or **Other name servers**) →
   delete whatever is there → enter Cloudflare's two names **exactly** → **Save**.
5. Back in Cloudflare, click **Check nameservers**. It shows **Pending**, then
   **Active**. Usually minutes, sometimes up to 24 hours. Cloudflare emails you.
   You can do Parts 2–5 while you wait.
6. Pick the dashboard's address: **`dash.yourdomain.com`**. Write it down: **[1] dashboard domain**.

---

## Part 2. Cloudflare (10 min)

1. **Upgrade to Workers Paid.** dash.cloudflare.com → left menu **Workers & Pages**
   (under Compute) → **Plans** (or **Upgrade**) → **Workers Paid** → add payment.
2. **Account ID.** On the **Workers & Pages** page, the right side shows
   **Account ID** → copy → **[2] Account ID**.
3. **Database connection (Hyperdrive).** Do Part 3 first if you don't have the
   database details yet, then come back.
   Left menu **Storage & Databases → Hyperdrive → Create configuration**:
   - Name: `garrison-web`
   - Choose to enter the connection **details** (not a connection string, if offered both)
   - Host: **[8] pooler host**
   - Port: `5432` ← the **Session** pooler port, not 6543
   - Database: `postgres`
   - User: `garrison_web.pijtbyfnhdxhtyidgcda`
   - Password: **[10] dashboard password**
   - Pick **connect to an existing/public database** (PostgreSQL / Supabase), **not**
     "Create a PlanetScale database" (that's a separate paid database you don't need).
   - **Create**. If it errors, the password or host is wrong.
   - Open the new config → **Settings** → **Caching** → turn caching **off**.
     (Cached reads would show stale settings and let a signed-out session work for up to a minute.)
   - Copy the **ID** (32 letters and numbers) → **[3] Hyperdrive ID**.
4. **API token for GitHub.** Click your profile icon (top right) → **My Profile** →
   **API Tokens** (or **Manage Account → Account API Tokens**) → **Create Token** →
   next to **Edit Cloudflare Workers** click **Use template**. Then:
   - **Account Resources:** Include → your account.
   - **Zone Resources:** Include → **Specific zone** → your domain.
     (If the domain isn't Active yet, choose **All zones**.)
   - If the permission list lets you add more, click **+ Add more** → **Account** →
     **Containers** → **Edit**. (If "Containers" isn't in the list, skip it.)
   - **Continue to summary** → **Create Token** → copy it now (it's shown once) →
     **[4] Cloudflare API token**.

---

## Part 3. Supabase (5 min)

Your two Garrison database logins are already switched on. You need their passwords.

1. **If you have both passwords** from when you ran the `ALTER ROLE` lines, write
   them down as **[9] bot password** and **[10] dashboard password** and skip to step 3.
2. **If you don't**, make new ones (letters and numbers only, about 40
   characters; your password manager can generate them). Supabase → your
   **Garrison** project → **SQL Editor** → **New query** → paste, fill in, **Run**:

   ```sql
   ALTER ROLE garrison_bot WITH LOGIN PASSWORD 'NEW-BOT-PASSWORD';
   ALTER ROLE garrison_web WITH LOGIN PASSWORD 'NEW-DASHBOARD-PASSWORD';
   ```

   Then delete that query from the list on the left.
3. **Pooler host.** Top of the project → **Connect** → find **Transaction pooler**.
   The string looks like
   `postgresql://postgres.pijtbyfnhdxhtyidgcda:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres`.
   Copy only the part **between `@` and `:`**, e.g. `aws-0-us-west-2.pooler.supabase.com`
   → **[8] pooler host**.
4. Build two lines in your note. Swap in **[8]**, **[9]**, **[10]**. Everything else
   stays exactly as written, including the dot after `garrison_bot`:

   **[11] bot database string**

   ```
   postgresql://garrison_bot.pijtbyfnhdxhtyidgcda:BOT-PASSWORD@POOLER-HOST:6543/postgres?sslmode=require
   ```

   **[12] dashboard database string**

   ```
   postgresql://garrison_web.pijtbyfnhdxhtyidgcda:DASHBOARD-PASSWORD@POOLER-HOST:6543/postgres?sslmode=require
   ```

---

## Part 4. Discord (5 min)

discord.com/developers/applications → click your bot's application.

1. **General Information** → **Application ID** → copy → **[5] Application ID**.
2. **Bot** (left menu):
   - **Reset Token** → **Yes, do it!** → copy → **[6] bot token**.
   - **Privileged Gateway Intents**: **Server Members Intent** ON, **Message Content Intent** ON.
     Leave Presence Intent off. Click **Save Changes** at the bottom.
   - **Public Bot**: OFF for now. **Save Changes**.
3. **OAuth2** (left menu) → **Client Secret** → **Reset Secret** → copy → **[7] client secret**.
4. Still on **OAuth2** → **Redirects** → **Add Redirect** → type
   `https://` + **[1]** + `/auth/callback`
   (e.g. `https://dash.yourdomain.com/auth/callback`) → **Save Changes**.

---

## Part 5. GitHub: paste everything in (5 min)

github.com/outbreakdm/Garrison → **Settings** (top tab) → left menu
**Secrets and variables → Actions**.

**Secrets** tab → **New repository secret**, once per row. The name must match exactly:

| Name                    | Value                                                  |
| ----------------------- | ------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | **[4]**                                                |
| `CLOUDFLARE_ACCOUNT_ID` | **[2]**                                                |
| `DISCORD_TOKEN`         | **[6]**                                                |
| `DISCORD_CLIENT_SECRET` | **[7]**                                                |
| `DATABASE_URL`          | **[11]** (the garrison_**bot** one)                    |
| `WEB_DATABASE_URL`      | **[12]** (the garrison_**web** one)                    |
| `ANTHROPIC_API_KEY`     | optional: only if you want `/qm build` (Quartermaster) |
| `TWITCH_CLIENT_ID`      | optional: Twitch live alerts (a Twitch app's client ID) |
| `TWITCH_CLIENT_SECRET`  | optional: the same Twitch app's client secret           |
| `OPENAI_API_KEY`        | optional: AI moderation on Pro (free moderation endpoint) |

**Variables** tab → **New repository variable**:

| Name                | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| `DISCORD_CLIENT_ID` | **[5]**                                                                        |
| `APP_URL`           | `https://` + **[1]**, e.g. `https://dash.yourdomain.com` (no slash at the end) |
| `HYPERDRIVE_ID`     | **[3]**                                                                        |
| `DASHBOARD_DOMAIN`  | **[1]**, e.g. `dash.yourdomain.com` (no https)                                 |

Don't add any `BNET_…` items; they're for an optional WoW feature.

---

## Part 6. Press the button (10 min of waiting)

Wait until Cloudflare shows your domain as **Active** (Part 1.5).

1. GitHub → **Actions** tab → left list **Deploy to Cloudflare** → **Run workflow**
   (right side) → leave **everything** and the checkbox ticked → green **Run workflow**.
2. Click the run that appears. Each step turns green ✓ in turn. It takes about 10 minutes.
3. If a step turns **red ✗**: click it, find the red line, and send it to me
   (remove anything that looks like a password or token first). The first two
   steps check your settings and say exactly what's missing or wrong.

---

## Part 7. Check it's live (5 min)

1. Open `https://dash.yourdomain.com/healthz`. It should say **ok**.
2. Open `https://dash.yourdomain.com/status`. Within 2–3 minutes it should say
   **Garrison is online**. Refresh if needed.
3. **Add the bot to your server:** in the finished GitHub run, click the
   **Preflight** step and find the line `→ Invite link: https://discord.com/oauth2/…`.
   Open it, pick your server, **Authorize**.
4. In Discord: **Server Settings → Roles** → drag **Garrison** above the roles it
   should be able to moderate → save.
5. In any channel, type `/health` and press Enter.
6. Go to `https://dash.yourdomain.com` → **Sign in with Discord** → pick your server.

**Done.** To update later: **Actions → Deploy to Cloudflare → Run workflow**.

---

## If something goes wrong

| You see                                                                                      | Do this                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run fails at **Check that every secret and variable is set**                                 | It lists the missing names. Add them in Part 5 (exact spelling).                                                                                                            |
| Preflight: `DISCORD_TOKEN was rejected`                                                      | Reset the token again (Part 4.2) and update the `DISCORD_TOKEN` secret.                                                                                                     |
| Preflight: `Server Members Intent is off`                                                    | Part 4.2, then **Save Changes**.                                                                                                                                            |
| Preflight: `couldn't log in` / `password authentication failed` / `Tenant or user not found` | Check **[11]**/**[12]**: the user must be `garrison_bot.pijtbyfnhdxhtyidgcda` (with the dot), and the password correct. Or reset the passwords (Part 3.2).                  |
| `Authentication error` / `10000` during a Deploy step                                        | The API token needs more permissions (Part 2.4): make sure your account is included, and add **Containers → Edit** if it's offered. Make a new token and update the secret. |
| Dashboard page shows an error                                                                | Usually Hyperdrive: the user must be `garrison_web.pijtbyfnhdxhtyidgcda`, port 5432. Edit it in Cloudflare → Hyperdrive.                                                    |
| Sign-in goes back to the login page                                                          | The Discord redirect (Part 4.4) and `APP_URL` must match exactly.                                                                                                           |
| Domain still **Pending** after a day                                                         | IONOS still has old nameservers or DNSSEC on: recheck Part 1.1 and 1.4.                                                                                                     |
