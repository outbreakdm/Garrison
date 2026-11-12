import { createDb, describeDbRole, markGuildLeft, roleProblem, upsertGuild } from "@garrison/db";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { BotContext } from "./commands/types.js";
import { loadEnv } from "./env.js";
import { handleInteraction } from "./interactions.js";

import { ensureGuild, forgetGuild } from "./lib/guild-registry.js";
import { startHealthServer } from "./lib/health.js";
import { createLogger } from "./lib/logger.js";
import { Metrics } from "./lib/metrics.js";
import { sweepAlerts } from "./modules/alerts/service.js";
import { refreshOsrs } from "./modules/barracks/refresh.js";
import { sweepStatRoles } from "./modules/barracks/stat-roles.js";
import { processDashboardActions } from "./modules/dashboard/actions.js";
import { sweepMessages } from "./modules/dispatch/service.js";
import { handleAuditLogEntry } from "./modules/gatehouse/anti-nuke.js";
import { sweepWeeklyBackups } from "./modules/gatehouse/backup.js";
import { handleMemberJoin, sweepExpiredLockdowns } from "./modules/gatehouse/service.js";
import { sweepGiveaways } from "./modules/giveaways/service.js";
import { snapshotAllHealth } from "./modules/health/command.js";
import { primeInvites } from "./modules/ledger/invites.js";
import {
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
import { onDirectMessage } from "./modules/tickets/modmail.js";
import {
  loadOpenTickets,
  onTicketChannelDeleted,
  onTicketDelete,
  onTicketEdit,
  onTicketMessage,
  sweepTickets,
} from "./modules/tickets/service.js";
import { onAutomodMessage } from "./modules/watch/automod.js";
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
};
if (!ctx.planner) logger.info("Quartermaster is off: set ANTHROPIC_API_KEY to enable /qm build");
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
let actionsTimer: NodeJS.Timeout | undefined;
const HEALTH_EVERY_MS = 30 * 60_000;
let lastHealthSnapshot = 0;

client.once(Events.ClientReady, async (ready) => {
  logger.info(`Online as ${ready.user.tag} in ${ready.guilds.cache.size} servers`);
  await loadOpenTickets(ctx).catch((error) => logger.error("Could not load tickets", { error }));
  for (const guild of ready.guilds.cache.values()) {
    await ensureGuild(ctx, guild).catch((error) =>
      logger.error("Could not register guild", { guildId: guild.id, error }),
    );
    await primeInvites(guild).catch(() => null);
  }
  // Lift lockdowns whose time is up, including any that expired while we were offline.
  const sweep = async () => {
    await sweepExpiredLockdowns(ctx, ready).catch((error) =>
      logger.error("Lockdown sweep failed", { error }),
    );
    await sweepRally(ctx, ready).catch((error) => logger.error("Rally sweep failed", { error }));
    await sweepOps(ctx, ready).catch((error) => logger.error("Ops sweep failed", { error }));
    await sweepVoiceXp(ctx, ready).catch((error) => logger.error("Voice XP failed", { error }));
    await sweepStatRoles(ctx, ready).catch((error) => logger.error("Stat roles failed", { error }));
    await sweepMessages(ctx, ready).catch((error) =>
      logger.error("Scheduled messages failed", { error }),
    );
    await sweepAlerts(ctx, ready, alertKeys).catch((error) =>
      logger.error("Alert sweep failed", { error }),
    );
    await sweepWeeklyBackups(ctx, ready).catch((error) =>
      logger.error("Weekly backups failed", { error }),
    );
    await liftExpiredBans(ctx, ready).catch((error) =>
      logger.error("Temporary ban sweep failed", { error }),
    );
    await sweepGiveaways(ctx, ready).catch((error) =>
      logger.error("Giveaway sweep failed", { error }),
    );
    await sweepTickets(ctx, ready).catch((error) => logger.error("Ticket sweep failed", { error }));
    await maybePruneLedger(ctx).catch((error) => logger.error("Ledger prune failed", { error }));
    await refreshOsrs(ctx).catch((error) => logger.error("OSRS refresh failed", { error }));
    await ctx.metrics?.flush(ctx).catch((error) => logger.error("Metrics flush failed", { error }));
    if (Date.now() - lastHealthSnapshot > HEALTH_EVERY_MS) {
      lastHealthSnapshot = Date.now();
      await snapshotAllHealth(ctx, ready.guilds.cache.values());
    }
  };
  await sweep();
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  // Dashboard requests are checked more often than the sweep, so they feel quick.
  let running = false;
  actionsTimer = setInterval(async () => {
    if (running) return;
    running = true;
    await processDashboardActions(ctx, ready)
      .catch((error) => logger.error("Dashboard actions failed", { error }))
      .finally(() => {
        running = false;
      });
  }, ACTIONS_INTERVAL_MS);
});

client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
  handleAuditLogEntry(ctx, entry, guild).catch((error) =>
    logger.error("Anti-nuke handling failed", { guildId: guild.id, error }),
  );
  void onAuditEntry(ctx, entry, guild);
});

client.on(Events.MessageCreate, (message) => {
  if (message.inGuild() && !message.author.bot && !message.webhookId)
    ctx.metrics?.message(message.guildId, message.author.id);
  handleMessage(ctx, message).catch((error) =>
    logger.error("Ranks failed", { guildId: message.guildId, error }),
  );
  if (!message.inGuild() && client.isReady())
    onDirectMessage(ctx, client, message).catch((error) =>
      logger.error("Modmail failed", { error }),
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

const health = env.HEALTH_PORT
  ? startHealthServer(env.HEALTH_PORT, () => client.isReady() && client.ws.ping >= 0)
  : undefined;

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down`);
  clearInterval(sweepTimer);
  clearInterval(actionsTimer);
  health?.close();
  await client.destroy();
  await close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
