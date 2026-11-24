import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { type VoiceRoom, voiceRooms, voiceSettings } from "../schema";
import { readVoiceRooms, type VoiceRoomsConfig } from "../voice-rooms";

export async function getVoiceRooms(db: Db, guildId: string): Promise<VoiceRoomsConfig> {
  const [row] = await db.select().from(voiceSettings).where(eq(voiceSettings.guildId, guildId));
  return readVoiceRooms(row ?? null);
}

/** Rooms open right now in a server, oldest first. */
export async function listVoiceRooms(db: Db, guildId: string): Promise<VoiceRoom[]> {
  return db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.guildId, guildId))
    .orderBy(asc(voiceRooms.createdAt));
}

/** Every room Garrison made, for the bot's tidy-up after a restart. */
export async function listAllVoiceRooms(db: Db): Promise<VoiceRoom[]> {
  return db.select().from(voiceRooms);
}

export async function getVoiceRoom(db: Db, channelId: string): Promise<VoiceRoom | null> {
  const [row] = await db.select().from(voiceRooms).where(eq(voiceRooms.channelId, channelId));
  return row ?? null;
}

export async function addVoiceRoom(
  db: Db,
  room: { channelId: string; guildId: string; ownerId: string; creatorChannelId: string },
) {
  await db.insert(voiceRooms).values(room).onConflictDoNothing();
}

/** The room's control panel, once Garrison has posted it in the room's chat. */
export async function setVoiceRoomPanel(db: Db, channelId: string, messageId: string) {
  await db
    .update(voiceRooms)
    .set({ panelMessageId: messageId })
    .where(eq(voiceRooms.channelId, channelId));
}

export async function setVoiceRoomOwner(db: Db, channelId: string, ownerId: string) {
  await db.update(voiceRooms).set({ ownerId }).where(eq(voiceRooms.channelId, channelId));
}

export async function removeVoiceRoom(db: Db, guildId: string, channelId: string) {
  await db
    .delete(voiceRooms)
    .where(and(eq(voiceRooms.guildId, guildId), eq(voiceRooms.channelId, channelId)));
}
