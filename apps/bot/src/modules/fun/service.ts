import {
  advanceCount,
  birthdaysFor,
  birthdaysOn,
  claimBirthdayDate,
  countedNumber,
  countStep,
  getFunSettings,
  getFunState,
  getGuildLanguage,
  getOpsTimezone,
  listBirthdayGuilds,
  localDate,
  resetCount,
  say,
  setBirthdayHolders,
} from "@garrison/db";
import { type Client, type Guild, type Message, PermissionFlagsBits } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { grantableRoles } from "../applications/service.js";

/**
 * Fun extras (best bot item 12): the counting channel and birthday greetings. Settings are
 * kept for 30 s. Birthdays run once per server per local day (the server's time zone from
 * Settings → Server), and the birthday role comes off the next day.
 */

const SETTINGS_TTL_MS = 30_000;
const cache = new Map<
  string,
  { at: number; settings: Awaited<ReturnType<typeof getFunSettings>> }
>();

async function funSettings(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.settings;
  const settings = await getFunSettings(ctx.db, guildId);
  cache.set(guildId, { at: Date.now(), settings });
  return settings;
}

/** One count at a time per server, so two messages at once are judged in order. */
const queues = new Map<string, Promise<unknown>>();

export async function onCountingMessage(ctx: BotContext, message: Message) {
  if (!message.inGuild() || message.author.bot || message.webhookId) return;
  const settings = await funSettings(ctx, message.guildId);
  if (!settings.countingEnabled || settings.countingChannelId !== message.channelId) return;
  const number = countedNumber(message.content);
  if (number === null) return;
  const run = (queues.get(message.guildId) ?? Promise.resolve()).then(() =>
    judge(ctx, message, number),
  );
  queues.set(
    message.guildId,
    run.catch(() => null),
  );
  await run;
}

async function judge(ctx: BotContext, message: Message<true>, number: number) {
  const state = await getFunState(ctx.db, message.guildId);
  const step = countStep(state, number, message.author.id);
  if (step.ok) {
    if (await advanceCount(ctx.db, message.guildId, state.count, step.count, message.author.id))
      await message.react("✅").catch(() => null);
    return;
  }
  await resetCount(ctx.db, message.guildId);
  await message.react("❌").catch(() => null);
  const lang = await getGuildLanguage(ctx.db, message.guildId);
  const text = say(lang, step.reason === "twice" ? "countTwice" : "countWrong", {
    user: `<@${message.author.id}>`,
    count: state.count,
    expected: step.expected,
  });
  if (message.channel.isSendable())
    await message.channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
}

/** Birthdays for one server, if its local day hasn't run yet. */
async function birthdaysToday(ctx: BotContext, guild: Guild, now: Date) {
  const settings = await getFunSettings(ctx.db, guild.id);
  if (!settings.birthdaysEnabled) return;
  const zone = await getOpsTimezone(ctx.db, guild.id);
  const today = localDate(now, zone);
  const claimed = await claimBirthdayDate(ctx.db, guild.id, today.key);
  if (!claimed) return;
  const role = settings.birthdayRoleId
    ? grantableRoles(guild, [settings.birthdayRoleId])[0]
    : undefined;
  const canRole = role && guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles);
  // Yesterday's birthday role comes off first.
  if (canRole)
    for (const id of claimed.holders) {
      const m = await guild.members.fetch(id).catch(() => null);
      if (m?.roles.cache.has(role.id))
        await m.roles.remove(role, "Birthday is over").catch(() => null);
    }
  const people = await birthdaysFor(ctx.db, guild.id, birthdaysOn(today));
  const here: string[] = [];
  for (const b of people)
    if (
      guild.members.cache.has(b.userId) ||
      (await guild.members.fetch(b.userId).catch(() => null))
    )
      here.push(b.userId);
  if (canRole)
    for (const id of here)
      await guild.members.cache
        .get(id)
        ?.roles.add(role, "Happy birthday")
        .catch(() => null);
  await setBirthdayHolders(ctx.db, guild.id, canRole ? here : []);
  if (!here.length || !settings.birthdayChannelId) return;
  const channel = guild.channels.cache.get(settings.birthdayChannelId);
  if (!channel?.isSendable()) return;
  const lang = await getGuildLanguage(ctx.db, guild.id);
  await channel
    .send({
      content: say(lang, "happyBirthday", { users: here.map((id) => `<@${id}>`).join(", ") }),
      // The birthday people are pinged, nobody else.
      allowedMentions: { parse: [], users: here },
    })
    .catch(() => null);
}

let last = 0;

/** The minute sweep: every 10 minutes, each server with birthdays on checks its local day. */
export async function sweepBirthdays(ctx: BotContext, client: Client<true>, now = new Date()) {
  if (now.getTime() - last < 10 * 60_000) return;
  last = now.getTime();
  for (const row of await listBirthdayGuilds(ctx.db)) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    await birthdaysToday(ctx, guild, now).catch((error: unknown) =>
      ctx.logger.warn("Birthdays failed", { guildId: guild.id, error }),
    );
  }
}
