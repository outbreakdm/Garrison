import {
  createDb,
  describeDbRole,
  markGuildLeft,
  pingDb,
  roleProblem,
  upsertGuild,
} from "@garrison/db";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { BotContext } from "./commands/types.js";
import { loadEnv } from "./env.js";
import { handleInteraction } from "./interactions.js";

import { ensureGuild, forgetGuild } from "./lib/guild-registry.js";
import { startHealthServer } from "./lib/health.js";
import { watchDatabase } from "./lib/liveness.js";
import { createLogger } from "./lib/logger.js";
import { Metrics, maybePruneOperations } from "./lib/metrics.js";
import { sweepAlerts } from "./modules/alerts/service.js";
import { refreshOsrs } from "./modules/barracks/refresh.js";
import { sweepStatRoles } from "./modules/barracks/stat-roles.js";
import { processDashboardActions } from "./modules/dashboard/actions.js";
import { sweepMessages } from "./modules/dispatch/service.js";
import { onEconomyMessage, sweepEconomy } from "./modules/economy/service.js";
import { handleAuditLogEntry } from "./modules/gatehouse/anti-nuke.js";
import { sweepWeeklyBackups } from "./modules/gatehouse/backup.js";
import { maybePruneAnswers } from "./modules/gatehouse/questions.js";
import { handleMemberJoin, sweepExpiredLockdowns } from "./modules/gatehouse/service.js";
import { sweepGiveaways } from "./modules/giveaways/service.js";
import { snapshotAllHealth } from "./modules/health/command.js";
import { primeInvites } from "./modules/ledger/invites.js";
import {
  maybePruneInsights,
  maybePruneLedger,
  onAuditEntry,
  onMemberJoin,
  onMemberLeave,
  onMessageDelete,
  onMessageEdit,
  onVoiceUpdate,
} from "./modules/ledger/service.js";
import { sweepOps } from "./modules/ops/service.js";
import { ClaudePlanner } from "./modules/quartermaster/planner.js";
import { sweepRally } from "./modules/rally/service.js";
import { handleMessage } from "./modules/ranks/service.js";
import { sweepVoiceXp } from "./modules/ranks/voice.js";
import { onStarReaction } from "./modules/starboard/service.js";
import { sweepServerStats } from "./modules/stats/service.js";
import { onDirectMessage } from "./modules/tickets/modmail.js";
import {
  loadOpenTickets,
  onTicketChannelDeleted,
  onTicketDelete,
  onTicketEdit,
  onTicketMessage,
  sweepTickets,
} from "./modules/tickets/service.js";
import { onVoiceRoomUpdate, sweepVoiceRooms } from "./modules/voice/service.js";
import { onAutomodMessage } from "./modules/watch/automod.js";
import { onPatternBlock, sweepPatterns } from "./modules/watch/patterns.js";
import { liftExpiredBans } from "./modules/watch/service.js";
import { welcomeJoin, welcomeLeave } from "./modules/welcome/service.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
// Fail closed: never run with a login that skips the database's own protections.
const problem = roleProblem(await describeDbRole(db), "garrison_bot");
if (problem) {
  logger.error(problem);
  await close();
  process.exit(1);
}
const ctx: BotContext = {
  db,
  logger,
  planner: env.ANTHROPIC_API_KEY
    ? new ClaudePlanner(env.ANTHROPIC_API_KEY, env.QM_MODEL)
    : undefined,
  metrics: new Metrics(),
  appUrl: env.APP_URL,
  qmDailyBudgetUsd: env.QM_DAILY_BUDGET_USD,
};
if (!ctx.planner) logger.info("AI assistant is off: set ANTHROPIC_API_KEY to enable /qm build");
const alertKeys = {
  twitch:
    env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET
      ? { clientId: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET }
      : null,
};
const automodKeys = { openai: env.OPENAI_API_KEY ?? null };
if (!automodKeys.openai) logger.info("AI moderation is off: set OPENAI_API_KEY to enable it");
if (!alertKeys.twitch)
  logger.info("Twitch alerts are off: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET");

