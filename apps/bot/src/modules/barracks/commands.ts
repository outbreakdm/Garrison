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
import { dashboardBase, linkRow, NO_DASHBOARD } from "../../lib/dashboard.js";
import { brandEmbed, done, failed, info } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { describeLink, providerLabel } from "./format.js";
import { fetchHiscores, isValidRsn, normalizeRsn } from "./osrs.js";

const PROVIDER_CHOICES = Object.entries(linkProviders).map(([value, p]) => ({
  name: p.label,
  value,
}));
const ROSTER_LIMIT = 25;
const SLOW_DOWN = "That's one lookup every 10 seconds. Try again in a moment.";

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
  const base = dashboardBase();
  return base ? `${base}${path}` : null;
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
        url
          ? {
              ...info(
                "Link Steam, Battle.net, Xbox, World of Warcraft and more on your Garrison account page. Sign in with Discord, then choose what to link.\nGarrison never keeps your Discord or Battle.net password or token.",
              ),
              components: [linkRow(url, "Open your account page")],
              ...ephemeral,
            }
          : { ...failed(NO_DASHBOARD), ...ephemeral },
      );
      return;
    }

    if (sub === "share") {
      const visible = interaction.options.getBoolean("visible", true);
      await setRosterShare(ctx.db, interaction.guild.id, user.id, user.username, visible);
      await interaction.reply({
        ...done(
          visible
            ? "Your linked accounts now show in this server's roster."
            : "Your linked accounts are hidden from this server's roster.",
        ),
        ...ephemeral,
      });
      return;
    }

    if (sub === "mine") {
      const links = await listLinks(ctx.db, user.id);
      await interaction.reply({
        embeds: [
          brandEmbed({
            title: "Your linked accounts",
            description: links.length
              ? links.map(describeLink).join("\n")
              : "Nothing linked yet. Try /link osrs or /link accounts.",
            module: "barracks",
          }),
        ],
        ...ephemeral,
      });
      return;
    }

    // osrs
    if (rateLimited(user.id)) {
      await interaction.reply({ ...failed(SLOW_DOWN), ...ephemeral });
      return;
    }
    const name = interaction.options.getString("name", true);
    if (!isValidRsn(name)) {
      await interaction.reply({
        ...failed("RuneScape names are 1 to 12 letters, numbers, spaces, hyphens or underscores."),
        ...ephemeral,
      });
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await fetchHiscores(name);
    if (!result.ok) {
      await interaction.editReply(
        failed(
          result.reason === "not_found"
            ? `I can't find ${safeText(name)} on the OSRS hiscores. Check the spelling: very new accounts don't appear until they've trained a little.`
            : "The OSRS hiscores aren't answering. Try again in a minute.",
        ),
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
    await interaction.editReply(
      done(
        `Linked ${safeText(result.name)}: total level ${result.stats.totalLevel}, combat ${result.stats.combatLevel}.\nIt shows as claimed, because Old School RuneScape has no way to prove an account is yours. It's visible in this server's roster; hide it with /link share visible:false.`,
      ),
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
    const note = discordConnectionProviders.includes(provider)
      ? " It came from your Discord Connections, so it comes back if you link accounts again while it's still connected in Discord."
      : "";
    await interaction.reply({
      ...(n
        ? done(`Removed your ${providerLabel(provider)} link${n === 1 ? "" : "s"}.${note}`)
        : failed(`You have no ${providerLabel(provider)} account linked.`)),
      ...ephemeral,
    });
  },
};

export const roster: Command = {
  data: guildCommand(
    "roster",
    "Show the game accounts members have chosen to share in this server.",
    null,
  )
    .addStringOption((o) =>
      o
        .setName("game")
        .setDescription("Only this game")
        .addChoices(...PROVIDER_CHOICES),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    if (rateLimited(interaction.user.id)) {
      await interaction.reply({ ...failed(SLOW_DOWN), ...ephemeral });
      return;
    }
    const provider = interaction.options.getString("game") ?? undefined;
    if (provider && !Object.hasOwn(linkProviders, provider)) return;
    const members = await getRoster(ctx.db, interaction.guild.id, provider);
    const lines = members
      .slice(0, ROSTER_LIMIT)
      .flatMap((m) => m.links.map((l) => `<@${m.userId}> · ${describeLink(l)}`));
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: provider ? `Roster · ${providerLabel(provider)}` : "Roster",
          description: lines.length
            ? lines.slice(0, 40).join("\n")
            : "Nobody has shared accounts here yet. Link yours with /link.",
          module: "barracks",
          ref: `${members.length} ${members.length === 1 ? "member" : "members"}`,
        }),
      ],
    });
  },
};
