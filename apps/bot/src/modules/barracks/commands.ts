import { discordConnectionProviders, linkProviders } from "@garrison/brand";
import {
  getRoster,
  listLinks,
  removeProviderLinks,
  setRosterShare,
  upsertLink,
} from "@garrison/db";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { capped, cardReply, notice } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { slash } from "../../lib/slash.js";
import { safeText } from "../../lib/text.js";
import { describeLink, providerLabel } from "./format.js";
import { fetchHiscores, isValidRsn, normalizeRsn } from "./osrs.js";
import {
  rosterAdd,
  rosterAutocomplete,
  rosterMain,
  rosterMine,
  rosterRemove,
  rosterTeam,
} from "./raid-roster.js";
import { fetchRs3Hiscores } from "./rs3.js";
import { syncStatRolesFor } from "./stat-roles.js";

const PROVIDER_CHOICES = Object.entries(linkProviders).map(([value, p]) => ({
  name: p.label,
  value,
}));
const ROSTER_LIMIT = 25;

/** Open to everyone: members link their own accounts. Each person gets one lookup every 10 s. */
const lastUse = new Map<string, number>();
function rateLimited(userId: string) {
  const now = Date.now();
  if (now - (lastUse.get(userId) ?? 0) < 10_000) return true;
  lastUse.set(userId, now);
  if (lastUse.size > 50_000) lastUse.clear();
  return false;
}

function dashboardUrl(path: string) {
  const base = process.env.APP_URL;
  return base && /^https?:\/\//.test(base) ? `${base.replace(/\/$/, "")}${path}` : null;
}