// Guild Members is privileged: turn on "Server Members Intent" in the Developer Portal.
// Gatehouse needs it to see joins, and Guild Moderation (not privileged) for the
// audit-log stream anti-nuke watches. Message Content is privileged too: ticket
// transcripts, Ledger's deleted and edited text, and the starboard read it.
const client = new Client({
  // As many shards as Discord recommends (one per ~1,000 servers), all in this process.
  // Discord refuses a single-shard bot at 2,500 servers; with this it never is one. Today
  // that's one shard, as before (docs/SCALING.md, Stage 3).
  shards: "auto",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    // Not privileged. Rally needs it to see when a squad voice channel is empty.
    GatewayIntentBits.GuildVoiceStates,
    // Not privileged. Ranks only needs who posted and when.
    GatewayIntentBits.GuildMessages,
    // Privileged: turn on "Message Content Intent" in the Developer Portal.
    GatewayIntentBits.MessageContent,
    // Not privileged. The starboard counts reactions.
    GatewayIntentBits.GuildMessageReactions,
    // Not privileged. Modmail: members message Garrison directly.
    GatewayIntentBits.DirectMessages,
    // Not privileged. Ledger: which invite each member joined with.
    GatewayIntentBits.GuildInvites,
    // Not privileged. Automod patterns: Discord says when its AutoMod blocked a message.
    GatewayIntentBits.AutoModerationExecution,
  ],
  // Never ping from bot messages. Reasons and other user-typed text are echoed
  // back, and must not be able to trigger @everyone, role or user pings.
  allowedMentions: { parse: [], repliedUser: false },
  // Ledger needs leave and delete events for members and messages that aren't cached.
  // The starboard needs reactions on messages from before the last restart.
  // Channel: DMs arrive on channels Garrison hasn't cached (modmail).
  partials: [
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
    Partials.Channel,
  ],
});

const SWEEP_INTERVAL_MS = 60_000;
let sweepTimer: NodeJS.Timeout | undefined;
const ACTIONS_INTERVAL_MS = 5_000;
/** Set once Discord is ready; before that a poke has nothing to do. */
let drainActions: () => Promise<void> = async () => {};
let actionsTimer: NodeJS.Timeout | undefined;
const HEALTH_EVERY_MS = 30 * 60_000;
let lastHealthSnapshot = 0;
let flushTimer: NodeJS.Timeout | undefined;

/** The longest one sweep step may hold up the others; it keeps running on its own after. */
const STEP_LIMIT_MS = 45_000;
/**
 * The longest one pass over dashboard requests may hold the queue. A pass that hangs (a
 * database or Discord call that never answers) once held it for good: every later tick saw
 * it still running and did nothing. Now it's left to finish on its own and the next tick starts
 * a fresh pass. Claiming marks a request running, so two passes never take the same one.
 */
const PASS_LIMIT_MS = 3 * 60_000;
/** Steps still running from an earlier sweep: not started again until they finish. */
const inFlight = new Set<string>();

/**
 * One sweep step, never longer than STEP_LIMIT_MS for the sweep: a call that never answers
 * (Discord, a game API) is logged by name and left to finish on its own, so the rest of the
 * sweep, the next sweeps and the heartbeat carry on.
 */
async function step(name: string, run: () => Promise<unknown>) {
  if (inFlight.has(name)) {
    logger.warn("Sweep step still running from before; skipped", { step: name });
    return;
  }
  inFlight.add(name);
  const started = Date.now();
  const work = run()
    .catch((error: unknown) => logger.error(`${name} failed`, { error }))
    .finally(() => {
      inFlight.delete(name);
      const ms = Date.now() - started;
      if (ms > 20_000) logger.warn("Sweep step was slow", { step: name, ms });
    });
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), STEP_LIMIT_MS);
  });
  const result = await Promise.race([work.then(() => "done" as const), late]);
  clearTimeout(timer);
  if (result === "late")
    logger.error("Sweep step is stuck; moving on without it", { step: name, ms: STEP_LIMIT_MS });
}

