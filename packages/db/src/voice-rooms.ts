/**
 * Voice rooms (join to create): joining a "New room" voice channel makes the member
 * their own voice channel and moves them into it; it's deleted when the last person
 * leaves, and passes to someone still inside if the owner goes. The owner gets Discord's
 * own channel controls on that one channel (rename, limit, lock). Pure and shared.
 *
 * Free: one creator channel, rooms named "{user}'s room". Pro: up to five creator
 * channels and your own name, with {user} for the owner. (A {game} placeholder would need
 * Discord's privileged Presence intent, which Garrison doesn't ask for.)
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export interface VoiceRoomsConfig {
  enabled: boolean;
  /** Voice channels that make a room when someone joins. */
  creatorChannelIds: string[];
  /** Pro: e.g. "Squad of {user}". Null: the standard "{user}'s room". */
  nameTemplate: string | null;
  /** 0 means no limit. */
  userLimit: number;
  /** Where rooms go. Null: the creator channel's category. */
  categoryId: string | null;
  /**
   * Garrison posts the owner's controls in each new room's chat: Rename, Limit, Lock, Hide,
   * Remove someone, Hand over. Off: only Discord's own channel settings.
   */
  controls: boolean;
}

export const DEFAULT_VOICE_ROOMS: VoiceRoomsConfig = {
  enabled: false,
  creatorChannelIds: [],
  nameTemplate: null,
  userLimit: 0,
  categoryId: null,
  controls: true,
};

export const STANDARD_ROOM_NAME = "{user}'s room";
export const VOICE_LIMITS = { name: 60, userLimit: 99 } as const;
const SNOWFLAKE = /^\d{17,20}$/;

/** A stored row, read leniently. */
export function readVoiceRooms(
  raw: Partial<Record<keyof VoiceRoomsConfig, unknown>> | null,
): VoiceRoomsConfig {
  if (!raw) return { ...DEFAULT_VOICE_ROOMS, creatorChannelIds: [] };
  const limit = Number(raw.userLimit);
  return {
    enabled: raw.enabled === true,
    creatorChannelIds: Array.isArray(raw.creatorChannelIds)
      ? raw.creatorChannelIds.filter((v): v is string => typeof v === "string" && SNOWFLAKE.test(v))
      : [],
    nameTemplate:
      typeof raw.nameTemplate === "string" && raw.nameTemplate.trim()
        ? raw.nameTemplate.slice(0, VOICE_LIMITS.name)
        : null,
    userLimit: Number.isInteger(limit) && limit >= 0 && limit <= VOICE_LIMITS.userLimit ? limit : 0,
    categoryId:
      typeof raw.categoryId === "string" && SNOWFLAKE.test(raw.categoryId) ? raw.categoryId : null,
    controls: raw.controls !== false,
  };
}

/**
 * Check a change from the dashboard. `before` is what's saved: on Free, creator channels
 * and a custom name already saved under Pro stay, but nothing new past the Free limits.
 */
export function checkVoiceRooms(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: VoiceRoomsConfig,
): Parsed<VoiceRoomsConfig> {
  const creators = Array.isArray(raw.creatorChannelIds)
    ? [...new Set(raw.creatorChannelIds.map(String).filter(Boolean))]
    : [];
  if (!creators.every((id) => SNOWFLAKE.test(id)))
    return { ok: false, error: "Pick the voice channels from this server's list." };
  const enabled = raw.enabled === true;
  if (enabled && !creators.length)
    return { ok: false, error: "Pick the voice channel members join to make a room." };
  const max = ent["voice.creators"];
  const grew = creators.length > before.creatorChannelIds.length;
  if (creators.length > max && grew)
    return {
      ok: false,
      error:
        max === 1
          ? "One creator channel on Free. Several are part of Garrison Pro."
          : `Up to ${max} creator channels.`,
    };
  const template =
    typeof raw.nameTemplate === "string" && raw.nameTemplate.trim()
      ? raw.nameTemplate.trim()
      : null;
  const nameTemplate = template === STANDARD_ROOM_NAME ? null : template;
  if (nameTemplate && nameTemplate.length > VOICE_LIMITS.name)
    return { ok: false, error: `Room names hold ${VOICE_LIMITS.name} characters.` };
  if (nameTemplate && !ent["voice.names"] && nameTemplate !== before.nameTemplate)
    return { ok: false, error: "Your own room names are part of Garrison Pro." };
  const userLimit = Number(raw.userLimit ?? 0);
  if (!Number.isInteger(userLimit) || userLimit < 0 || userLimit > VOICE_LIMITS.userLimit)
    return {
      ok: false,
      error: `The member limit goes from 0 (none) to ${VOICE_LIMITS.userLimit}.`,
    };
  const categoryId = typeof raw.categoryId === "string" && raw.categoryId ? raw.categoryId : null;
  if (categoryId && !SNOWFLAKE.test(categoryId))
    return { ok: false, error: "Pick the category from this server's list." };
  return {
    ok: true,
    value: {
      enabled,
      creatorChannelIds: creators,
      nameTemplate,
      userLimit,
      categoryId,
      controls: raw.controls !== false,
    },
  };
}

/** A room's name: the template with {user} filled, within Discord's 100 characters. */
export function roomName(template: string | null, user: string): string {
  const t = template ?? STANDARD_ROOM_NAME;
  const name = t.replaceAll("{user}", user).replace(/\s+/g, " ").trim();
  return (name || `${user}'s room`).slice(0, 100);
}
