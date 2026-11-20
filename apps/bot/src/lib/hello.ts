import {
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  PermissionFlagsBits,
} from "discord.js";
import { cardMessage } from "./card.js";

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

/**
 * The first hello, once, when Garrison is added to a server (best bot item 2): what it is and
 * a link to set it up in three clicks on the Overview. Not on a restart or a rejoin.
 */
export async function sayHello(guild: Guild, appUrl: string | undefined) {
  const channel = helloChannel(guild);
  if (!channel?.isSendable()) return false;
  const setup = appUrl ? `${appUrl.replace(/\/$/, "")}/servers/${guild.id}#setup` : null;
  await channel.send(
    cardMessage({
      tone: "volt",
      title: "Thanks for adding Garrison",
      lead: "Moderation, safety, welcome cards, roles, tickets, leveling and an AI that builds your server.",
      blocks: [
        {
          text: setup
            ? "Set it up in three clicks: turn on protection, pick a welcome channel, then let the AI assistant build the rest. Anyone with Manage Server can open the dashboard."
            : "Run `/help` to see what Garrison can do.",
        },
      ],
      actions: setup
        ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Set up Garrison").setURL(setup)]
        : [],
    }),
  );
  return true;
}
