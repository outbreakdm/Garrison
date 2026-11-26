import { randomInt } from "node:crypto";
import { ButtonBuilder, type ButtonInteraction, ButtonStyle } from "discord.js";
import { guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command } from "../../commands/types.js";
import { type Card, cardMessage, cardReply, notice } from "../../lib/card.js";

/**
 * /trivia (best bot item 12): a question with four answers; the first member to pick the right
 * one wins, everyone else gets one guess each. 30 seconds, then the answer shows. Questions are
 * general and gaming knowledge, in English for now.
 */

export interface Question {
  q: string;
  /** The right answer first; they're shuffled when asked. */
  a: [string, string, string, string];
}

export const QUESTIONS: Question[] = [
  { q: "Which planet is closest to the Sun?", a: ["Mercury", "Venus", "Mars", "Earth"] },
  { q: "How many sides does a hexagon have?", a: ["6", "5", "7", "8"] },
  { q: "What is the largest ocean on Earth?", a: ["Pacific", "Atlantic", "Indian", "Arctic"] },
  {
    q: "Which gas do plants take in from the air?",
    a: ["Carbon dioxide", "Oxygen", "Nitrogen", "Helium"],
  },
  { q: "What is the capital of Japan?", a: ["Tokyo", "Kyoto", "Osaka", "Seoul"] },
  { q: "How many players are on a soccer team on the field?", a: ["11", "10", "9", "12"] },
  { q: "What is the hardest natural substance?", a: ["Diamond", "Quartz", "Iron", "Granite"] },
  {
    q: "Which animal is known as the king of the jungle?",
    a: ["Lion", "Tiger", "Elephant", "Gorilla"],
  },
  { q: "What do bees make?", a: ["Honey", "Silk", "Wax paper", "Milk"] },
  { q: "How many continents are there?", a: ["7", "6", "5", "8"] },
  { q: "What is H2O better known as?", a: ["Water", "Salt", "Hydrogen", "Ice cream"] },
  {
    q: "Which is the longest river in South America?",
    a: ["Amazon", "Paraná", "Orinoco", "Magdalena"],
  },
  { q: "What is the freezing point of water in Celsius?", a: ["0", "32", "-10", "100"] },
  {
    q: "Who painted the Mona Lisa?",
    a: ["Leonardo da Vinci", "Michelangelo", "Raphael", "Van Gogh"],
  },
  { q: "What is the smallest prime number?", a: ["2", "1", "3", "0"] },
  {
    q: "Which language has the most native speakers?",
    a: ["Mandarin Chinese", "English", "Spanish", "Hindi"],
  },
  { q: "How many minutes are in a day?", a: ["1,440", "1,200", "1,600", "3,600"] },
  { q: "What color do you get mixing blue and yellow?", a: ["Green", "Purple", "Orange", "Brown"] },
  { q: "Which metal is liquid at room temperature?", a: ["Mercury", "Lead", "Tin", "Zinc"] },
  {
    q: "What is the tallest mountain above sea level?",
    a: ["Everest", "K2", "Kilimanjaro", "Denali"],
  },
  {
    q: "In Minecraft, what do you need to make a Nether portal?",
    a: ["Obsidian", "Netherrack", "Bedrock", "Glowstone"],
  },
  { q: "Which company makes the PlayStation?", a: ["Sony", "Nintendo", "Microsoft", "Sega"] },
  { q: "What is the name of Mario's brother?", a: ["Luigi", "Wario", "Toad", "Yoshi"] },
  { q: "In chess, which piece can only move diagonally?", a: ["Bishop", "Rook", "Knight", "King"] },
  {
    q: "What is the best-selling video game of all time?",
    a: ["Minecraft", "Tetris", "GTA V", "Wii Sports"],
  },
  { q: "In Pokémon, what type is Pikachu?", a: ["Electric", "Fire", "Normal", "Psychic"] },
  { q: "Which game features the Master Chief?", a: ["Halo", "Destiny", "Doom", "Gears of War"] },
  { q: "In League of Legends, how many players are on a team?", a: ["5", "4", "6", "3"] },
  { q: "What color is a Creeper in Minecraft?", a: ["Green", "Black", "Red", "Blue"] },
  {
    q: "Which studio made The Witcher 3?",
    a: ["CD Projekt Red", "BioWare", "Bethesda", "Ubisoft"],
  },
  {
    q: "In Among Us, what are the bad players called?",
    a: ["Impostors", "Traitors", "Spies", "Hunters"],
  },
  {
    q: "What is Link's sword called in many Zelda games?",
    a: ["Master Sword", "Buster Sword", "Keyblade", "Soul Edge"],
  },
  {
    q: "Which game is set in the city of Los Santos?",
    a: ["GTA V", "Watch Dogs", "Saints Row", "Mafia"],
  },
  { q: "How many squares are on a chessboard?", a: ["64", "100", "81", "49"] },
  {
    q: "In Fortnite, what falls from the sky to start a match?",
    a: ["The Battle Bus", "Supply drops", "Rockets", "Meteors"],
  },
  { q: "What year did the original Game Boy come out?", a: ["1989", "1985", "1992", "1995"] },
  { q: "Which Valorant role is Sage?", a: ["Sentinel", "Duelist", "Initiator", "Controller"] },
  {
    q: "In Overwatch, which hero says 'Cheers, love! The cavalry's here'?",
    a: ["Tracer", "Mercy", "Widowmaker", "D.Va"],
  },
  { q: "What is the max level in Old School RuneScape skills?", a: ["99", "100", "120", "50"] },
  { q: "Which gem is red?", a: ["Ruby", "Emerald", "Sapphire", "Topaz"] },
];

