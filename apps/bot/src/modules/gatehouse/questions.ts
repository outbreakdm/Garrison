import {
  checkVerifyAnswers,
  decideVerifyAnswers,
  type GatehouseSettings,
  getGatehouseSettings,
  pruneVerifyAnswers,
  readVerifyQuestions,
  recordVerifyAnswers,
  setVerifyAnswersCard,
  VERIFY_ANSWERS_DAYS,
  VERIFY_LIMITS,
  type VerifyAnswersRow,
  type VerifyQuestion,
  waitingVerifyAnswers,
} from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ephemeral } from "../../commands/builders.js";
import type { BotContext, ButtonHandler, ModalHandler } from "../../commands/types.js";
import { cardMessage, ts } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { accountAgeDays, describeAccountAge } from "./plan.js";
import { verifyReady } from "./service.js";

/**
 * Verification questions. The Verify button opens a form (an intro in Markdown, then the
 * questions); the website asks the same. Answers go to the staff channel as a card. With
 * review off the role is given at once; with it on, staff approve or deny from the card's
 * buttons or the dashboard, and only one decision lands.
 */

export const FORM_PREFIX = "verifyq";
const DECIDE_PREFIX = "verifyq-decide";

export const questionsOf = (settings: Pick<GatehouseSettings, "verifyQuestions">) =>
  readVerifyQuestions(settings.verifyQuestions);

