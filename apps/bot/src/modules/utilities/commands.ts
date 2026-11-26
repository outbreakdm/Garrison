import {
  countTimedRoles,
  entitlements,
  getGuildPlan,
  getTimedRole,
  listTimedRoles,
  parseDuration,
  removeTimedRole,
  setTimedRole,
  TIMED_ROLE_MAX_DAYS,
  timedRoleLimit,
} from "@garrison/db";
import { type GuildMember, PermissionFlagsBits, type Role } from "discord.js";
import { guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { type Card, cardReply, ts } from "../../lib/card.js";
import { slash } from "../../lib/slash.js";
import { grantableRoles } from "../applications/service.js";

/**
 * /temprole: give a member a role for a while; Garrison takes it off when the time is up
 * (sweepUtilities). For staff who can manage roles, and only roles they could give by hand:
 * below their own top role and Garrison's, never a bot's or a moderator's.
 */

const note = (title: string, text: string, tone: Card["tone"] = "caution"): Card => ({
  tone,
  title,
  blocks: [{ text }],
  module: "insignia",
});

/** Why a staff member can't give or take this role with /temprole, if they can't. */
export function roleProblem(
  role: Pick<Role, "id" | "position">,
  by: Pick<GuildMember, "id"> & { roles: { highest: { position: number } } },
  ownerId: string,
  grantable: boolean,
): string | null {
  if (!grantable)
    return "Garrison can't give that role: it's a bot's role, above Garrison's, or has moderation powers.";
  if (by.id !== ownerId && role.position >= by.roles.highest.position)
    return "That role is as high as yours or higher, so you can't give it.";
  return null;
}

export const temprole: Command = {
  data: guildCommand(
    "temprole",
    "Give a member a role for a while.",
    PermissionFlagsBits.ManageRoles,
  )
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Give a role until a time is up")
        .addUserOption((o) => o.setName("member").setDescription("Who gets it").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Which role").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("for")
            .setDescription("How long: 30m, 2h, 3d, 1w, or 1d 12h")
            .setRequired(true)
            .setMaxLength(20),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Take a timed role off now")
        .addUserOption((o) => o.setName("member").setDescription("Whose").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Which role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("Timed roles running here")
        .addUserOption((o) => o.setName("member").setDescription("Only this member's")),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (sub === "list") {
      const user = interaction.options.getUser("member");
      const rows = await listTimedRoles(ctx.db, guild.id, user?.id, 25);
      await interaction.reply(
        cardReply({
          tone: "volt",
          title: user ? `Timed roles for ${user.username}` : "Timed roles",
          blocks: [
            {
              text: rows.length
                ? rows
                    .map((r) => `<@${r.userId}> has <@&${r.roleId}> until ${ts(r.expiresAt, "f")}`)
                    .join("\n")
                : `None running. Give one with ${slash("temprole give")}.`,
            },
          ],
          module: "insignia",
        }),
      );
      return;
    }
    const user = interaction.options.getUser("member", true);
    const role = interaction.options.getRole("role", true);
    const target = await guild.members.fetch(user.id).catch(() => null);
    const real = guild.roles.cache.get(role.id);
    if (!real) {
      await interaction.reply(cardReply(note("Role not found", "Pick a role from this server.")));
      return;
    }
    const problem = roleProblem(
      real,
      interaction.member,
      guild.ownerId,
      grantableRoles(guild, [real.id]).length === 1,
    );
    if (problem) {
      await interaction.reply(cardReply(note("Can't use that role", problem)));
      return;
    }
    if (sub === "remove") {
      const row = await getTimedRole(ctx.db, guild.id, user.id, real.id);
      if (!row) {
        await interaction.reply(
          cardReply(
            note("Not a timed role", `${user.username} doesn't have ${real.name} as a timed role.`),
          ),
        );
        return;
      }
      if (target?.roles.cache.has(real.id))
        await target.roles.remove(
          real,
          `Garrison: timed role taken off by ${interaction.user.username}`,
        );
      await removeTimedRole(ctx.db, row.id);
      await interaction.reply(
        cardReply({
          tone: "go",
          title: "Taken off",
          blocks: [{ text: `<@${user.id}> no longer has <@&${real.id}>.` }],
          module: "insignia",
        }),
      );
      return;
    }
    if (!target || user.bot) {
      await interaction.reply(
        cardReply(note("Not a member", "Give timed roles to members of this server, not bots.")),
      );
      return;
    }
    const ms = parseDuration(interaction.options.getString("for", true));
    if (!ms) {
      await interaction.reply(
        cardReply(
          note(
            "How long?",
            `Write a time like 30m, 2h, 3d, 1w or 1d 12h: a minute to ${TIMED_ROLE_MAX_DAYS} days.`,
          ),
        ),
      );
      return;
    }
    const had = await getTimedRole(ctx.db, guild.id, user.id, real.id);
    if (!had) {
      const limit = timedRoleLimit(entitlements(await getGuildPlan(ctx.db, guild.id)));
      if ((await countTimedRoles(ctx.db, guild.id)) >= limit) {
        await interaction.reply(
          cardReply(
            note(
              "Too many timed roles",
              `This server has ${limit} timed roles running, its plan's most. Garrison Pro runs 1,000.`,
            ),
          ),
        );
        return;
      }
    }
    await target.roles.add(real, `Garrison: timed role from ${interaction.user.username}`);
    const expiresAt = new Date(Date.now() + ms);
    await setTimedRole(ctx.db, {
      guildId: guild.id,
      userId: user.id,
      roleId: real.id,
      expiresAt,
      givenBy: interaction.user.id,
    });
    await interaction.reply(
      cardReply({
        tone: "go",
        title: had ? "Timed role moved" : "Timed role given",
        blocks: [
          {
            text: `<@${user.id}> has <@&${real.id}> until ${ts(expiresAt, "f")} (${ts(expiresAt)}). Garrison takes it off then.`,
          },
        ],
        module: "insignia",
      }),
    );
  },
};