const PREFIX = "trivia";
const SECONDS = 30;

interface Round {
  /** The index of the right answer among the shuffled four. */
  right: number;
  answers: string[];
  question: string;
  guessed: Set<string>;
  winner: string | null;
  over: boolean;
}
const rounds = new Map<string, Round>();

/** The four answers in a random order, and where the right one landed. */
export function shuffled(q: Question, pick: (n: number) => number = randomInt) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return { answers: order.map((i) => q.a[i] as string), right: order.indexOf(0) };
}

function card(r: Round, id: string): Card {
  const lines = r.answers.map((a, i) => `${"ABCD"[i]}. ${a}`).join("\n");
  return {
    tone: r.over ? (r.winner ? "go" : "caution") : "volt",
    title: "Trivia",
    status: r.over ? (r.winner ? "Answered" : "Time's up") : `${SECONDS} seconds`,
    blocks: [
      { text: `**${r.question}**\n${lines}` },
      ...(r.over
        ? [
            {
              text: r.winner
                ? `<@${r.winner}> got it: **${r.answers[r.right]}**.`
                : `Nobody got it. It was **${r.answers[r.right]}**.`,
            },
          ]
        : []),
    ],
    actions: r.over
      ? []
      : r.answers.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`${PREFIX}:${id}:${i}`)
            .setLabel("ABCD"[i] as string)
            .setStyle(ButtonStyle.Secondary),
        ),
  };
}

export const trivia: Command = {
  data: guildCommand(
    "trivia",
    "Ask a trivia question: the first right answer wins.",
    null,
  ).toJSON(),
  async execute(interaction) {
    const q = QUESTIONS[randomInt(QUESTIONS.length)] as Question;
    const { answers, right } = shuffled(q);
    const id = `${interaction.id}`;
    const round: Round = {
      right,
      answers,
      question: q.q,
      guessed: new Set(),
      winner: null,
      over: false,
    };
    rounds.set(id, round);
    await interaction.reply(cardReply(card(round, id), { ephemeral: false }));
    setTimeout(() => {
      if (round.over) return;
      round.over = true;
      rounds.delete(id);
      void interaction.editReply(cardMessage(card(round, id))).catch(() => null);
    }, SECONDS * 1000);
  },
};

export const triviaButtons: ButtonHandler = {
  prefix: PREFIX,
  async execute(interaction: ButtonInteraction) {
    const [, id, pick] = interaction.customId.split(":");
    const round = id ? rounds.get(id) : undefined;
    if (!round || round.over) {
      await interaction.reply(notice("This question is over.", "alert"));
      return;
    }
    if (round.guessed.has(interaction.user.id)) {
      await interaction.reply(notice("One guess each.", "caution"));
      return;
    }
    round.guessed.add(interaction.user.id);
    if (Number(pick) !== round.right) {
      await interaction.reply(notice("Not that one.", "alert"));
      return;
    }
    round.over = true;
    round.winner = interaction.user.id;
    rounds.delete(id as string);
    await interaction.update(cardMessage(card(round, id as string))).catch(() => null);
  },
};
