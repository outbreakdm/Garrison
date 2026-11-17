import { inviteUrl } from "@garrison/brand";

/**
 * Discord's page for adding Garrison again with every permission it asks for: how an owner
 * gives it one it lacks (the server keeps everything else). Null without a client ID.
 */
export function fixPermissionsUrl(guildId: string): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  return clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId, guildId) : null;
}
