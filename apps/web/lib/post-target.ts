import "server-only";
import { channelInfo, listPostTargets, type PostTarget } from "./discord";

/**
 * Is this a place in this server a message can go: a text channel, a forum, an open thread,
 * or an archived thread (asked of Discord, since the open list leaves those out)? Its kind
 * and, for a forum, its tags. Null when it isn't, or Discord didn't answer.
 */
export async function checkPostTarget(guildId: string, id: string): Promise<PostTarget | null> {
  const targets = await listPostTargets(guildId).catch(() => null);
  if (!targets) return null;
  const known = targets.find((t) => t.id === id);
  if (known) return known;
  const info = await channelInfo(id);
  // Announcement and public threads; a private thread is its members' alone.
  if (info?.guildId !== guildId || (info.type !== 10 && info.type !== 11)) return null;
  const parent = targets.find((t) => t.id === info.parentId)?.name ?? null;
  return { id, name: info.name, kind: "thread", parent, tags: [] };
}