client.once(Events.ClientReady, async (ready) => {
  logger.info(`Online as ${ready.user.tag} in ${ready.guilds.cache.size} servers`);
  // The heartbeat (and the metrics it carries) on its own timer: it says the bot is up even
  // while a slow sweep step is still waiting on someone else.
  flushTimer = setInterval(
    () =>
      void ctx.metrics
        ?.flush(ctx)
        .catch((error) => logger.error("Metrics flush failed", { error })),
    SWEEP_INTERVAL_MS,
  );
  await step("Load tickets", () => loadOpenTickets(ctx));
  for (const guild of ready.guilds.cache.values()) {
    await step("Register guild", () => ensureGuild(ctx, guild));
    await step("Prime invites", () => primeInvites(guild));
  }
  // Lift lockdowns whose time is up, including any that expired while we were offline.
  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await step("Lockdown sweep", () => sweepExpiredLockdowns(ctx, ready));
      await step("Rally sweep", () => sweepRally(ctx, ready));
      await step("Ops sweep", () => sweepOps(ctx, ready));
      await step("Voice XP", () => sweepVoiceXp(ctx, ready));
      await step("Voice rooms sweep", () => sweepVoiceRooms(ctx, ready));
      await step("Stat roles", () => sweepStatRoles(ctx, ready));
      // Run on their own: a rename or a rule Discord makes wait mustn't hold up the rest.
      sweepServerStats(ctx, ready);
      sweepPatterns(ctx, ready);
      sweepEconomy(ctx, ready);
      await step("Scheduled messages", () => sweepMessages(ctx, ready));
      await step("Alert sweep", () => sweepAlerts(ctx, ready, alertKeys));
      await step("Weekly backups", () => sweepWeeklyBackups(ctx, ready));
      await step("Temporary ban sweep", () => liftExpiredBans(ctx, ready));
      await step("Giveaway sweep", () => sweepGiveaways(ctx, ready));
      await step("Ticket sweep", () => sweepTickets(ctx, ready));
      await step("Ledger prune", () => maybePruneLedger(ctx));
      await step("Verification answers prune", () => maybePruneAnswers(ctx));
      await step("Insights prune", () => maybePruneInsights(ctx));
      await step("Operations prune", () => maybePruneOperations(ctx));
      await step("OSRS refresh", () => refreshOsrs(ctx));
      if (Date.now() - lastHealthSnapshot > HEALTH_EVERY_MS) {
        lastHealthSnapshot = Date.now();
        await step("Health snapshot", () => snapshotAllHealth(ctx, ready.guilds.cache.values()));
      }
    } finally {
      sweeping = false;
    }
  };
  // Timers first: the first sweep runs alongside, never in front of, everything else.
  sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  void sweep();
  // Dashboard requests: the dashboard pokes Garrison the moment it queues one; the
  // timer is the fallback when a poke is lost.
  let running = false;
  let again = false;
  drainActions = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const pass = processDashboardActions(ctx, ready).catch((error) =>
          logger.error("Dashboard actions failed", { error }),
        );
        let timer: NodeJS.Timeout | undefined;
        const late = new Promise<"late">((resolve) => {
          timer = setTimeout(() => resolve("late"), PASS_LIMIT_MS);
        });
        const result = await Promise.race([pass.then(() => "done" as const), late]);
        clearTimeout(timer);
        if (result === "late") {
          logger.error("Dashboard requests pass is stuck; the next tick starts a fresh one", {
            ms: PASS_LIMIT_MS,
          });
          break;
        }
      } while (again);
    } finally {
      running = false;
    }
  };
  actionsTimer = setInterval(() => void drainActions(), ACTIONS_INTERVAL_MS);
  void drainActions();
});

client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
  handleAuditLogEntry(ctx, entry, guild).catch((error) =>
    logger.error("Anti-nuke handling failed", { guildId: guild.id, error }),
  );
  void onAuditEntry(ctx, entry, guild);
});

client.on(Events.MessageCreate, (message) => {
  if (message.inGuild() && !message.author.bot && !message.webhookId)
    ctx.metrics?.message(
      message.guildId,
      message.author.id,
      Date.now(),
      message.channel.isThread()
        ? (message.channel.parentId ?? message.channelId)
        : message.channelId,
    );
  handleMessage(ctx, message).catch((error) =>
    logger.error("Ranks failed", { guildId: message.guildId, error }),
  );
  if (!message.inGuild() && client.isReady())
    onDirectMessage(ctx, client, message).catch((error) =>
      logger.error("Modmail failed", { error }),
    );
  onEconomyMessage(ctx, message).catch((error) =>
    logger.warn("Economy failed", { guildId: message.guildId, error }),
  );
  onAutomodMessage(ctx, message, automodKeys).catch((error) =>
    logger.warn("Automod failed", { guildId: message.guildId, error }),
  );
  onTicketMessage(ctx, message).catch((error) =>
    logger.error("Ticket transcript failed", { guildId: message.guildId, error }),
  );
});
client.on(Events.MessageUpdate, (before, after) => {
  onMessageEdit(ctx, before, after).catch((error) =>
    logger.error("Ledger edit failed", { guildId: after.guildId, error }),
  );
  onTicketEdit(ctx, after).catch((error) =>
    logger.error("Ticket edit failed", { guildId: after.guildId, error }),
  );
});
client.on(Events.MessageReactionAdd, (reaction) => {
  onStarReaction(ctx, reaction).catch((error) =>
    logger.warn("Starboard failed", { guildId: reaction.message.guildId, error }),
  );
});
client.on(Events.MessageReactionRemove, (reaction) => {
  onStarReaction(ctx, reaction).catch((error) =>
    logger.warn("Starboard failed", { guildId: reaction.message.guildId, error }),
  );
});
client.on(Events.AutoModerationActionExecution, (execution) => {
  onPatternBlock(ctx, execution).catch((error) =>
    logger.warn("Automod pattern case failed", { guildId: execution.guild.id, error }),
  );
});
client.on(Events.InviteCreate, (invite) => {
  if (invite.guild && "invites" in invite.guild) void primeInvites(invite.guild).catch(() => null);
});
client.on(Events.InviteDelete, (invite) => {
  if (invite.guild && "invites" in invite.guild) void primeInvites(invite.guild).catch(() => null);
});
client.on(Events.ChannelDelete, (channel) => {
  if (channel.isDMBased()) return;
  onTicketChannelDeleted(ctx, channel.guild, channel.id).catch((error) =>
    logger.error("Ticket channel cleanup failed", { guildId: channel.guild.id, error }),
  );
});

