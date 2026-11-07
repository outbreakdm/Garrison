# Deploying Garrison

Garrison is two processes and a database:

- **Bot** (`apps/bot`): a long-running worker connected to Discord. No inbound traffic.
- **Dashboard** (`apps/web`): a Next.js server behind HTTPS.
- **Database**: your Supabase project (already migrated).

Both come from one `Dockerfile` (`--target bot`, `--target web`). The quickest
route is one small Linux server running `docker compose`, which also gets the
HTTPS certificate for you. Other hosts are covered at the end.

## 1. Discord Developer Portal

In your application (https://discord.com/developers/applications):

1. **Bot → Privileged Gateway Intents**: turn on **Server Members Intent**.
   **Message Content Intent** can be on too; Garrison asks for it only once
   automod is enabled.
2. **Bot → Public Bot**: turn **off** while you test, so only you can add it.
3. **Bot → Token**: reset and copy it. This is `DISCORD_TOKEN`. Never paste it
   into chat or commit it.
4. **General Information → Application ID**: this is `DISCORD_CLIENT_ID`.
5. **OAuth2 → Client secret**: reset and copy. This is `DISCORD_CLIENT_SECRET`.
6. **OAuth2 → Redirects**: add `https://<your domain>/auth/callback`.

## 2. Let Garrison's database roles log in

The bot and dashboard each have their own least-privilege role. They can't log
in until you give them passwords. In Supabase → **SQL Editor**, run this with
two new random passwords (for example from `openssl rand -hex 24`):

```sql
ALTER ROLE garrison_bot WITH LOGIN PASSWORD '<bot password>';
ALTER ROLE garrison_web WITH LOGIN PASSWORD '<dashboard password>';
```

Then build the two connection strings from Supabase → **Connect** →
**Transaction pooler** (port 6543). Replace the user with the role name plus
your project ref, `pijtbyfnhdxhtyidgcda`:

```
DATABASE_URL=postgresql://garrison_bot.pijtbyfnhdxhtyidgcda:<bot password>@<pooler host>:6543/postgres
WEB_DATABASE_URL=postgresql://garrison_web.pijtbyfnhdxhtyidgcda:<dashboard password>@<pooler host>:6543/postgres
```

Use the pooler host shown in the Connect panel (the project is in `us-west-2`).
The bot and dashboard refuse to start if these log in as `postgres` or any
role that bypasses row-level security.

## 3. A server

Any small Linux VPS works (1 vCPU and 1–2 GB of RAM is plenty to start), for
example Hetzner, DigitalOcean, Vultr or Linode, in a US-West region near the database.

1. Point a domain or subdomain (say `dash.example.com`) at the server's IP with
   an **A record**.
2. Install Docker: `curl -fsSL https://get.docker.com | sh`.
3. Open only ports 22, 80 and 443 (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).
4. Clone the repository and create `.env` from `.env.example`:

   ```sh
   git clone https://github.com/outbreakdm/Garrison.git && cd Garrison
   cp .env.example .env && chmod 600 .env && nano .env
   ```

   Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
   `DATABASE_URL`, `WEB_DATABASE_URL`, `DOMAIN`, and optionally
   `ANTHROPIC_API_KEY`. `DATABASE_MIGRATION_URL` isn't needed on the server.

## 4. Check, then start

```sh
docker compose build
# Read-only check of the token, intents, database roles and schema:
docker compose run --rm bot node dist/preflight.js
# Register slash commands (once, and after any command changes):
docker compose run --rm bot node dist/deploy-commands.js
docker compose up -d
docker compose logs -f bot   # look for "Online as Garrison#…"
```

Preflight prints an invite link. Open it to add Garrison to your server, then
run `/health` there. The dashboard is at `https://<your domain>`, and the public
status page at `/status`.

## Updating

```sh
git pull
docker compose build
docker compose run --rm bot node dist/deploy-commands.js   # if commands changed
docker compose up -d
```

New database migrations are applied from a trusted machine with
`DATABASE_MIGRATION_URL` set (`pnpm db:migrate`), never from the server.

## Other hosts

- **Railway / Render**: create two services from this repository, with
  Dockerfile targets `bot` and `web`. Give each only its own variables (as in
  `docker-compose.yml`). For the bot, set `HEALTH_PORT=8080` and use `/healthz`
  as its health check; the web service listens on port 3000 and has `/healthz` too.
- **Fly.io**: `fly launch` once per target with `--dockerfile Dockerfile` and
  `build.target` set to `bot` or `web`. Run the bot as a single machine: two
  copies would each answer every command.
- **Vercel** (dashboard only): set the root to `apps/web` and the same
  variables; the bot still needs an always-on host.

Run exactly **one** bot process at a time. Discord delivers each event to every
connected copy.

## If something's wrong

| Symptom                                                       | Fix                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Used disallowed intents`                                     | Turn on Server Members Intent (step 1).                                          |
| `logs in as "postgres"`                                       | Use the `garrison_bot` / `garrison_web` strings (step 2).                        |
| `password authentication failed` / `Tenant or user not found` | The user must be `garrison_bot.<project ref>`, with the password from step 2.    |
| Sign-in loops back to the login page                          | `DOMAIN` must match the redirect in step 1.6, and the site must load over HTTPS. |
| Commands don't appear                                         | Run `deploy-commands.js`; global commands can take a few minutes.                |
