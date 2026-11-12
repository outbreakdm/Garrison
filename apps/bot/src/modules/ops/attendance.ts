import {
  attendanceCandidates,
  closeAttendance,
  entitlements,
  getGuildPlan,
  listAttendanceGuilds,
  markShowedUp,
} from "@garrison/db";
import type { Client } from "discord.js";
import type { BotContext } from "../../commands/types.js";

/**
 * Attendance (Pro, opt-in): each minute, anyone signed up for a raid or in a group
 * whose start is near and who is in a voice channel in that server counts as having
 * shown up. When the window closes, the rest are marked missed. A server back on
 * Free keeps its setting but tracking pauses.
 */
export async function sweepAttendance(ctx: BotContext, client: Client<true>, now = new Date()) {
  const guildIds: string[] = [];
  for (const id of await listAttendanceGuilds(ctx.db)) {
    if (!client.guilds.cache.has(id)) continue;
    if (entitlements(await getGuildPlan(ctx.db, id))["ops.attendance"]) guildIds.push(id);
  }
  if (!guildIds.length) return;
  const seen = new Map<string, { kind: "raid" | "group"; id: string; userIds: string[] }>();
  for (const c of await attendanceCandidates(ctx.db, guildIds, now)) {
    const guild = client.guilds.cache.get(c.guildId);
    if (!guild?.voiceStates.cache.get(c.userId)?.channelId) continue;
    const key = `${c.kind}:${c.id}`;
    const entry = seen.get(key) ?? { kind: c.kind, id: c.id, userIds: [] };
    entry.userIds.push(c.userId);
    seen.set(key, entry);
  }
  for (const e of seen.values()) await markShowedUp(ctx.db, e.kind, e.id, e.userIds);
  await closeAttendance(ctx.db, guildIds, now);
}
