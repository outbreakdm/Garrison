import {
  getBirthday,
  getFunSettings,
  listBirthdays,
  removeBirthday,
  setBirthday,
  validBirthday,
} from "@garrison/db";
import { guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { cardReply } from "../../lib/card.js";

/**
 * /birthday: members save their own birthday in this server (month and day only, never the
 * year) and Garrison greets them on the day when the server turned birthdays on.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const when = (month: number, day: number) => `${MONTHS[month - 1]} ${day}`;

export const birthday: Command = {
  data: guildCommand("birthday", "Save your birthday so the server can celebrate it.", null)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Save your birthday here (month and day, never the year)")
        .addIntegerOption((o) =>
          o
            .setName("month")
            .setDescription("Month")
            .setRequired(true)
            .addChoices(...MONTHS.map((name, i) => ({ name, value: i + 1 }))),
        )
        .addIntegerOption((o) =>
          o.setName("day").setDescription("Day").setRequired(true).setMinValue(1).setMaxValue(31),
        ),
    )
    .addSubcommand((s) => s.setName("remove").setDescription("Forget your birthday here"))
    .addSubcommand((s) => s.setName("list").setDescription("Birthdays coming up in this server"))
    .toJSON(),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (sub === "set") {
      const month = interaction.options.getInteger("month", true);
      const day = interaction.options.getInteger("day", true);
      if (!validBirthday(month, day)) {
        await interaction.reply(
          cardReply({
            tone: "caution",
            title: "Not a date",
            blocks: [{ text: `${MONTHS[month - 1]} has no day ${day}.` }],
          }),
        );
        return;
      }
      await setBirthday(ctx.db, { guildId, userId: interaction.user.id, month, day });
      const settings = await getFunSettings(ctx.db, guildId);
      await interaction.reply(
        cardReply({
          tone: "go",
          title: "Birthday saved",
          blocks: [
            {
              text: settings.birthdaysEnabled
                ? `Saved: ${when(month, day)}. The server will celebrate it.`
                : `Saved: ${when(month, day)}. Birthday greetings are off in this server for now; it's kept for when they're on.`,
            },
          ],
        }),
      );
      return;
    }
    if (sub === "remove") {
      const gone = await removeBirthday(ctx.db, guildId, interaction.user.id);
      await interaction.reply(
        cardReply({
          tone: "volt",
          title: gone ? "Birthday forgotten" : "Nothing saved",
          blocks: [
            {
              text: gone
                ? "This server no longer has your birthday."
                : "You hadn't saved one here.",
            },
          ],
        }),
      );
      return;
    }
    // list: the next ten from today, wrapping round the year.
    const now = new Date();
    const today = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
    const all = await listBirthdays(ctx.db, guildId);
    const next = [...all]
      .sort((a, b) => {
        const ka = a.month * 100 + a.day;
        const kb = b.month * 100 + b.day;
        return ((ka - today + 1300) % 1300) - ((kb - today + 1300) % 1300);
      })
      .slice(0, 10);
    const mine = await getBirthday(ctx.db, guildId, interaction.user.id);
    await interaction.reply(
      cardReply({
        tone: "volt",
        title: "Birthdays coming up",
        blocks: [
          {
            text: next.length
              ? next.map((b) => `${when(b.month, b.day)}: <@${b.userId}>`).join("\n")
              : "Nobody has saved a birthday here yet. Save yours with /birthday set.",
          },
        ],
        lead: mine ? `Yours: ${when(mine.month, mine.day)}` : undefined,
      }),
    );
  },
};
