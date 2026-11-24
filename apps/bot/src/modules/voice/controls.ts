import { getVoiceRoom, setVoiceRoomOwner, VOICE_LIMITS } from "@garrison/db";

/** What the controls need of a room. */
type RoomRow = { ownerId: string; panelMessageId: string | null };

import {
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Guild,
  type GuildMember,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits as P,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type VoiceChannel,
} from "discord.js";
import { ephemeral } from "../../commands/builders.js";
import type {
  BotContext,
  ButtonHandler,
  ModalHandler,
  SelectHandler,
} from "../../commands/types.js";
import { type Card, cardEdit, cardMessage, cardReply } from "../../lib/card.js";

/**
 * A voice room's controls, posted in the room's own chat when it's made: Rename and Limit (a
 * form each), Lock and Hide (for everyone not already inside), Remove someone and Hand over (a
 * pick of who's in the room). Only the owner's presses do anything. The panel follows the room:
 * it shows the owner and what's locked or hidden, and changes hands with the room.
 */

export const ROOM_PREFIX = "vroom";
export const ROOM_FORM_PREFIX = "vroomform";
export const ROOM_PICK_PREFIX = "vroompick";

/**
 * The owner's controls on their own room: rename, limit, decide who may join, move people.
 * Only permissions Garrison holds itself (Discord refuses to let a bot hand out others);
 * speaking comes from the member's roles as usual.
 */
export const OWNER_ALLOW = [
  P.ViewChannel,
  P.Connect,
  P.ManageChannels,
  P.MoveMembers,
  P.ManageRoles,
] as const;

/** discord.js wants permission names in overwrite edits, not bits. */
export function permissionName(bit: bigint): keyof typeof P {
  const entry = Object.entries(P).find(([, v]) => v === bit);
  return entry?.[0] as keyof typeof P;
}

/** Locked: nobody new joins. Hidden: only people let in see it. Read from the room itself. */
export function roomState(channel: VoiceChannel) {
  const everyone = channel.permissionOverwrites.cache.get(channel.guild.id);
  return {
    locked: Boolean(everyone?.deny.has(P.Connect)),
    hidden: Boolean(everyone?.deny.has(P.ViewChannel)),
  };
}

/** The controls card, as the room is now. */
export function roomPanel(channel: VoiceChannel, ownerId: string): Card {
  const { locked, hidden } = roomState(channel);
  const id = channel.id;
  const button = (action: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`${ROOM_PREFIX}:${action}:${id}`)
      .setLabel(label)
      .setStyle(style);
  return {
    tone: "intel",
    title: "Room controls",
    lead: `Owned by <@${ownerId}>`,
    blocks: [
      {
        text: [
          hidden
            ? "🙈 Hidden: only people in the room (or let in) can see it."
            : locked
              ? "🔒 Locked: everyone can see it, nobody new can join."
              : "🔓 Open to everyone.",
          `Limit: ${channel.userLimit ? `${channel.userLimit} people` : "none"}.`,
        ].join("\n"),
      },
    ],
    actions: [
      button("rename", "Rename"),
      button("limit", "Limit"),
      button("lock", locked ? "Unlock" : "Lock"),
      button("hide", hidden ? "Show" : "Hide"),
      button("kick", "Remove someone", ButtonStyle.Danger),
      button("hand", "Hand over"),
    ],
  };
}

/** Post the controls in a new room's chat; returns the message id, or null if Discord said no. */
export async function postRoomPanel(channel: VoiceChannel, ownerId: string) {
  if (!channel.isSendable()) return null;
  const sent = await channel
    .send({ ...cardMessage(roomPanel(channel, ownerId)), allowedMentions: { parse: [] } })
    .catch(() => null);
  return sent?.id ?? null;
}

/** Redraw the panel after a change made elsewhere (a hand-over, a rename, a new limit). */
export async function refreshRoomPanel(channel: VoiceChannel, room: RoomRow) {
  if (!room.panelMessageId) return;
  await channel.messages
    .edit(room.panelMessageId, cardMessage(roomPanel(channel, room.ownerId)))
    .catch(() => null);
}

