import {
  addRosterCharacter,
  checkCharacter,
  describeCharacter,
  listMemberTeams,
  listRosterCharacters,
  listRosterMembers,
  listRosterTeams,
  ROSTER_GAMES,
  ROSTER_STATUS_LABELS,
  ROSTER_STATUSES,
  removeRosterCharacter,
  rosterGame,
  STANDARD_ROLES,
  setMainCharacter,
  WOW_CLASSES,
} from "@garrison/db";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { capped, cardReply, notice } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { slash } from "../../lib/slash.js";
import { safeText } from "../../lib/text.js";

/**
 * The raid roster in Discord: members add, remove and pick their main character, see their
 * own teams, and anyone can show a team. Officers manage teams on the dashboard.
 */

type Chat = ChatInputCommandInteraction<"cached">;
const SHOWN_PER_STATUS = 20;

const describe = (c: Parameters<typeof describeCharacter>[0]) => safeText(describeCharacter(c));

export async function rosterTeam(interaction: Chat, ctx: BotContext) {
  const teams = await listRosterTeams(ctx.db, interaction.guildId);
  if (!teams.length) {
    await interaction.reply(
      notice("This server has no roster teams yet. Officers add them on the dashboard.", "intel"),
    );
    return;
  }
  const asked = interaction.options.getString("team");
  const team =
    teams.find((t) => t.id === asked) ??
    teams.find((t) => asked && t.name.toLowerCase() === asked.toLowerCase()) ??
    (asked ? null : teams[0]);
  if (!team) {
    await interaction.reply(notice("There's no team by that name.", "intel"));
    return;
  }
  const members = await listRosterMembers(ctx.db, interaction.guildId, [team.id]);
  const characters = await listRosterCharacters(
    ctx.db,
    interaction.guildId,
    members.map((m) => m.userId),
  );
  const line = (userId: string) => {
    const mine = characters.filter((c) => c.userId === userId);
    const main = mine.find((c) => c.main);
    const alts = mine.length - (main ? 1 : 0);
    return [
      `<@${userId}>`,
      main ? describe(main) : null,
      alts ? `+${alts} alt${alts === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const blocks = ROSTER_STATUSES.flatMap((status) => {
    const rows = members.filter((m) => m.status === status);
    return rows.length
      ? [
          {
            text: `**${ROSTER_STATUS_LABELS[status]}** ${rows.length}\n${capped(
              rows.map((m) => line(m.userId)),
              SHOWN_PER_STATUS,
            ).join("\n")}`,
          },
        ]
      : [];
  });
  const game =
    team.game && team.game in ROSTER_GAMES ? ROSTER_GAMES[team.game as "wow"].label : null;
  await interaction.reply(
    cardReply(
      {
        tone: "intel",
        title: `Roster · ${safeText(team.name)}`,
        lead: members.length ? (game ?? undefined) : "Nobody is on this team yet.",
        blocks,
        module: "ops",
        ref: `${members.length} ${members.length === 1 ? "member" : "members"}`,
      },
      { ephemeral: false },
    ),
  );
}

export async function rosterAdd(interaction: Chat, ctx: BotContext) {
  await ensureGuild(ctx, interaction.guild);
  const fields = checkCharacter(
    {
      name: interaction.options.getString("name", true),
      className: interaction.options.getString("class"),
      spec: interaction.options.getString("spec"),
      role: interaction.options.getString("role"),
    },
    await rosterGame(ctx.db, interaction.guildId),
  );
  if (!fields.ok) {
    await interaction.reply(notice(fields.error, "alert"));
    return;
  }
  const r = await addRosterCharacter(
    ctx.db,
    interaction.guildId,
    { id: interaction.user.id, name: interaction.member.displayName },
    fields.value,
    interaction.options.getBoolean("main") ?? false,
  );
  await interaction.reply(
    notice(
      r.ok ? `Added ${describe(r.value)}${r.value.main ? " as your main" : ""}.` : r.error,
      "intel",
    ),
  );
}

/** The member's own character from the option: its id when picked from the list, or its name. */
async function ownCharacter(interaction: Chat, ctx: BotContext) {
  const asked = interaction.options.getString("character", true);
  const mine = await listRosterCharacters(ctx.db, interaction.guildId, [interaction.user.id]);
  return (
    mine.find((c) => c.id === asked) ??
    mine.find((c) => c.name.toLowerCase() === asked.toLowerCase()) ??
    null
  );
}

export async function rosterRemove(interaction: Chat, ctx: BotContext) {
  const c = await ownCharacter(interaction, ctx);
  const removed =
    c && (await removeRosterCharacter(ctx.db, interaction.guildId, c.id, interaction.user.id));
  await interaction.reply(
    notice(
      removed && c ? `Removed ${safeText(c.name)}.` : "You have no character by that name here.",
      "intel",
    ),
  );
}

export async function rosterMain(interaction: Chat, ctx: BotContext) {
  const c = await ownCharacter(interaction, ctx);
  const done =
    c && (await setMainCharacter(ctx.db, interaction.guildId, c.id, interaction.user.id));
  await interaction.reply(
    notice(
      done && c
        ? `${safeText(c.name)} is your main now.`
        : "You have no character by that name here.",
      "intel",
    ),
  );
}

export async function rosterMine(interaction: Chat, ctx: BotContext) {
  const [mine, teams] = await Promise.all([
    listRosterCharacters(ctx.db, interaction.guildId, [interaction.user.id]),
    listMemberTeams(ctx.db, interaction.guildId, interaction.user.id),
  ]);
  const standing = (t: (typeof teams)[number]) =>
    ROSTER_STATUS_LABELS[t.status as "core"] ?? t.status;
  await interaction.reply(
    cardReply({
      tone: "intel",
      title: "Your characters",
      status: mine.length ? `${mine.length} here` : undefined,
      blocks: [
        {
          text: mine.length
            ? mine.map((c) => `- ${describe(c)}${c.main ? " · **main**" : ""}`).join("\n")
            : `No characters yet. Add one with ${slash("roster add")}.`,
        },
        "divider",
        {
          text: teams.length
            ? `**Teams**\n${teams.map((t) => `- ${safeText(t.team.name)} · ${standing(t)}`).join("\n")}`
            : "Not on a team yet. Officers put people on teams on the dashboard.",
        },
      ],
      module: "barracks",
    }),
  );
}

/** Suggestions for /roster: teams, the WoW classes and specs when a team plays WoW, roles, your characters. */
export async function rosterAutocomplete(
  interaction: AutocompleteInteraction<"cached">,
  ctx: BotContext,
) {
  const focused = interaction.options.getFocused(true);
  const typed = focused.value.toLowerCase();
  const pick = (names: string[]) =>
    interaction.respond(
      names
        .filter((n) => n.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n })),
    );
  if (focused.name === "team") {
    const teams = await listRosterTeams(ctx.db, interaction.guildId);
    await interaction.respond(
      teams
        .filter((t) => t.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((t) => ({ name: t.name, value: t.id })),
    );
  } else if (focused.name === "character") {
    const mine = await listRosterCharacters(ctx.db, interaction.guildId, [interaction.user.id]);
    await interaction.respond(
      mine
        .filter((c) => c.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((c) => ({ name: describeCharacter(c).slice(0, 100), value: c.id })),
    );
  } else if (focused.name === "role") await pick([...STANDARD_ROLES]);
  else if ((await rosterGame(ctx.db, interaction.guildId)) !== "wow") await interaction.respond([]);
  else if (focused.name === "class") await pick(Object.keys(WOW_CLASSES));
  else if (focused.name === "spec") {
    const chosen = interaction.options.getString("class") ?? "";
    const known = Object.keys(WOW_CLASSES).find((k) => k.toLowerCase() === chosen.toLowerCase());
    await pick(
      known
        ? Object.keys(WOW_CLASSES[known] ?? {})
        : [...new Set(Object.values(WOW_CLASSES).flatMap((s) => Object.keys(s)))],
    );
  } else await interaction.respond([]);
}
