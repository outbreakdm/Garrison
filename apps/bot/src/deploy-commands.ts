import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

/**
 * Register slash commands with Discord. With DISCORD_DEV_GUILD_ID set, they go
 * to that one server and update instantly; otherwise they deploy globally.
 */
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const devGuildId = process.env.DISCORD_DEV_GUILD_ID || undefined;
if (!token || !clientId) {
  console.error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env first.");
  process.exit(1);
}

const rest = new REST().setToken(token);
const body = commands.map((c) => c.data);
const route = devGuildId
  ? Routes.applicationGuildCommands(clientId, devGuildId)
  : Routes.applicationCommands(clientId);

await rest.put(route, { body });
console.log(
  `Registered ${body.length} commands ${devGuildId ? `to server ${devGuildId}` : "globally"}: ${body.map((c) => `/${c.name}`).join(" ")}`,
);