/** Pass the room to someone in it: their controls on, the old owner's off, the panel updated. */
export async function handOverRoom(
  ctx: BotContext,
  channel: VoiceChannel,
  room: RoomRow,
  to: GuildMember,
  reason: string,
) {
  await channel.permissionOverwrites.delete(room.ownerId, reason).catch(() => null);
  await channel.permissionOverwrites.edit(
    to.id,
    Object.fromEntries(OWNER_ALLOW.map((bit) => [permissionName(bit), true])),
    { reason },
  );
  await setVoiceRoomOwner(ctx.db, channel.id, to.id);
  await refreshRoomPanel(channel, { ...room, ownerId: to.id });
}

/** The room behind a control, and whether the person pressing it owns it. */
async function roomFor(
  ctx: BotContext,
  guild: Guild,
  channelId: string | undefined,
  userId: string,
) {
  const channel = channelId ? guild.channels.cache.get(channelId) : undefined;
  if (!channel || channel.type !== ChannelType.GuildVoice)
    return { ok: false as const, why: "This room is gone." };
  const room = await getVoiceRoom(ctx.db, channel.id);
  if (!room) return { ok: false as const, why: "This isn't a Garrison voice room anymore." };
  if (room.ownerId !== userId)
    return { ok: false as const, why: `Only <@${room.ownerId}> can change this room.` };
  return { ok: true as const, channel, room };
}

/** Who else is in the room, to remove or hand to. */
const others = (channel: VoiceChannel, ownerId: string) =>
  [...channel.members.values()].filter((m) => !m.user.bot && m.id !== ownerId).slice(0, 25);

const REFUSED = "Discord refused that: check Garrison's permissions on this room.";

/** A press on the controls: open a form or a pick, or lock or hide at once. */
export const roomButtons: ButtonHandler = {
  prefix: ROOM_PREFIX,
  async execute(interaction, ctx) {
    const [, action, channelId] = interaction.customId.split(":");
    const found = await roomFor(ctx, interaction.guild, channelId, interaction.user.id);
    if (!found.ok) {
      await interaction.reply({ content: found.why, ...ephemeral, allowedMentions: { parse: [] } });
      return;
    }
    const { channel, room } = found;
    if (action === "rename" || action === "limit") {
      const input = new TextInputBuilder()
        .setCustomId("value")
        .setStyle(TextInputStyle.Short)
        .setRequired(action === "rename");
      if (action === "rename") input.setMaxLength(100).setValue(channel.name.slice(0, 100));
      else input.setMaxLength(2).setPlaceholder("0 for no limit");
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${ROOM_FORM_PREFIX}:${action}:${channel.id}`)
          .setTitle(action === "rename" ? "Rename your room" : "Who can be in it")
          .addLabelComponents(
            new LabelBuilder()
              .setLabel(
                action === "rename"
                  ? "Room name"
                  : `How many people (up to ${VOICE_LIMITS.userLimit})`,
              )
              .setTextInputComponent(input),
          ),
      );
      return;
    }
    if (action === "lock" || action === "hide") {
      const state = roomState(channel);
      const on = action === "lock" ? !state.locked : !state.hidden;
      const bit = action === "lock" ? "Connect" : "ViewChannel";
      try {
        // Whoever is in the room now keeps it: they can see it and come back if they drop.
        if (on)
          for (const m of channel.members.values())
            if (!m.user.bot)
              await channel.permissionOverwrites.edit(m.id, { ViewChannel: true, Connect: true });
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { [bit]: on ? false : null },
          { reason: `Voice room ${on ? action : `un${action}`}ed by its owner` },
        );
      } catch {
        await interaction.reply({ content: REFUSED, ...ephemeral });
        return;
      }
      await interaction.update(cardEdit(interaction.message, roomPanel(channel, room.ownerId)));
      return;
    }
    if (action === "kick" || action === "hand") {
      const people = others(channel, room.ownerId);
      if (!people.length) {
        await interaction.reply({ content: "Nobody else is in the room.", ...ephemeral });
        return;
      }
      await interaction.reply(
        cardReply({
          title: action === "kick" ? "Remove someone" : "Hand the room over",
          blocks: [
            {
              text:
                action === "kick"
                  ? "They're moved out and can't come back into this room."
                  : "They get the controls, and you keep your seat.",
            },
          ],
          menu: new StringSelectMenuBuilder()
            .setCustomId(`${ROOM_PICK_PREFIX}:${action}:${channel.id}`)
            .setPlaceholder("Pick someone in the room")
            .addOptions(people.map((m) => ({ label: m.displayName.slice(0, 100), value: m.id }))),
        }),
      );
    }
  },
};

/** Someone picked to remove or hand the room to. */
export const roomPicks: SelectHandler = {
  prefix: ROOM_PICK_PREFIX,
  async execute(interaction, ctx) {
    const [, action, channelId] = interaction.customId.split(":");
    const found = await roomFor(ctx, interaction.guild, channelId, interaction.user.id);
    const done = (text: string) =>
      interaction.update(cardEdit(interaction.message, { title: text }));
    if (!found.ok) {
      await done(found.why);
      return;
    }
    const { channel, room } = found;
    const target = channel.members.get(interaction.values[0] ?? "");
    if (!target || target.user.bot) {
      await done("They've left the room already.");
      return;
    }
    try {
      if (action === "kick") {
        await channel.permissionOverwrites.edit(
          target.id,
          { Connect: false },
          {
            reason: "Removed from the voice room by its owner",
          },
        );
        await target.voice.disconnect("Removed from the voice room by its owner");
        await done(`Removed ${target.displayName}. They can't come back into this room.`);
      } else {
        await handOverRoom(ctx, channel, room, target, "Voice room handed over by its owner");
        await done(`${target.displayName} owns the room now.`);
        if (channel.isSendable())
          await channel
            .send({
              content: `${target} now owns this room.`,
              allowedMentions: { users: [target.id] },
            })
            .catch(() => null);
      }
    } catch {
      await done(REFUSED);
    }
  },
};

