# Scaling: the database and every connection limit

Drafted 2026-11-18 from production numbers, for when Garrison goes from a couple of servers to
many. It lists every limit between a member and the database, what happens at each as traffic
grows, and what to change at each stage, so the work happens before anyone notices, not after.

**Done on 2026-11-18** (branch `claude/garrison-dashboard-errors-c0gcd3`): Stage 1 steps 1 to 6,
Stage 2 step 3 for the health snapshot, and Stage 3 step 1 (`shards: "auto"`). Still open: Stage 0
step 1 (Hyperdrive, in the Cloudflare dashboard), migration `0073_retention` on production, and
everything that waits on real traffic (compute, pool sizes, Discord read cache, AI budget).

Whoever picks this up: check the "Signals" queries first. The stages are triggered by what those
show, not by a date. The server counts in each stage are estimates (see "How the estimates were
made"); the signals are what count.

## Where things stand (measured 2026-11-18)

| | Today |
|---|---|
| Supabase compute | **Micro** (1 GB memory, shared 2-core ARM; matches `shared_buffers` 224 MB) |
| Postgres `max_connections` | 60 |
| Supavisor (shared pooler) pool size | 15 (per the 2026-11-17 incident notes; check Database Settings) |
| Supavisor max clients | 200 |
| Database size | 15 MB (Micro's recommended ceiling is 10 GB) |
| Servers | 2 |
| Slowest bot query, average | under 1 ms; busiest are the request queue's claims |
| Hyperdrive (`garrison-web`) | origin: Supavisor **session** mode (5432), `origin_connection_limit` **60**, caching off |
| Bot | one Cloudflare Container (`basic`), one Discord gateway connection, pool of 5 through Supavisor **transaction** mode (6543) |

The database itself is nowhere near a limit. What will limit Garrison first are the connection
counts between each piece, and a few loops in the bot that do one database round trip per
server or per member.

## Every limit, in order

From the outside in. "Hit" says what a member sees when it's reached.

| Limit | Value | Where it's set | Hit |
|---|---|---|---|
| Discord gateway shards | 1 (no sharding) | `apps/bot/src/index.ts` `new Client` | Discord **refuses to connect** a single shard at 2,500 servers |
| Discord REST | 50 requests/s per bot, plus per-route buckets | Discord | discord.js waits and retries; dashboard reads retry once, then show "This page couldn't load" |
| Dashboard Discord reads cache | 30 s, per Worker isolate | `apps/web/lib/discord.ts` `READ_TTL_MS` | More Discord calls per page view as traffic spreads over isolates |
| Dashboard requests waiting per server | 10 | `MAX_PENDING_PER_GUILD`, `packages/db/src/repo/actions.ts` | "Garrison has 10 requests waiting for this server" |
| Dashboard requests per person | 5 a minute | `MAX_PER_USER_PER_MINUTE`, same file | "That's a lot of requests at once" |
| Requests the bot takes per pass | 10, every 5 s or on a poke | `claimDashboardActions(…, 10)`, `ACTIONS_INTERVAL_MS` | Requests wait longer in "Queued" |
| Request lifetime | 10 min | `ACTION_TTL_MS` | "Garrison didn't get to this in time" |
| AI assistant | 10 plan calls/h and 40 chat messages/h per server, a $2/day base budget for everyone, monthly supplies | `QM_ATTEMPTS_PER_HOUR`, `QM_CHAT_PER_HOUR`, `QM_DAILY_BUDGET_USD`, `docs/AI_SUPPLIES_V2.md` | Plain "try later" or "out of supplies" messages; the **daily budget pauses the assistant for every server** |
| Claude API | your Anthropic account's rate limits for the model | Anthropic Console | "The AI assistant is busy. Try again in a minute." |
| AI moderation (OpenAI) | 60 checks/min per server | `AI_PER_MINUTE`, `apps/bot/src/modules/watch/automod.ts` | Messages past it skip the AI check (rules still run) |
| Dashboard database clients | 5 connections per request | `apps/web/lib/db.ts` | Queries on one page wait for each other |
| Bot database pool | 5 connections | `createDb` default, `packages/db/src/client.ts` | Every bot feature waits for a free connection |
| Billing database client | 1 connection | `apps/web/lib/billing.ts` | Stripe webhooks wait |
| Hyperdrive to database | 60 connections | Cloudflare dashboard, Hyperdrive `garrison-web` | **Above the pooler's 15, so the pooler refuses the extras: pages fail** |
| Supavisor pool size | 15 | Supabase → Database Settings → Connection pooling | Past it, session-mode clients are refused and transaction-mode clients queue |
| Supavisor max clients | 200 | Compute size | New connections refused |
| Postgres `max_connections` | 60 | Compute size | New connections refused (Supabase's own services use some) |
| Compute memory and CPU | 1 GB, shared CPU | Compute size | Slower queries as tables outgrow memory |

## What breaks first, and what to do: by stage

### Stage 0: before inviting people (do now)

1. **Lower Hyperdrive's `origin_connection_limit` from 60 to 12.** It is the one setting that is
   wrong today: Hyperdrive will open up to 60 connections to a pooler that accepts 15 for the
   dashboard, so a burst of page loads gets refused connections and pages fail instead of
   waiting a few milliseconds. 12 leaves room for the billing client and the SQL editor.
   Cloudflare dashboard → Hyperdrive → `garrison-web` → Settings. No deploy needed.
2. **Confirm the pool size** in Supabase → Database Settings → Connection pooling. If it isn't
   15, set Hyperdrive to a little under it instead.
3. **Deploy branch `claude/garrison-dashboard-errors-c0gcd3`.** It makes the bot restart itself
   when its database stops answering (the 11-hour outage on 2026-11-18), adds error pages with
   retry, and removes a round trip from every dashboard page.

### Stage 1: the first busy servers (rough guide: 50 to 300 servers)

Nothing is near a limit yet in raw capacity. The work here is the bot's per-minute loops, which
do one round trip at a time and slow down in a straight line as servers and members grow.

1. **Batch the metrics flush** (`Metrics.flush`, `apps/bot/src/lib/metrics.ts`). Every minute it
   writes, one statement at a time:
   - one upsert per server for message counts (`addMessageCounts`),
   - one upsert per server per hour for command reply times (`saveLatencyHour`), rewritten every
     minute for the current hour,
   - one upsert per member seen in the last 15 minutes (`markSeen`),
   and only then the heartbeat. Make each a single multi-row `insert … on conflict do update`,
   the way `addActivity` (`packages/db/src/repo/insights.ts`) already chunks its rows. One
   round trip per table instead of one per row.
2. **Write the heartbeat first, or on its own timer.** Today it's the flush's last write, so a
   slow flush delays it; past 3 minutes the status page and the dashboard show the bot as not
   running while it's working. (The watchdog from 2026-11-18
   probes separately, so it isn't fooled; the public status page is.)
3. **Don't let flushes overlap.** `flushTimer` is a plain `setInterval`: a flush longer than a
   minute starts the next one on top of it, both on the same five connections. Skip a tick when
   one is still running, as the sweep already does (`sweeping`).
4. **Batch voice XP** (`sweepVoiceXp`, `apps/bot/src/modules/ranks/voice.ts`): one `awardXp` per
   person in voice per minute, one after another. Award a server's members in one statement and
   handle level-ups from what it returns.
5. **Retention for tables that only grow.** Cases and settings history are kept on purpose. These
   aren't, and nothing prunes them:
   - `dashboard_actions`: keep 30 days (the dashboard shows the latest 30 per server).
   - `command_latency_hourly`: keep 90 days (the status page shows 30).
   - `qm_messages`: decide how long AI conversations are kept (privacy as much as size), e.g. 90 days.
   - `ai_usage`: keep at least the current and previous month (supplies are monthly), then
     roll up by month if cost reports are wanted.
   Add them to an existing prune path (`ledger_prune` / `insights_prune` are SQL functions the
   bot role may call but that only delete what's past retention; copy that pattern).
6. **Add the four foreign-key indexes** the Supabase performance advisor lists
   (`guild_plans.bundle_id`, `qm_builds.continues_id`, `qm_messages.build_id`,
   `ticket_notes.guild_id`). Cheap now, slow to add on big tables later.
7. **Leave the 17 "unused" indexes alone for now.** The advisor flags them, but its statistics
   are 12 days old on 2 servers: most cover pages and features nobody has used yet (economy,
   ledger filters, ticket search). Re-check after a month of real traffic.

### Stage 2: hundreds to a thousand-plus servers

1. **Upgrade compute Micro → Small** (~$15/month; 2 GB, 90 connections, 400 pooler clients) when
   CPU or memory on Supabase's Observability page stays high, or the database outgrows ~1 GB.
   Medium (~$60; 4 GB, 120, 600) after that. An upgrade has about 2 minutes of downtime:
   schedule it.
2. **Raise the pool size with it**, then the clients under it, always in this order (inside out):
   pool size (Supabase) → Hyperdrive limit (a little under the pool size) → bot pool `max`
   (10) → nothing else. Supabase's guidance: up to 80% of `max_connections` for the pool when the
   Data API isn't used, which it isn't here.
3. **Run per-server sweeps with a little concurrency.** Some sweeps loop over servers one at a
   time (`snapshotAllHealth` every 30 min does; check the others in `index.ts`'s sweep list). Past a few hundred servers a
   pass gets long. Run 4 to 8 servers at once with a small concurrency helper, never all at once
   (Discord's per-route limits).
4. **Share the dashboard's Discord reads across isolates.** Each Worker isolate has its own 30 s
   cache, so with traffic spread over many isolates nearly every page view asks Discord for the
   server's roles and channels again. Cache those two reads in Cloudflare's Cache API for 30 s.
   Never cache the access check (`memberNow`): it must stay live.
5. **Raise the AI daily budget** (`QM_DAILY_BUDGET_USD`) as paying servers grow: at $2 the
   whole assistant pauses for every server once it's spent. Each paying server already adds its
   share; check the free share isn't what runs it out.

### Stage 3: towards 2,500 servers and beyond

1. **Shard the bot before 2,500 servers: this one is a hard wall.** Discord refuses a
   single-shard bot at 2,500 servers. Start at ~1,500 to leave time. In one process
   `new Client({ shards: "auto", … })` is enough up to several thousand servers. Bigger, run
   discord.js's `ShardingManager` with several processes in the one container (memory: move the
   container off `basic`). Every in-memory cache in the bot is per process, so check each
   `Map`-based cooldown and cache still makes sense per shard (most are per server, and Discord
   puts a server on exactly one shard).
2. **Use the dedicated pooler (PgBouncer)** for the bot instead of the shared Supavisor: it runs on
   the database machine, so each round trip is shorter. It's IPv6 (or IPv4 with the add-on), so
   check the container can reach it first.
3. **A read replica for the dashboard's heavy reads** (Insights, exports, Ledger search) if they
   start to slow the bot's writes.

## Signals: what to watch, and what each means

Run these in the Supabase SQL editor (read-only).

Connections by role, right now: anything near the pool size means the next stage.

```sql
select usename, state, count(*) from pg_stat_activity
where usename like 'garrison%' group by 1, 2 order by 1, 2;
```

The heaviest queries since the stats were reset: rising `mean_ms` on the top rows is the earliest
warning of a missing index or an outgrown compute.

```sql
select r.rolname, s.calls, round(s.mean_exec_time::numeric, 2) mean_ms,
       round(s.total_exec_time::numeric / 1000, 1) total_s, left(s.query, 120) query
from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid
where r.rolname in ('garrison_bot', 'garrison_web')
order by s.total_exec_time desc limit 20;
```

Table growth: the tables in Stage 1 step 5 should stop growing once pruned.

```sql
select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 15;
```

Is the bot alive, and how long have requests been waiting?

```sql
select last_beat_at, now() - last_beat_at as silent from bot_status;
select kind, status, count(*), max(now() - created_at) oldest
from dashboard_actions where created_at > now() - interval '1 day' group by 1, 2;
```

Bot log lines (Cloudflare → Workers → `garrison-bot` → Logs, or `pnpm cf:bot:logs`):

| Line | Means |
|---|---|
| `The database is slow to answer` | A round trip took over 300 ms. Now and then: the pooler. Often: the container is far from us-west-2, or the database is overloaded |
| `Sweep step was slow` / `Sweep step is stuck` | A per-server loop outgrew its time: Stage 1 step 4 or Stage 2 step 3 |
| `Dashboard requests pass is stuck` | A request (usually AI chat) took over 3 minutes |
| `The database hasn't answered in minutes; restarting the bot` | The watchdog restarted the bot. Once is a blip; repeatedly means the pool is too small or the pooler is refusing connections |

Supabase → Observability: CPU, memory, and pooler client connections. Cloudflare → Hyperdrive →
`garrison-web` → Metrics: query latency, and connection errors (which mean the Hyperdrive limit
is above the pool size again).

## Things not to change

- **`prepare: false`** in `createDb`: required for Supavisor's transaction mode, which the bot uses.
- **The dashboard's 5 connections per request**: Cloudflare's advice for postgres-js behind
  Hyperdrive. Fewer runs a page's queries one after another; more only adds connections.
- **`fetchTypes: false` on the dashboard's Worker clients** is safe because nothing the dashboard
  runs returns an array from raw `sql`. If you add a raw query that does, read the column through
  Drizzle or parse it, or it comes back as text like `{a,b}`.
- **The two database roles** (`garrison_bot`, `garrison_web`): every connection change keeps each
  piece on its own role, whatever the pool sizes are.

## How the estimates were made

The bot's per-minute flush does about one round trip per active server (message counts), one per
server that ran a command this hour (reply times) and one per member first seen in the last 15
minutes, one after another. At 1,000 active servers and 20,000 active members that's about 2,800
round trips a minute: 28 s at 10 ms each, 84 s at 30 ms, so somewhere between 500 and 1,000
servers it stops fitting in its minute. The round trip from the container to the database isn't
measured yet; the bot's new `The database is slow to answer` warning and a timing in that probe
would pin it down. Discord's 2,500-server limit is Discord's own and doesn't move. Compute sizes
and connection counts are from Supabase's compute docs as of 2026-11-18; check them before
upgrading.
