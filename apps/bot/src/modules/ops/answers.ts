import {
  AVAILABILITY_LABELS,
  type Availability,
  answerRaid,
  getOpsEvent,
  isAvailability,
  listRosterCharacters,
  listSignups,
  type OpsEvent,
  type RosterCharacter,
  slotFor,
} from "@garrison/db";
import {
  ActionRowBuilder,
  type ButtonInteraction,
  type Guild,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import { ephemeral } from "../../commands/builders.js";
import type { BotContext, SelectHandler } from "../../commands/types.js";
import { safeText } from "../../lib/text.js";
import { OPS_PREFIX } from "./card.js";
import { refreshOpsCard } from "./service.js";

/**
 * Organized raids in Discord. A member presses Coming, Tentative, Late or Can't; Garrison
 * answers with their main character (or the one they brought last time) when its role is in
 * the raid, and offers a dropdown to bring another character or pick a role.
 */

const UUID = /^[0-9a-f-]{36}$/;

/** "Thrall · Restoration Shaman": what the card shows next to the member. */
export const characterLabel = (c: Pick<RosterCharacter, "name" | "spec" | "className">) =>
  [c.name, [c.spec, c.className].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

function characterMenu(
  event: OpsEvent,
  status: Availability,
  chars: RosterCharacter[],
  chosen: string | null,
) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${OPS_PREFIX}:char:${event.id}:${status}`)
      .setPlaceholder("Bring another character")
      .addOptions(
        chars.slice(0, 25).map((c) => ({
          label: c.name.slice(0, 100),
          description:
            [c.spec, c.className, c.role].filter(Boolean).join(" · ").slice(0, 100) || undefined,
          value: c.id,
          default: c.id === chosen,
        })),
      ),
  );
}

function roleMenu(
  event: OpsEvent,
  status: Availability,
  characterId: string | null,
  current: string | null,
) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${OPS_PREFIX}:role:${event.id}:${status}:${characterId ?? "-"}`)
      .setPlaceholder("Pick your role")
      .addOptions(
        event.slots.slice(0, 25).map((g) => ({
          label: g.name.slice(0, 100),
          value: g.name,
          default: g.name === current,
        })),
      ),
  );
}

type Reply = { content: string; components: ActionRowBuilder<StringSelectMenuBuilder>[] };

/** Saves the answer and builds what the member sees next. */
async function settle(
  ctx: BotContext,
  guild: Guild,
  event: OpsEvent,
  userId: string,
  status: Availability,
  pick: { character: RosterCharacter | null; role: string | null },
): Promise<Reply> {
  const chars = await listRosterCharacters(ctx.db, guild.id, [userId]);
  const role = slotFor(event.slots, pick.role ?? pick.character?.role);
  if (status !== "cant" && !role)
    return {
      content: pick.character
        ? `${safeText(pick.character.name)} has no role in this raid. Pick the role they'll play.`
        : "Pick the role you'll play.",
      components: [roleMenu(event, status, pick.character?.id ?? null, null)],
    };
  const result = await answerRaid(ctx.db, event.id, userId, {
    availability: status,
    role,
    spec: pick.character ? characterLabel(pick.character) : null,
    characterId: pick.character?.id ?? null,
  });
  if (!result.ok && result.reason !== "unchanged")
    return {
      content:
        result.reason === "no_such_role"
          ? "That role isn't in this raid anymore."
          : result.reason === "not_organized"
            ? "This raid takes signups by role. Use its Sign up buttons."
            : "This raid is closed.",
      components: [],
    };
  if (result.ok) await refreshOpsCard(ctx, guild, result.event, result.signups);
  if (status === "cant") return { content: "Got it: you can't make this one.", components: [] };
  const as = pick.character ? `${safeText(characterLabel(pick.character))} (${role})` : role;
  const components = [
    ...(chars.length ? [characterMenu(event, status, chars, pick.character?.id ?? null)] : []),
    roleMenu(event, status, pick.character?.id ?? null, role),
  ];
  return {
    content: `You're **${AVAILABILITY_LABELS[status]}** as ${as}.${chars.length ? "" : " Add your characters with /roster add to bring one."}`,
    components,
  };
}

/** Coming, Tentative, Late or Can't, pressed on an organized raid's card. */
export async function answerButton(
  interaction: ButtonInteraction<"cached">,
  ctx: BotContext,
  eventId: string,
  status: string,
) {
  if (!isAvailability(status)) return;
  const event = await getOpsEvent(ctx.db, interaction.guild.id, eventId);
  if (event?.status !== "scheduled") {
    await interaction.reply({ content: "This raid is closed.", ...ephemeral });
    return;
  }
  const userId = interaction.user.id;
  const [chars, signups] = await Promise.all([
    listRosterCharacters(ctx.db, interaction.guild.id, [userId]),
    listSignups(ctx.db, event.id),
  ]);
  const before = signups.find((s) => s.userId === userId);
  const fits = (c: RosterCharacter) => slotFor(event.slots, c.role) !== null;
  // The character they brought last time, else their main, else any whose role is in the raid.
  const character =
    chars.find((c) => c.id === before?.characterId) ??
    chars.find((c) => c.main && fits(c)) ??
    chars.find(fits) ??
    chars.find((c) => c.main) ??
    null;
  const role = character ? null : before?.role || null;
  const reply = await settle(ctx, interaction.guild, event, userId, status, { character, role });
  await interaction.reply({ ...reply, ...ephemeral });
}

/** The dropdowns under an answer: bring another character, or pick the role. */
export const opsSelects: SelectHandler = {
  prefix: OPS_PREFIX,
  async execute(interaction: StringSelectMenuInteraction<"cached">, ctx: BotContext) {
    const [, kind, eventId, status, characterId] = interaction.customId.split(":");
    if (!eventId || !UUID.test(eventId) || !isAvailability(status)) return;
    const event = await getOpsEvent(ctx.db, interaction.guild.id, eventId);
    if (event?.status !== "scheduled") {
      await interaction.update({ content: "This raid is closed.", components: [] });
      return;
    }
    const chars = await listRosterCharacters(ctx.db, interaction.guild.id, [interaction.user.id]);
    const value = interaction.values[0] ?? "";
    const reply =
      kind === "char"
        ? await settle(ctx, interaction.guild, event, interaction.user.id, status, {
            character: chars.find((c) => c.id === value) ?? null,
            role: null,
          })
        : await settle(ctx, interaction.guild, event, interaction.user.id, status, {
            character: chars.find((c) => c.id === characterId) ?? null,
            role: value,
          });
    await interaction.update(reply);
  },
};
