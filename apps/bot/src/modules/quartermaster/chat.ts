import { randomUUID } from "node:crypto";
import {
  AI_SUPPLIES_PER_MESSAGE,
  addQmMessage,
  aiAllowance,
  costMicros,
  finishAiCall,
  getQmBuild,
  listQmThread,
  type QmBuild,
  qmReserveMicros,
  reserveAiCall,
} from "@garrison/db";
import type { Guild } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { displayName, MAX_OPERATIONS } from "./plan.js";
import { type ChatTurn, DEFAULT_MODEL, type Planner } from "./planner.js";
import {
  canContinue,
  checkDraft,
  continuationFor,
  limitMessage,
  snapshot,
  storePlan,
  suppliesMessage,
} from "./service.js";
import { QM_CHAT_ROUNDS, settingsReader } from "./tools.js";

/** Chat messages a server can send in an hour, failures included. */
export const QM_CHAT_PER_HOUR = 40;
/** How much of a conversation the model sees. */
const HISTORY = 30;

export type ChatOutcome =
  | { ok: true; threadId: string; reply: string; build: QmBuild | null }
  | { ok: false; error: string };

/**
 * One turn of the AI builder's chat. The admin's message is saved, the model answers
 * (asking, suggesting or drafting a plan), and a drafted plan goes through the same
 * checks and supplies as any plan before it's stored as the next version. A message costs
 * a message's supplies; a reply whose plan couldn't be stored gives them back. Every
 * answer, including a refusal, is saved to the conversation so the page shows it. Before
 * answering, the model may look at the server's settings (tools.ts); it can't change them.
 */
export async function chatTurn(
  ctx: BotContext,
  planner: Planner,
  guild: Guild,
  person: { id: string; tag: string },
  input: { message: string; threadId?: string; fresh?: boolean; continues?: QmBuild | null },
): Promise<ChatOutcome> {
  if (!planner.chat) return { ok: false, error: "The AI builder can't chat on this Garrison." };
  await ensureGuild(ctx, guild);

  // The conversation: the one asked for if it's this person's, otherwise a new one.
  let threadId = !input.fresh && input.threadId ? input.threadId : null;
  const history = threadId
    ? await listQmThread(ctx.db, guild.id, person.id, threadId, HISTORY)
    : [];
  if (!history.length) threadId = null;
  const thread = threadId ?? randomUUID();
  // The chat is read on the web, where Discord's <t:...> timestamps would show as code.
  const say = (text: string, extra: { choices?: string[]; buildId?: string | null } = {}) =>
    addQmMessage(ctx.db, {
      guildId: guild.id,
      threadId: thread,
      authorId: person.id,
      role: "assistant",
      text: text.replace(/<t:\d+:[a-zA-Z]>/g, "at midnight UTC"),
      ...extra,
    });

  // The build the conversation works on: the one it continues, or the last plan it drafted.
  let working = input.continues ?? null;
  if (!working) {
    const drafted = [...history].reverse().find((m) => m.buildId);
    working = drafted?.buildId ? await getQmBuild(ctx.db, guild.id, drafted.buildId) : null;
  }
  if (working && !canContinue(working)) working = null;
  const replacing = working?.status === "pending" ? working : null;

  const allowance = await aiAllowance(ctx.db, guild.id, person.id, { exceptId: replacing?.id });
  const userMessage = await addQmMessage(ctx.db, {
    guildId: guild.id,
    threadId: thread,
    authorId: person.id,
    role: "user",
    text: input.message,
  });
  const model = planner.model ?? DEFAULT_MODEL;
  const reserved = await reserveAiCall(ctx.db, {
    guildId: guild.id,
    feature: "qm_chat",
    requestedBy: person.id,
    model,
    dailySupplies: allowance.suppliesPerDay,
    personDailySupplies: allowance.perPerson ? allowance.suppliesPerDay : null,
    exceptId: replacing?.id,
    attemptsPerHour: QM_CHAT_PER_HOUR,
    dailyBudgetMicros:
      ctx.qmDailyBudgetUsd === undefined ? null : Math.round(ctx.qmDailyBudgetUsd * 1e6),
    // A message may look at settings first, and each look is another round with the model.
    reserveMicros: qmReserveMicros(model) * QM_CHAT_ROUNDS,
  });
  if (!reserved.ok) {
    const error =
      reserved.reason === "supplies" || reserved.reason === "person"
        ? chatLimitMessage(allowance)
        : limitMessage(reserved.reason, allowance);
    await say(error);
    return { ok: false, error };
  }

  let keptCredit = false;
  let usage: { model: string; inputTokens: number; outputTokens: number } | undefined;
  try {
    const snap = snapshot(guild);
    // What's left for changes once this message is paid for.
    const room = allowance.suppliesLeft - AI_SUPPLIES_PER_MESSAGE;
    const maxOperations = Math.max(1, Math.min(MAX_OPERATIONS, room));
    const continuation = working ? await continuationFor(ctx, guild, working) : undefined;
    const turns: ChatTurn[] = [...history, userMessage].map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.buildId ? `${m.text}\n[You drafted a plan here.]` : m.text,
    }));
    const result = await planner.chat({
      history: turns,
      ...snap,
      maxOperations,
      continuation,
      read: settingsReader(ctx.db, guild, allowance),
    });
    usage = result.usage;
    if (!result.ok) {
      await say(result.error);
      return { ok: false, error: result.error };
    }

    let reply = result.reply.trim() || "Here's what I've got.";
    let build: QmBuild | null = null;
    // A plan that was drafted but can't be stored: the message is free.
    let planFailed = false;
    if (result.plan) {
      planFailed = true;
      if (room < 1) reply = `${reply} ${suppliesMessage(allowance)}`;
      else {
        const checked = await checkDraft(ctx, guild, result.plan, snap.server, maxOperations);
        if (!checked.ok) {
          ctx.logger.info("AI builder chat plan rejected", {
            guildId: guild.id,
            errors: checked.errors,
          });
          reply = `${reply} I couldn't make that plan safely, though: ${checked.errors
            .slice(0, 3)
            .join(" ")} Tell me what to change and I'll try again.`;
        } else {
          const stored = await storePlan(
            ctx,
            guild.id,
            person,
            input.message,
            checked,
            result.model,
            { continues: working, replacing },
          );
          if (stored.ok) {
            build = stored.build;
            planFailed = false;
          } else reply = `${reply} ${stored.error}`;
        }
      }
    }
    const choices = result.choices
      .map((c) => displayName(c, 60))
      .filter(Boolean)
      .slice(0, 4);
    await say(reply.slice(0, 2000), { choices, buildId: build?.id ?? null });
    keptCredit = !planFailed;
    return { ok: true, threadId: thread, reply, build };
  } finally {
    await finishAiCall(ctx.db, reserved.id, {
      model: usage?.model ?? model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costMicros: usage ? costMicros(usage.model, usage.inputTokens, usage.outputTokens) : 0,
      ok: keptCredit,
    }).catch((error: unknown) =>
      ctx.logger.warn("Couldn't record an AI builder chat call", { guildId: guild.id, error }),
    );
  }
}

/** Not enough supplies left for a message, in plain words. */
export function chatLimitMessage(a: Parameters<typeof suppliesMessage>[0]) {
  return `${suppliesMessage(a)} Plans you've drafted can still be built.`;
}
