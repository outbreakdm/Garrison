import { randomUUID } from "node:crypto";
import {
  AI_SUPPLIES_PER_MESSAGE,
  addQmMessage,
  finishAiCall,
  getQmBuild,
  listQmThread,
  meterAiCall,
  QM_MIN_MESSAGE_SUPPLIES,
  type QmBuild,
  qmHoldSupplies,
  quickOutputTokens,
  reserveAiCall,
  suppliesFor,
} from "@garrison/db";
import type { Guild } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { displayName, MAX_OPERATIONS } from "./plan.js";
import { type ChatTurn, DEFAULT_MODEL, type Planner, type PlannerUsage } from "./planner.js";
import {
  callUsage,
  canContinue,
  checkDraft,
  continuationFor,
  dailyBudgetMicros,
  limitMessage,
  type SuppliesInfo,
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
 * One turn of the AI assistant's chat. The admin's message is saved, the model answers
 * (asking, suggesting or drafting a plan), and a drafted plan goes through the same
 * checks and supplies as any plan before it's stored as the next version. A message holds
 * the most it could cost while it runs and is charged what it really cost (1 supply per
 * $0.001); a reply whose plan Garrison's checks refused is free. Every answer, including a
 * refusal, is saved to the conversation with what it cost, so the page shows it. Before
 * answering, the model may look at the server's settings (tools.ts); it can't change them.
 */
export async function chatTurn(
  ctx: BotContext,
  planner: Planner,
  guild: Guild,
  person: { id: string; tag: string },
  input: { message: string; threadId?: string; fresh?: boolean; continues?: QmBuild | null },
): Promise<ChatOutcome> {
  if (!planner.chat) return { ok: false, error: "The AI assistant can't chat on this Garrison." };
  await ensureGuild(ctx, guild);

  // The conversation: the one asked for if it's this person's, otherwise a new one.
  let threadId = !input.fresh && input.threadId ? input.threadId : null;
  const history = threadId
    ? await listQmThread(ctx.db, guild.id, person.id, threadId, HISTORY)
    : [];
  if (!history.length) threadId = null;
  const thread = threadId ?? randomUUID();
  // The chat is read on the web, where Discord's <t:...> timestamps would show as code.
  const say = (
    text: string,
    extra: { choices?: string[]; buildId?: string | null; supplies?: number } = {},
  ) =>
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

  const userMessage = await addQmMessage(ctx.db, {
    guildId: guild.id,
    threadId: thread,
    authorId: person.id,
    role: "user",
    text: input.message,
  });
  const model = planner.model ?? DEFAULT_MODEL;
  // A message may look at settings first, and each look is another round with the model.
  const reserved = await reserveAiCall(ctx.db, {
    guildId: guild.id,
    feature: "qm_chat",
    requestedBy: person.id,
    model,
    holdSupplies: qmHoldSupplies(model, QM_CHAT_ROUNDS),
    minSupplies: QM_MIN_MESSAGE_SUPPLIES,
    exceptId: replacing?.id,
    attemptsPerHour: QM_CHAT_PER_HOUR,
    dailyBudgetMicros: dailyBudgetMicros(ctx),
  });
  if (!reserved.ok) {
    const error =
      reserved.reason === "supplies" || reserved.reason === "person"
        ? chatLimitMessage(reserved.allowance)
        : limitMessage(reserved.reason, reserved.allowance);
    await say(error);
    return { ok: false, error };
  }
  const allowance = reserved.allowance;
  // Near the end of a pool the hold is smaller: as many rounds as it pays for, no looks with
  // only one, and a shorter answer when even one round doesn't fit.
  const oneRound = qmHoldSupplies(model, 1);
  const rounds = Math.max(1, Math.min(QM_CHAT_ROUNDS, Math.floor(reserved.hold / oneRound)));
  const maxTokens = reserved.hold < oneRound ? quickOutputTokens(model, reserved.hold) : undefined;

  // Charged what it cost unless Garrison's own checks refused the plan it drafted.
  let refused = false;
  let answered = false;
  let usage: PlannerUsage | undefined;
  try {
    const snap = snapshot(guild);
    // What's left for changes once a typical message is paid for.
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
      rounds,
      maxTokens,
      read: rounds > 1 ? settingsReader(ctx.db, guild, allowance) : undefined,
    });
    usage = result.usage;
    const cost = callUsage(usage, model);
    if (!result.ok) {
      // A failed call is charged what it used: those tokens were paid for.
      await say(result.error, { supplies: suppliesFor(cost.costMicros) });
      return { ok: false, error: result.error };
    }
    answered = true;
    // Charged what it cost so far, so a plan is checked against what's really left.
    if (usage) await meterAiCall(ctx.db, reserved.id, cost);

    let reply = result.reply.trim() || "Here's what I've got.";
    let build: QmBuild | null = null;
    if (result.plan) {
      // A plan that was drafted but can't be stored: the message is free.
      refused = true;
      if (room < 1) reply = `${reply} ${suppliesMessage(allowance)}`;
      else {
        const checked = await checkDraft(ctx, guild, result.plan, snap.server, maxOperations);
        if (!checked.ok) {
          ctx.logger.info("AI assistant chat plan rejected", {
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
            refused = false;
          } else reply = `${reply} ${stored.error}`;
        }
      }
    }
    const choices = result.choices
      .map((c) => displayName(c, 60))
      .filter(Boolean)
      .slice(0, 4);
    await say(reply.slice(0, 2000), {
      choices,
      buildId: build?.id ?? null,
      supplies: refused ? 0 : suppliesFor(cost.costMicros),
    });
    return { ok: true, threadId: thread, reply, build };
  } finally {
    await finishAiCall(ctx.db, reserved.id, {
      ...callUsage(usage, model),
      ok: answered,
      charge: !refused,
    }).catch((error: unknown) =>
      ctx.logger.warn("Couldn't record an AI assistant chat call", { guildId: guild.id, error }),
    );
  }
}

/** Not enough supplies left for a message, in plain words. */
export function chatLimitMessage(a: SuppliesInfo) {
  return `${suppliesMessage(a)} Plans you've drafted can still be built.`;
}
