import {
  APPLICATIONS_DAYS,
  type ApplicationForm,
  type ApplicationRow,
  checkVerifyAnswers,
  decideApplication,
  entitlements,
  formOpen,
  getApplicationForms,
  getGuildPlan,
  pruneApplications,
  readApplicationForms,
  recordApplication,
  setApplicationCard,
  VERIFY_LIMITS,
  waitingApplication,
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
import { z } from "zod";
import { ephemeral } from "../../commands/builders.js";
import type { BotContext, ButtonHandler, ModalHandler } from "../../commands/types.js";
import { cardMessage, ts } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { DANGEROUS_PERMISSIONS } from "../gatehouse/nuke.js";

/**
 * Applications and recruitment forms (best bot item 4). A panel's Apply button opens Discord's
 * form; the answers go to the form's staff channel as a card with Accept and Decline. Staff
 * decide there or on the dashboard, only one decision lands, and accepting gives the form's
 * roles (never one with moderation powers, a bot's, or one above Garrison). The applicant
 * gets a DM with the outcome when their DMs are open.
 */

export const APPLY_PREFIX = "apply";
const FORM_PREFIX = "applyq";
const DECIDE_PREFIX = "apply-decide";

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

async function loadForm(ctx: BotContext, guildId: string, formId: string) {
  const [raw, plan] = await Promise.all([
    getApplicationForms(ctx.db, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  const forms = readApplicationForms(raw);
  const form = forms.find((f) => f.id === formId);
  if (!form) return null;
  return { form, open: formOpen(forms, formId, entitlements(plan)) };
}

/** The panel members see: the form's title and text, and its Apply button. */
export function applicationPanel(form: ApplicationForm) {
  return cardMessage({
    tone: "volt",
    title: form.title,
    blocks: form.body ? [{ text: form.body }] : [],
    actions: [
      new ButtonBuilder()
        .setCustomId(`${APPLY_PREFIX}:${form.id}`)
        .setLabel(form.buttonLabel)
        .setStyle(ButtonStyle.Primary),
    ],
  });
}

/** Discord's form for an application: the intro, then each question. */
export function applicationModal(form: ApplicationForm) {
  const modal = new ModalBuilder()
    .setCustomId(`${FORM_PREFIX}:${form.id}`)
    .setTitle(form.name.slice(0, 45));
  if (form.intro?.trim() && form.questions.length < VERIFY_LIMITS.parts)
    modal.addTextDisplayComponents(new TextDisplayBuilder().setContent(form.intro.trim()));
  modal.addLabelComponents(
    ...form.questions.map((q) => {
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

/** The staff card: who applied, to what, and each answer quoted. */
export function applicationCard(row: ApplicationRow) {
  const waiting = row.status === "waiting";
  const quote = (s: string) => `> ${safeText(s).replace(/\n/g, "\n> ")}`;
  return cardMessage({
    tone: row.status === "declined" ? "alert" : waiting ? "caution" : "go",
    title: `Application: ${safeText(row.formName)}`,
    status: waiting
      ? "Waiting for staff"
      : row.status === "accepted"
        ? `Accepted by ${row.decidedBy ?? "staff"}`
        : `Declined by ${row.decidedBy ?? "staff"}`,
    lead: `<@${row.userId}> · ${ts(row.createdAt)}`,
    blocks: row.answers.map((a) => ({ text: `**${safeText(a.label)}**\n${quote(a.value)}` })),
    actions: waiting
      ? [
          new ButtonBuilder()
            .setCustomId(`${DECIDE_PREFIX}:accept:${row.id}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${DECIDE_PREFIX}:decline:${row.id}`)
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger),
        ]
      : [],
    ref: `application ${row.id.slice(0, 6)}`,
  });
}

const postPanel = z.object({
  formId: z.string().regex(/^[a-z0-9]{6,16}$/),
  channelId: z.string().regex(/^\d{17,20}$/),
});

/** Dashboard request: post a form's panel. The same checks as posting a role menu's. */
export async function doPostApplicationPanel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = postPanel.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const loaded = await loadForm(ctx, guild.id, p.data.formId);
  if (!loaded) return fail("That form was removed. Refresh the page.");
  if (!loaded.open)
    return fail(
      `${loaded.form.name} is paused: this server has more forms than its plan runs. Remove one or upgrade on the Plan page.`,
    );
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");
  await channel.send(applicationPanel(loaded.form));
  return { ok: true, message: `Posted ${loaded.form.name} in #${channel.name}.` };
}

/** Answers arrived from Discord's form: record them and send them to staff. */
export async function receiveApplication(
  ctx: BotContext,
  member: GuildMember,
  formId: string,
  given: Record<string, string>,
): Promise<Outcome> {
  const loaded = await loadForm(ctx, member.guild.id, formId);
  if (!loaded?.open) return fail("This form isn't taking applications right now.");
  const { form } = loaded;
  const checked = checkVerifyAnswers(form.questions, given);
  if (!checked.ok) return fail(checked.error);
  if (await waitingApplication(ctx.db, member.guild.id, form.id, member.id))
    return {
      ok: true,
      message: "Your application is with the staff already. You'll hear back here or in a DM.",
    };
  const row = await recordApplication(ctx.db, {
    guildId: member.guild.id,
    formId: form.id,
    formName: form.name,
    userId: member.id,
    username: member.user.username,
    answers: checked.value,
  });
  const channel = member.guild.channels.cache.get(form.reviewChannelId);
  if (channel?.isSendable()) {
    const sent = await channel.send(applicationCard(row)).catch((error) => {
      ctx.logger.warn("Could not post an application", { guildId: member.guild.id, error });
      return null;
    });
    if (sent)
      await setApplicationCard(ctx.db, row.id, { channelId: channel.id, messageId: sent.id });
  }
  return { ok: true, message: `Thanks. Your application to ${form.name} is with the staff.` };
}

/** The roles accepting may give: real, not a bot's, below Garrison, without moderation powers. */
export function grantableRoles(guild: Guild, ids: string[]) {
  const top = guild.members.me?.roles.highest.position ?? 0;
  return ids
    .map((id) => guild.roles.cache.get(id))
    .filter(
      (r): r is NonNullable<typeof r> =>
        r !== undefined &&
        !r.managed &&
        r.id !== guild.id &&
        r.position < top &&
        !r.permissions.any(DANGEROUS_PERMISSIONS),
    );
}

/** Staff accept or decline, from the card or the dashboard. Only one decision lands. */
export async function decideOnApplication(
  ctx: BotContext,
  guild: Guild,
  id: string,
  accept: boolean,
  actor: string,
): Promise<Outcome> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return fail("That application isn't here.");
  const row = await decideApplication(ctx.db, guild.id, id, {
    status: accept ? "accepted" : "declined",
    decidedBy: actor,
  });
  if (!row) return fail("Someone already decided, or this application is gone.");
  const member = await guild.members.fetch(row.userId).catch(() => null);
  let note = "";
  if (accept) {
    const loaded = await loadForm(ctx, guild.id, row.formId);
    const roles = grantableRoles(guild, loaded?.form.acceptRoleIds ?? []);
    if (!member) note = " They've left the server, so no roles were given.";
    else if (roles.length)
      await member.roles
        .add(
          roles.map((r) => r.id),
          `Application accepted by ${actor}`,
        )
        .catch(() => {
          note = " Garrison couldn't give the roles; check its role is above them.";
        });
  }
  if (member)
    await member
      .send(
        accept
          ? `Your application to ${row.formName} in ${guild.name} was accepted.`
          : `Your application to ${row.formName} in ${guild.name} wasn't accepted this time.`,
      )
      .catch(() => null);
  if (row.channelId && row.messageId) {
    const channel = guild.channels.cache.get(row.channelId);
    if (channel?.isTextBased())
      await channel.messages.edit(row.messageId, applicationCard(row)).catch(() => null);
  }
  return {
    ok: true,
    message: accept ? `Accepted ${row.username}.${note}` : `Declined ${row.username}.`,
  };
}

const decide = z.object({ id: z.string().uuid(), accept: z.boolean() });

/** Dashboard request: accept or decline. */
export async function doApplicationDecide(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = decide.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  return decideOnApplication(ctx, guild, p.data.id, p.data.accept, member.user.username);
}

/** Staff on the card: Manage Roles or Manage Server. */
const isStaff = (member: GuildMember) =>
  member.permissions.has(PermissionFlagsBits.ManageRoles) ||
  member.permissions.has(PermissionFlagsBits.ManageGuild);

export const applyButtons: ButtonHandler = {
  prefix: APPLY_PREFIX,
  async execute(interaction, ctx) {
    const formId = interaction.customId.split(":")[1] ?? "";
    const loaded = await loadForm(ctx, interaction.guildId, formId);
    if (!loaded?.open) {
      await interaction.reply({
        content: "This form isn't taking applications right now.",
        ...ephemeral,
      });
      return;
    }
    if (await waitingApplication(ctx.db, interaction.guildId, formId, interaction.user.id)) {
      await interaction.reply({
        content: "Your application is with the staff already. You'll hear back here or in a DM.",
        ...ephemeral,
      });
      return;
    }
    await interaction.showModal(applicationModal(loaded.form));
  },
};

export const applicationModals: ModalHandler = {
  prefix: FORM_PREFIX,
  async execute(interaction, ctx) {
    const formId = interaction.customId.split(":")[1] ?? "";
    const loaded = await loadForm(ctx, interaction.guildId, formId);
    const given: Record<string, string> = {};
    for (const q of loaded?.form.questions ?? []) {
      try {
        given[q.id] = interaction.fields.getTextInputValue(q.id);
      } catch {
        given[q.id] = "";
      }
    }
    await interaction.deferReply(ephemeral);
    const result = await receiveApplication(ctx, interaction.member, formId, given);
    await interaction.editReply(result.message);
  },
};

export const decideApplicationButtons: ButtonHandler = {
  prefix: DECIDE_PREFIX,
  async execute(interaction, ctx) {
    const [, choice, id] = interaction.customId.split(":");
    if (!isStaff(interaction.member)) {
      await interaction.reply({
        content: "Only staff (Manage Roles or Manage Server) can decide on applications.",
        ...ephemeral,
      });
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await decideOnApplication(
      ctx,
      interaction.guild,
      id ?? "",
      choice === "accept",
      interaction.user.username,
    );
    await interaction.editReply(result.message);
  },
};

let lastPrune = 0;
/** Applications are kept 90 days; checked once an hour with the other sweeps. */
export async function maybePruneApplications(ctx: BotContext) {
  if (Date.now() - lastPrune < 60 * 60_000) return;
  lastPrune = Date.now();
  await pruneApplications(ctx.db, new Date(Date.now() - APPLICATIONS_DAYS * 86_400_000));
}
