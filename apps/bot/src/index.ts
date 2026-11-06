import { createDb, markGuildLeft, upsertGuild } from "@garrison/db";
import { Client, Events, GatewayIntentBits } from "discord.js";
import type { BotContext } from "./commands/types.js";
import { loadEnv } from "./env.js";
import { handleInteraction } from "./interactions.js";
import { createLogger } from "./lib/logger.js";
import { ensureGuild, forgetGuild } from "./modules/watch/service.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
const ctx: BotContext = { db, logger };

// Only the non-privileged Guilds intent so far. Automod will need Message Content later.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (ready) => {
  logger.info(`Online as ${ready.user.tag} in ${ready.guilds.cache.size} servers`);
  for (const guild of ready.guilds.cache.values()) {
    await ensureGuild(ctx, guild).catch((error) =>
      logger.error("Could not register guild", { guildId: guild.id, error }),
    );
  }
});

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
  await client.destroy();
  await close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
