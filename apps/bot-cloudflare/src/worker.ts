import { WorkerEntrypoint } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";

/**
 * Runs Garrison's bot (the `bot` image from the repo's Dockerfile) on
 * Cloudflare Containers, as exactly one always-on instance.
 *
 * - One instance: the Durable Object named "garrison" owns the container, and
 *   Durable Objects are unique, so two bots never answer the same command.
 * - Always on: a container normally sleeps when idle. Garrison's work comes in
 *   over its own connection to Discord, not through this Worker, so it never
 *   looks busy; onActivityExpired keeps it running instead of stopping it.
 * - Restarted: Cloudflare can move or restart containers. A cron trigger checks
 *   every minute and starts it again if it isn't running.
 * - Private: the Worker has no public routes. Nothing reaches the bot from the
 *   internet; the health check is only called from the cron below.
 */

interface Env {
  BOT: DurableObjectNamespace<GarrisonBot>;
  // Secrets, set with `wrangler secret put` (never in wrangler.jsonc):
  DISCORD_TOKEN: string;
  DATABASE_URL: string;
  ANTHROPIC_API_KEY?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  OPENAI_API_KEY?: string;
  // Plain settings, from wrangler.jsonc vars:
  DISCORD_CLIENT_ID: string;
  APP_URL?: string;
  QM_MODEL?: string;
  QM_DAILY_BUDGET_USD?: string;
  LOG_LEVEL?: string;
}

const HEALTH_PORT = 8080;

export class GarrisonBot extends Container<Env> {
  override defaultPort = HEALTH_PORT;
  override sleepAfter = "1h";

  constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
    super(ctx, env);
    // Only what the bot needs. Optional values are left out when unset.
    const vars: Record<string, string> = {
      DISCORD_TOKEN: env.DISCORD_TOKEN,
      DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DATABASE_URL: env.DATABASE_URL,
      HEALTH_PORT: String(HEALTH_PORT),
      LOG_LEVEL: env.LOG_LEVEL ?? "info",
    };
    if (env.ANTHROPIC_API_KEY) vars.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    if (env.TWITCH_CLIENT_ID) vars.TWITCH_CLIENT_ID = env.TWITCH_CLIENT_ID;
    if (env.TWITCH_CLIENT_SECRET) vars.TWITCH_CLIENT_SECRET = env.TWITCH_CLIENT_SECRET;
    if (env.OPENAI_API_KEY) vars.OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (env.QM_MODEL) vars.QM_MODEL = env.QM_MODEL;
    if (env.QM_DAILY_BUDGET_USD) vars.QM_DAILY_BUDGET_USD = env.QM_DAILY_BUDGET_USD;
    if (env.APP_URL) vars.APP_URL = env.APP_URL;
    this.envVars = vars;
  }

  /** Never sleep: the bot is busy on its own Discord connection even when this Worker is quiet. */
  override async onActivityExpired() {
    this.renewActivityTimeout();
  }

  override onStop(params: { exitCode?: number; reason?: string }) {
    console.log("Garrison bot stopped", params);
  }

  override onError(error: unknown) {
    console.error("Garrison bot container error", error);
    throw error;
  }
}

/**
 * Private: reachable only through a service binding (the dashboard's), never from
 * the internet. The dashboard calls poke() right after queuing a request, so the
 * bot runs it now instead of on its next check.
 */
export class BotControl extends WorkerEntrypoint<Env> {
  async poke(): Promise<void> {
    const bot = getContainer(this.env.BOT, "garrison");
    const res = await bot.fetch(new Request("http://garrison/poke", { method: "POST" }));
    if (!res.ok && res.status !== 202) console.warn("Garrison bot poke failed", res.status);
  }
}

export default {
  /** No public routes. */
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },

  /** Every minute: start the bot if it isn't running, and confirm it's healthy. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const bot = getContainer(env.BOT, "garrison");
    ctx.waitUntil(
      bot
        .fetch(new Request("http://garrison/healthz"))
        .then(async (res) => {
          if (!res.ok) console.warn("Garrison bot not healthy yet", res.status, await res.text());
        })
        .catch((error: unknown) => console.error("Garrison bot health check failed", error)),
    );
  },
} satisfies ExportedHandler<Env>;
