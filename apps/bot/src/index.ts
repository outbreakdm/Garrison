import { createDb, markGuildLeft, upsertGuild } from "@garrison/db";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { BotContext } from "./commands/types.js";
import { loadEnv } from "./env.js";
import { handleInteraction } from "./interactions.js";
import { ensureGuild, forgetGuild } from "./lib/guild-registry.js";
import { createLogger } from "./lib/logger.js";
import { Metrics } from "./lib/metrics.js";
import { refreshOsrs } from "./modules/barracks/refresh.js";
import { handleAuditLogEntry } from "./modules/gatehouse/anti-nuke.js";
import { handleMemberJoin, sweepExpiredLockdowns } from "./modules/gatehouse/service.js";
import { snapshotAllHealth } from "./modules/health/command.js";
import {
  maybePruneLedger,
  onAuditEntry,
  onMemberJoin,
  onMemberLeave,
  onMessageDelete,
  onVoiceUpdate,
} from "./modules/ledger/service.js";
import { sweepOps } from "./modules/ops/service.js";
import { ClaudePlanner } from "./modules/quartermaster/planner.js";
import { sweepRally } from "./modules/rally/service.js";
import { handleMessage } from "./modules/ranks/service.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
const ctx: BotContext = {
  db,
  logger,
  planner: env.ANTHROPIC_API_KEY
    ? new ClaudePlanner(env.ANTHROPIC_API_KEY, env.QM_MODEL)
    : undefined,
  metrics: new Metrics(),
};
if (!ctx.planner) logger.info("Quartermaster is off: set ANTHROPIC_API_KEY to enable /qm build");

// Guild Members is privileged: turn on "Server Members Intent" in the Developer Portal.
// Gatehouse needs it to see joins, and Guild Moderation (not privileged) for the
// audit-log stream anti-nuke watches. Automod will need Message Content later.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    // Not privileged. Rally needs it to see when a squad voice channel is empty.
    GatewayIntentBits.GuildVoiceStates,
    // Not privileged, and without Message Content: Ranks only needs who posted and when.
    GatewayIntentBits.GuildMessages,
  ],
  // Never ping from bot messages. Reasons and other user-typed text are echoed
  // back, and must not be able to trigger @everyone, role or user pings.
  allowedMentions: { parse: [], repliedUser: false },
  // Ledger needs leave and delete events for members and messages that aren't cached.
  partials: [Partials.GuildMember, Partials.Message],
});

const SWEEP_INTERVAL_MS = 60_000;
let sweepTimer: NodeJS.Timeout | undefined;
const HEALTH_EVERY_MS = 30 * 60_000;
let lastHealthSnapshot = 0;

client.once(Events.ClientReady, async (ready) => {
  logger.info(`Online as ${ready.user.tag} in ${ready.guilds.cache.size} servers`);
  for (const guild of ready.guilds.cache.values()) {
    await ensureGuild(ctx, guild).catch((error) =>
      logger.error("Could not register guild", { guildId: guild.id, error }),
    );
  }
  // Lift lockdowns whose time is up, including any that expired while we were offline.
  const sweep = async () => {
    await sweepExpiredLockdowns(ctx, ready).catch((error) =>
      logger.error("Lockdown sweep failed", { error }),
    );
    await sweepRally(ctx, ready).catch((error) => logger.error("Rally sweep failed", { error }));
    await sweepOps(ctx, ready).catch((error) => logger.error("Ops sweep failed", { error }));
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
});

client.on(Events.GuildMemberAdd, (member) => {
  handleMemberJoin(ctx, member).catch((error) =>
    logger.error("Join handling failed", { guildId: member.guild.id, error }),
  );
  void onMemberJoin(ctx, member);
});
client.on(Events.GuildMemberRemove, (member) => void onMemberLeave(ctx, member));
client.on(Events.MessageDelete, (message) => void onMessageDelete(ctx, message));
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

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down`);
  clearInterval(sweepTimer);
  await client.destroy();
  await close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