/** A new name or limit came back from the form. */
export const roomForms: ModalHandler = {
  prefix: ROOM_FORM_PREFIX,
  async execute(interaction, ctx) {
    const [, action, channelId] = interaction.customId.split(":");
    const found = await roomFor(ctx, interaction.guild, channelId, interaction.user.id);
    if (!found.ok) {
      await interaction.reply({ content: found.why, ...ephemeral, allowedMentions: { parse: [] } });
      return;
    }
    const { channel, room } = found;
    let value = "";
    try {
      value = interaction.fields.getTextInputValue("value").trim();
    } catch {}
    await interaction.deferReply(ephemeral);
    if (action === "limit") {
      const n = value ? Number(value) : 0;
      if (!Number.isInteger(n) || n < 0 || n > VOICE_LIMITS.userLimit) {
        await interaction.editReply(`A number from 0 (no limit) to ${VOICE_LIMITS.userLimit}.`);
        return;
      }
      const ok = await channel.setUserLimit(n, "Voice room limit set by its owner").then(
        () => true,
        () => false,
      );
      if (ok) await refreshRoomPanel(channel, room);
      await interaction.editReply(ok ? (n ? `Up to ${n} people now.` : "No limit now.") : REFUSED);
      return;
    }
    const name = value.replace(/\s+/g, " ").slice(0, 100);
    if (!name) {
      await interaction.editReply("Give the room a name.");
      return;
    }
    // Discord allows two renames every ten minutes; past that it waits, so don't hold the reply.
    const renamed = channel.setName(name, "Voice room renamed by its owner").then(
      () => true,
      () => false,
    );
    const quick = await Promise.race([
      renamed,
      new Promise<"slow">((resolve) => setTimeout(() => resolve("slow"), 4_000)),
    ]);
    if (quick === "slow") {
      await interaction.editReply(
        "Discord allows two renames every ten minutes, so it'll change in a few minutes.",
      );
      void renamed.then((ok) => (ok ? refreshRoomPanel(channel, room) : undefined));
      return;
    }
    if (quick) await refreshRoomPanel(channel, room);
    await interaction.editReply(quick ? `Renamed to ${name}.` : REFUSED);
  },
};