client.on(Events.GuildMemberAdd, (member) => {
  // Gatehouse decides first whether this join is part of a raid; welcomes wait for it.
  handleMemberJoin(ctx, member)
    .catch((error) => logger.error("Join handling failed", { guildId: member.guild.id, error }))
    .then(() => welcomeJoin(ctx, member))
    .catch((error) => logger.error("Welcome failed", { guildId: member.guild.id, error }));
  void onMemberJoin(ctx, member);
});
client.on(Events.GuildMemberRemove, (member) => {
  void onMemberLeave(ctx, member);
  welcomeLeave(ctx, member).catch((error) =>
    logger.error("Leave message failed", { guildId: member.guild.id, error }),
  );
});
client.on(Events.MessageDelete, (message) => {
  onMessageDelete(ctx, message).catch((error) =>
    logger.error("Ledger delete failed", { guildId: message.guildId, error }),
  );
  onTicketDelete(ctx, message).catch((error) =>
    logger.error("Ticket delete failed", { guildId: message.guildId, error }),
  );
});
client.on(Events.VoiceStateUpdate, (before, after) => void onVoiceUpdate(ctx, before, after));
client.on(Events.VoiceStateUpdate, (before, after) =>
  onVoiceRoomUpdate(ctx, before, after).catch((error) =>
    logger.error("Voice room update failed", { guildId: after.guild.id, error }),
  ),
);

client.on(Events.GuildCreate, async (guild) => {
  logger.info("Joined server", { guildId: guild.id, members: guild.memberCount });
  await upsertGuild(db, { id: guild.id, name: guild.name }).catch((error) =>
    logger.error("Could not register guild", { guildId: guild.id, error }),
  );
});

client.on(Events.GuildDelete, async (guild) => {
  if (!guild.available) return; // An outage, not a removal.
  logger.info("Left server", { guildId: guild.id });
  forgetGuild(guild.id);
  await markGuildLeft(db, guild.id).catch((error) =>
    logger.error("Could not mark guild as left", { guildId: guild.id, error }),
  );
});

client.on(Events.InteractionCreate, (interaction) => handleInteraction(interaction, ctx));
client.on(Events.Error, (error) => logger.error("Discord client error", { error }));

// A bot whose database stopped answering can do nothing useful, and nothing else notices:
// Discord stays connected. Say so on /healthz, then exit so the host starts a fresh one.
/** A round trip slower than this is worth a log line (once per 10 min): it slows every sweep. */
const SLOW_PING_MS = 300;
let lastSlowLog = 0;
const database = watchDatabase(
  async () => {
    const started = Date.now();
    await pingDb(db);
    const ms = Date.now() - started;
    if (ms > SLOW_PING_MS && started - lastSlowLog > 10 * 60_000) {
      lastSlowLog = started;
      logger.warn("The database is slow to answer", { ms });
    }
  },
  (silentMs) => {
    logger.error("The database hasn't answered in minutes; restarting the bot", { silentMs });
    void shutdown("database watchdog", 1);
  },
);

const health = env.HEALTH_PORT
  ? startHealthServer(
      env.HEALTH_PORT,
      () => client.isReady() && client.ws.ping >= 0 && database.healthy(),
      () => void drainActions(),
    )
  : undefined;

let stopping = false;
async function shutdown(reason: string, code = 0) {
  if (stopping) return;
  stopping = true;
  logger.info(`Shutting down: ${reason}`);
  // A wedged pool or gateway mustn't hold the exit: go anyway after 10 s.
  setTimeout(() => process.exit(code), 10_000).unref();
  clearInterval(sweepTimer);
  clearInterval(actionsTimer);
  clearInterval(flushTimer);
  database.stop();
  health?.close();
  await client.destroy().catch(() => {});
  await close().catch(() => {});
  process.exit(code);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