export const link: Command = {
  data: guildCommand(
    "link",
    "Link your game accounts and choose whether this server's roster shows them.",
    null,
  )
    .addSubcommand((s) =>
      s
        .setName("osrs")
        .setDescription(
          "Link an Old School RuneScape account (shown as claimed: OSRS can't prove ownership)",
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Your RuneScape name")
            .setRequired(true)
            .setMaxLength(12),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("rs3")
        .setDescription(
          "Link a RuneScape 3 account (shown as claimed: RuneScape can't prove ownership)",
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Your RuneScape name")
            .setRequired(true)
            .setMaxLength(12),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("accounts")
        .setDescription(
          "Link verified accounts: Steam, Battle.net, Xbox, World of Warcraft and more",
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("share")
        .setDescription("Show or hide your linked accounts in this server's roster")
        .addBooleanOption((o) =>
          o.setName("visible").setDescription("Show them here").setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("mine").setDescription("See what you've linked"))
    .toJSON(),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.user;
    await ensureGuild(ctx, interaction.guild);

    if (sub === "accounts") {
      const url = dashboardUrl("/account");
      await interaction.reply(
        notice(
          url
            ? `Link verified accounts on your Garrison account page: ${url}\nSign in with Discord, then choose what to link. Garrison never keeps your Discord or Battle.net password or token.`
            : "Verified linking needs the Garrison dashboard, which isn't set up on this bot yet.",
          "alert",
        ),
      );
      return;
    }

    if (sub === "share") {
      const visible = interaction.options.getBoolean("visible", true);
      await setRosterShare(ctx.db, interaction.guild.id, user.id, user.username, visible);
      await syncStatRolesFor(ctx, interaction.guild, user.id);
      await interaction.reply(
        notice(
          visible
            ? "Your linked accounts now show in this server's roster."
            : "Your linked accounts are hidden from this server's roster.",
          "intel",
        ),
      );
      return;
    }

    if (sub === "mine") {
      const links = await listLinks(ctx.db, user.id);
      await interaction.reply(
        cardReply({
          title: "Your linked accounts",
          lead: links.length
            ? undefined
            : `Nothing linked yet. Try ${slash("link accounts")}, ${slash("link osrs")} or ${slash("link rs3")}.`,
          blocks: links.length
            ? [{ text: links.map((l) => `- ${describeLink(l)}`).join("\n") }]
            : [],
          module: "barracks",
          ref: links.length ? `${links.length} linked` : undefined,
        }),
      );
      return;
    }

    // osrs or rs3
    if (rateLimited(user.id)) {
      await interaction.reply(notice("One lookup every 10 s.", "caution"));
      return;
    }
    const name = interaction.options.getString("name", true);
    if (!isValidRsn(name)) {
      await interaction.reply(
        notice(
          "RuneScape names are 1 to 12 letters, numbers, spaces, hyphens or underscores.",
          "caution",
        ),
      );
      return;
    }
    await interaction.deferReply(ephemeral);
    if (sub === "rs3") {
      const rs3 = await fetchRs3Hiscores(name);
      if (!rs3.ok) {
        await interaction.editReply(
          rs3.reason === "not_found"
            ? `I can't find ${safeText(name)} on the RuneScape hiscores. Check the spelling: accounts need some training before they appear.`
            : "The RuneScape hiscores aren't answering. Try again in a minute.",
        );
        return;
      }
      await upsertLink(ctx.db, {
        userId: user.id,
        provider: "rs3",
        accountId: normalizeRsn(rs3.name),
        displayName: rs3.name,
        verified: false,
        source: "claimed",
        details: { ...rs3.stats },
      });
      await setRosterShare(ctx.db, interaction.guild.id, user.id, user.username, true);
      await syncStatRolesFor(ctx, interaction.guild, user.id);
      await interaction.editReply(
        `Linked ${safeText(rs3.name)}: total level ${rs3.stats.totalLevel}. It shows as claimed, because RuneScape has no way to prove an account is yours. It's visible in this server's roster; hide it with \`/link share visible:false\`.`,
      );
      return;
    }
    const result = await fetchHiscores(name);
    if (!result.ok) {
      await interaction.editReply(
        result.reason === "not_found"
          ? `I can't find ${safeText(name)} on the OSRS hiscores. Check the spelling: very new accounts don't appear until they've trained a little.`
          : "The OSRS hiscores aren't answering. Try again in a minute.",
      );
      return;
    }
    await upsertLink(ctx.db, {
      userId: user.id,
      provider: "osrs",
      accountId: normalizeRsn(result.name),
      displayName: result.name,
      verified: false,
      source: "claimed",
      details: { ...result.stats },
    });
    await setRosterShare(ctx.db, interaction.guild.id, user.id, user.username, true);
    await syncStatRolesFor(ctx, interaction.guild, user.id);
    await interaction.editReply(
      `Linked ${safeText(result.name)}: total ${result.stats.totalLevel}, combat ${result.stats.combatLevel}. It shows as claimed, because OSRS has no way to prove an account is yours. It's visible in this server's roster; hide it with \`/link share visible:false\`.`,
    );
  },
};

export const unlink: Command = {
  data: guildCommand("unlink", "Remove a linked game account.", null)
    .addStringOption((o) =>
      o
        .setName("game")
        .setDescription("Which account")
        .setRequired(true)
        .addChoices(...PROVIDER_CHOICES),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const provider = interaction.options.getString("game", true);
    if (!Object.hasOwn(linkProviders, provider)) return;
    const n = await removeProviderLinks(ctx.db, interaction.user.id, provider);
    if (interaction.inGuild() && interaction.guild)
      await syncStatRolesFor(ctx, interaction.guild, interaction.user.id);
    const note = discordConnectionProviders.includes(provider)
      ? " It came from your Discord Connections, so it comes back if you link accounts again while it's still connected in Discord."
      : "";
    await interaction.reply(
      notice(
        n
          ? `Removed your ${providerLabel(provider)} link${n === 1 ? "" : "s"}.${note}`
          : `You have no ${providerLabel(provider)} link.`,
        "intel",
      ),
    );
  },
};

export const roster: Command = {
  data: guildCommand(
    "roster",
    "Your raid characters, a team's roster, and shared game accounts.",
    null,
  )
    .addSubcommand((s) =>
      s
        .setName("team")
        .setDescription("Show a raid team: who's on it and their main characters")
        .addStringOption((o) =>
          o
            .setName("team")
            .setDescription("Which team (the first one if left out)")
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add one of your characters to this server's roster")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("The character's name")
            .setRequired(true)
            .setMaxLength(32),
        )
        .addStringOption((o) =>
          o.setName("class").setDescription("Class").setMaxLength(24).setAutocomplete(true),
        )
        .addStringOption((o) =>
          o.setName("spec").setDescription("Spec").setMaxLength(24).setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("role")
            .setDescription("Tank, Healer, DPS or your own (WoW: from the spec)")
            .setMaxLength(20)
            .setAutocomplete(true),
        )
        .addBooleanOption((o) => o.setName("main").setDescription("Make it your main")),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove one of your characters")
        .addStringOption((o) =>
          o
            .setName("character")
            .setDescription("Which one")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("main")
        .setDescription("Choose your main character")
        .addStringOption((o) =>
          o
            .setName("character")
            .setDescription("Which one")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) => s.setName("mine").setDescription("Your characters and teams here"))
    .addSubcommand((s) =>
      s
        .setName("accounts")
        .setDescription("Game accounts members have chosen to share in this server")
        .addStringOption((o) =>
          o
            .setName("game")
            .setDescription("Only this game")
            .addChoices(...PROVIDER_CHOICES),
        ),
    )
    .toJSON(),
  autocomplete: rosterAutocomplete,
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    // The public views post a card; each person gets one every 10 s.
    if ((sub === "team" || sub === "accounts") && rateLimited(interaction.user.id)) {
      await interaction.reply(notice("One roster view every 10 s.", "caution"));
      return;
    }
    if (sub === "team") return rosterTeam(interaction, ctx);
    if (sub === "add") return rosterAdd(interaction, ctx);
    if (sub === "remove") return rosterRemove(interaction, ctx);
    if (sub === "main") return rosterMain(interaction, ctx);
    if (sub === "mine") return rosterMine(interaction, ctx);
    const provider = interaction.options.getString("game") ?? undefined;
    if (provider && !Object.hasOwn(linkProviders, provider)) return;
    const members = await getRoster(ctx.db, interaction.guild.id, provider);
    const lines = members
      .slice(0, ROSTER_LIMIT)
      .flatMap((m) => m.links.map((l) => `<@${m.userId}> · ${describeLink(l)}`));
    await interaction.reply(
      cardReply(
        {
          tone: "intel",
          title: provider ? `Game accounts · ${providerLabel(provider)}` : "Game accounts",
          lead: lines.length
            ? undefined
            : `Nobody has shared accounts here yet. Link yours with ${slash("link accounts")}.`,
          blocks: lines.length
            ? [
                {
                  text: capped(lines, 40)
                    .map((l) => `- ${l}`)
                    .join("\n"),
                },
              ]
            : [],
          module: "barracks",
          ref: `${members.length} ${members.length === 1 ? "member" : "members"}`,
        },
        { ephemeral: false },
      ),
    );
  },
};