/** Discord's form: the intro as Markdown text, then each question with the line under it. */
export function questionsForm(guildId: string, questions: VerifyQuestion[], intro: string | null) {
  const modal = new ModalBuilder()
    .setCustomId(`${FORM_PREFIX}:${guildId}`)
    .setTitle("Before you join");
  if (intro?.trim() && questions.length < VERIFY_LIMITS.parts)
    modal.addTextDisplayComponents(new TextDisplayBuilder().setContent(intro.trim()));
  modal.addLabelComponents(
    ...questions.map((q) => {
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setStyle(q.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setMaxLength(q.long ? VERIFY_LIMITS.long : VERIFY_LIMITS.short)
        .setRequired(true);
      const label = new LabelBuilder().setLabel(q.label).setTextInputComponent(input);
      if (q.help) label.setDescription(q.help);
      return label;
    }),
  );
  return modal;
}

/** The staff card: who, how old their account is, and each answer quoted. */
function answersCard(member: { id: string; createdTimestamp: number }, row: VerifyAnswersRow) {
  const waiting = row.status === "waiting";
  const status =
    row.status === "waiting"
      ? "Waiting for staff"
      : row.status === "verified"
        ? "Verified"
        : row.status === "approved"
          ? `Approved by ${row.decidedBy ?? "staff"}`
          : `Denied by ${row.decidedBy ?? "staff"}`;
  const quote = (s: string) => `> ${safeText(s).replace(/\n/g, "\n> ")}`;
  return cardMessage({
    tone: row.status === "denied" ? "alert" : waiting ? "caution" : "go",
    title: "Verification answers",
    status,
    lead: `<@${row.userId}> · account ${describeAccountAge(accountAgeDays(member.createdTimestamp))} old · ${ts(row.createdAt)}`,
    blocks: row.answers.map((a) => ({ text: `**${safeText(a.label)}**\n${quote(a.value)}` })),
    actions: waiting
      ? [
          new ButtonBuilder()
            .setCustomId(`${DECIDE_PREFIX}:approve:${row.id}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${DECIDE_PREFIX}:deny:${row.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger),
        ]
      : [],
    module: "gatehouse",
    ref: `verify ${row.id.slice(0, 6)}`,
  });
}

async function postCard(
  ctx: BotContext,
  guild: Guild,
  settings: GatehouseSettings,
  member: GuildMember,
  row: VerifyAnswersRow,
) {
  const channel = settings.verifyAnswersChannelId
    ? guild.channels.cache.get(settings.verifyAnswersChannelId)
    : undefined;
  if (!channel?.isSendable()) return;
  const sent = await channel
    .send(answersCard({ id: member.id, createdTimestamp: member.user.createdTimestamp }, row))
    .catch((error) => {
      ctx.logger.warn("Could not post verification answers", { guildId: guild.id, error });
      return null;
    });
  if (sent)
    await setVerifyAnswersCard(ctx.db, row.id, { channelId: channel.id, messageId: sent.id });
}

/**
 * Answers arrived, from Discord's form or the website. Verifies now, or sends them to
 * staff; the reply is for the member.
 */
export async function receiveAnswers(
  ctx: BotContext,
  member: GuildMember,
  given: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  const ready = await verifyReady(ctx, member);
  if (!ready.ok) return { ok: Boolean(ready.verified), message: ready.message };
  const { role, settings } = ready;
  const questions = questionsOf(settings);
  if (!questions.length) {
    await member.roles.add(role, "Passed verification");
    return { ok: true, message: "Verified. Welcome in." };
  }
  const checked = checkVerifyAnswers(questions, given);
  if (!checked.ok) return { ok: false, message: checked.error };
  if (await waitingVerifyAnswers(ctx.db, member.guild.id, member.id))
    return {
      ok: true,
      message: "Your answers are with the staff already. You'll get the role once they approve.",
    };
  const review = settings.verifyReview;
  if (!review) await member.roles.add(role, "Answered the verification questions");
  const row = await recordVerifyAnswers(ctx.db, {
    guildId: member.guild.id,
    userId: member.id,
    username: member.user.username,
    answers: checked.value,
    status: review ? "waiting" : "verified",
  });
  await postCard(ctx, member.guild, settings, member, row);
  return review
    ? {
        ok: true,
        message:
          "Thanks. A moderator will read your answers; you'll get the role once they approve.",
      }
    : { ok: true, message: "Verified. Welcome in." };
}

/**
 * Staff approve or deny, from the card or the dashboard. Only one decision lands; the card
 * is redrawn with it and its buttons go.
 */
export async function decideAnswers(
  ctx: BotContext,
  guild: Guild,
  id: string,
  approve: boolean,
  actor: string,
): Promise<{ ok: boolean; message: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return { ok: false, message: "Those answers aren't here." };
  const row = await decideVerifyAnswers(ctx.db, guild.id, id, {
    status: approve ? "approved" : "denied",
    decidedBy: actor,
  });
  if (!row) return { ok: false, message: "Someone already decided, or these answers are gone." };
  const member = await guild.members.fetch(row.userId).catch(() => null);
  let note = "";
  if (approve) {
    if (!member) note = " They've left the server, so no role was given.";
    else {
      const ready = await verifyReady(ctx, member, { staffApproved: true });
      if (ready.ok) await member.roles.add(ready.role, `Answers approved by ${actor}`);
      else if (!ready.verified) note = ` ${ready.message}`;
    }
  }
  if (row.channelId && row.messageId) {
    const channel = guild.channels.cache.get(row.channelId);
    if (channel?.isTextBased())
      await channel.messages
        .edit(
          row.messageId,
          answersCard(
            { id: row.userId, createdTimestamp: member?.user.createdTimestamp ?? Date.now() },
            row,
          ),
        )
        .catch(() => null);
  }
  return {
    ok: true,
    message: approve ? `Approved ${row.username}.${note}` : `Denied ${row.username}.`,
  };
}

/** Staff: Manage Roles, or one of the server's staff roles. */
function isStaff(member: GuildMember, settings: Pick<GatehouseSettings, "staffRoleIds">) {
  return (
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    settings.staffRoleIds.some((id) => member.roles.cache.has(id))
  );
}

export const questionModals: ModalHandler = {
  prefix: FORM_PREFIX,
  async execute(interaction, ctx) {
    const settings = await getGatehouseSettings(ctx.db, interaction.guildId);
    const given: Record<string, string> = {};
    for (const q of questionsOf(settings)) {
      try {
        given[q.id] = interaction.fields.getTextInputValue(q.id);
      } catch {
        given[q.id] = "";
      }
    }
    await interaction.deferReply(ephemeral);
    const result = await receiveAnswers(ctx, interaction.member, given);
    await interaction.editReply(result.message);
  },
};

export const decideButtons: ButtonHandler = {
  prefix: DECIDE_PREFIX,
  async execute(interaction, ctx) {
    const [, choice, id] = interaction.customId.split(":");
    const settings = await getGatehouseSettings(ctx.db, interaction.guildId);
    if (!isStaff(interaction.member, settings)) {
      await interaction.reply({
        content: "Only staff (Manage Roles, or a staff role) can decide on answers.",
        ...ephemeral,
      });
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await decideAnswers(
      ctx,
      interaction.guild,
      id ?? "",
      choice === "approve",
      interaction.user.username,
    );
    await interaction.editReply(result.message);
  },
};

let lastPrune = 0;
/** Answers are kept 30 days; checked once an hour with the other sweeps. */
export async function maybePruneAnswers(ctx: BotContext) {
  if (Date.now() - lastPrune < 60 * 60_000) return;
  lastPrune = Date.now();
  await pruneVerifyAnswers(ctx.db, new Date(Date.now() - VERIFY_ANSWERS_DAYS * 86_400_000));
}
