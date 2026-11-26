import { brand } from "@garrison/brand";
import {
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  PermissionFlagsBits,
} from "discord.js";
import { type Card, cardMessage } from "./card.js";
import { slash } from "./slash.js";

/**
 * Where Garrison says hello when it first joins: the server's system channel (where Discord
 * posts its own join messages) if Garrison can post there, else the first text channel it
 * can. Null when it can post nowhere; then it says nothing.
 */
export function helloChannel(guild: Guild) {
  const me = guild.members.me;
  if (!me) return null;
  const can = (c: GuildBasedChannel | null | undefined): c is GuildBasedChannel =>
    !!c &&
    c.type === ChannelType.GuildText &&
    !!c
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  if (can(guild.systemChannel)) return guild.systemChannel;
  return (
    [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildText)
      .sort(
        (a, b) =>
          ("rawPosition" in a ? a.rawPosition : 0) - ("rawPosition" in b ? b.rawPosition : 0),
      )
      .find(can) ?? null
  );
}

/** A dashboard link on a step: the page that does it, or nothing without a dashboard. */
const stepButton = (label: string, url: string | null) =>
  url ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url) : undefined;

/**
 * The starting guide Garrison posts once when it joins (best bot item 2). It reads for two
 * people at once: whoever added the bot gets the setup in order of what matters most, each
 * step with a button to the dashboard page that does it; members see what Garrison brings
 * them and a few commands to try. Without a dashboard URL the steps keep their words and
 * lose their buttons.
 */
export function helloCard(guildId: string, appUrl: string | undefined): Card {
  const base = appUrl ? `${appUrl.replace(/\/$/, "")}/servers/${guildId}` : null;
  const page = (path: string) => (base ? `${base}${path}` : null);
  return {
    tone: "volt",
    title: "Thanks for adding Garrison",
    status: "Ready in about 5 minutes",
    lead: "Anyone with Manage Server can set it up",
    blocks: [
      {
        text: "Garrison keeps this server safe and gives your members more to do: moderation, anti-raid, leveling, events, an economy, and an AI that builds channels and roles for you. Everything a server needs to stay safe is free.",
      },
      "divider",
      { text: "**Start here, most important first**" },
      {
        text: "**1. Turn on protection**\nAutomod removes scam links and invite spam as they're posted. Anti-raid locks the server if a wave of accounts joins at once.",
        button: stepButton("Protect", page("#setup")),
      },
      {
        text: "**2. Pick a staff log channel**\nEvery warning, timeout and ban is posted there, so your moderators can see what happened and why.",
        button: stepButton("Pick channel", page("/watch")),
      },
      {
        text: "**3. Welcome new members**\nA welcome card greets each person who joins, in the channel you choose.",
        button: stepButton("Set up", page("/herald")),
      },
      {
        text: `**4. Build the rest with AI**\nDescribe your server and the AI assistant drafts channels, roles and permissions. Nothing changes until you apply it. Or use ${slash("qm build")}.`,
        button: stepButton("Try it", page("/quartermaster")),
      },
      "divider",
      {
        text: [
          "**Made for your community**",
          "- **Gaming clans:** looking-for-group posts, raid signups with rosters and lineups, linked game accounts",
          "- **Creators:** live stream alerts, giveaways, suggestions and a starboard",
          "- **Every server:** leveling with role rewards, an economy and shop, tickets, role menus, birthdays and trivia",
        ].join("\n"),
      },
      "divider",
      {
        text: [
          "**Try these now**",
          `Staff: ${slash("health")} checks Garrison's permissions · ${slash("security")} shows anti-raid settings`,
          `Everyone: ${slash("lfg create")} posts a group · ${slash("access")} shows what you can open on the dashboard`,
        ].join("\n"),
      },
    ],
    actions: [
      stepButton("Open dashboard", base),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Support server")
        .setURL(brand.supportUrl),
    ].filter((b): b is ButtonBuilder => !!b),
  };
}

/** The first hello, once, when Garrison is added to a server. Not on a restart or a rejoin. */
export async function sayHello(guild: Guild, appUrl: string | undefined) {
  const channel = helloChannel(guild);
  if (!channel?.isSendable()) return false;
  await channel.send(cardMessage(helloCard(guild.id, appUrl)));
  return true;
}
