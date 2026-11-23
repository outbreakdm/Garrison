import { randomUUID } from "node:crypto";
import {
  AI_SUPPLIES_PER_MESSAGE,
  addQmMessage,
  finishAiCall,
  getQmBuild,
  latestWaitingQmBuild,
  listQmThread,
  meterAiCall,
  QM_MICROS_PER_SUPPLY,
  QM_MIN_MESSAGE_SUPPLIES,
  type QmBuild,
  qmHoldSupplies,
  reserveAiCall,
  suppliesFor,
} from "@garrison/db";
import type { Guild } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { carryOver, draftIsEmpty } from "./carry.js";
import { displayName, MAX_OPERATIONS } from "./plan.js";
import {
  type ChatTurn,
  DEFAULT_MODEL,
  type DraftPlan,
  type Planner,
  type PlannerUsage,
  revisionBase,
} from "./planner.js";
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
  warnIfOverHold,
} from "./service.js";
import { QM_CHAT_ROUNDS, settingsReader } from "./tools.js";

/** A Discord timestamp's day, as the web shows it: "Dec 3". */
const dayName = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

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
 * $0.001), even when Garrison's checks refused the plan it drafted: that AI was paid for, and
 * a free refusal let a pool spend AI it never counted (2026-11-20). Every answer, including a
 * refusal, is saved to the conversation with what it cost, so the page shows it. Before
 * answering, the model may look at the server's settings (tools.ts); it can't change them.
 */
export async function chatTurn(
  ctx: BotContext,
  planner: Planner,
  guild: Guild,
  person: { id: string; tag: string },
  input: {
    message: string;
    threadId?: string;
    fresh?: boolean;
    continues?: QmBuild | null;
    /** What it's doing, for the page while it waits. */
    onStep?: (step: string) => void;
  },
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
      model: planner.model ?? DEFAULT_MODEL,
      text: text.replace(/<t:(\d+):[a-zA-Z]>/g, (_, s: string) => `on ${dayName(Number(s))}`),
      ...extra,
    });

  // The build the conversation works on. One draft per person per server, built up message by
  // message: a waiting draft of theirs comes first, from whichever conversation; else the
  // build this continues, or the last one this conversation drafted.
  let working = await latestWaitingQmBuild(ctx.db, guild.id, person.id);
  if (!working) working = input.continues ?? null;
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
    dailyBudgetMicros: await dailyBudgetMicros(ctx),
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
  // What this message may cost, every request in it: its hold. The planner counts each
  // request first and fits it inside what's left, so near the end of a pool (or on a big
  // server) the answer gets shorter or looks less, and never costs more than it held.
  const holdMicros = reserved.hold * QM_MICROS_PER_SUPPLY;

  // Charged what it cost, whatever happens to the plan it drafts.
  let answered = false;
  let usage: PlannerUsage | undefined;
  try {
    const snap = snapshot(guild);
    // What's left for changes once a typical message is paid for.
    const room = allowance.suppliesLeft - AI_SUPPLIES_PER_MESSAGE;
    const maxOperations = Math.max(1, Math.min(MAX_OPERATIONS, room));
    const continuation = working ? await continuationFor(ctx, guild, working) : undefined;
    // A revision keeps everything in the waiting draft it doesn't name in drop (carry.ts).
    const onto = (plan: DraftPlan): DraftPlan | null => {
      if (continuation?.mode !== "revise") return plan;
      const merged = carryOver(revisionBase(continuation), plan).plan;
      return draftIsEmpty(merged) ? null : merged;
    };
    const emptied = "That would leave the draft with nothing in it. Discard the draft instead.";
    const turns: ChatTurn[] = [...history, userMessage].map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.buildId ? `${m.text}\n[You drafted a plan here.]` : m.text,
    }));
    const chat = planner.chat.bind(planner);
    const ask = (history: ChatTurn[], withReads: boolean, budgetMicros: number) =>
      chat({
        history,
        ...snap,
        maxOperations,
        continuation,
        rounds: withReads ? QM_CHAT_ROUNDS : 1,
        budgetMicros,
        read: withReads ? settingsReader(ctx.db, guild, allowance) : undefined,
        onStep: input.onStep,
      });
    input.onStep?.("Reading your server");
    let result = await ask(turns, true, holdMicros);
    usage = result.usage;
    let cost = callUsage(usage, model);
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
    if (result.plan || result.planProblem) {
      if (room < 1) reply = `${reply} ${suppliesMessage(allowance)}`;
      else {
        input.onStep?.("Checking the draft");
        // A plan whose JSON didn't match the format is refused the same way, with what's wrong.
        const first = result.plan ? onto(result.plan) : null;
        let checked: Awaited<ReturnType<typeof checkDraft>> = first
          ? await checkDraft(ctx, guild, first, snap.server, maxOperations)
          : {
              ok: false,
              errors: [
                result.plan ? emptied : (result.planProblem?.error ?? "The plan was empty."),
              ],
            };
        // Refused: show the model Garrison's reasons and its own draft once, and take the
        // corrected plan, instead of telling the admin about a plan that won't build. Only
        // with what's left of this message's hold: one that doesn't fit isn't sent.
        if (!checked.ok) {
          ctx.logger.info("AI assistant draft refused; asking for a fix", {
            guildId: guild.id,
            errors: checked.errors,
          });
          const draft = result.plan;
          const draftText = draft
            ? JSON.stringify({
                operations: draft.operations,
                edits: draft.edits ?? [],
                order: draft.order ?? [],
                settings: draft.settings,
                posts: draft.posts,
              })
            : (result.planProblem?.json ?? "");
          input.onStep?.("Fixing what Garrison's checks refused");
          const retry = await ask(
            [
              ...turns,
              {
                role: "assistant",
                text: `${result.reply}\n<draft>${draftText}</draft>`,
              },
              {
                role: "user",
                text: `<garrison_check>Garrison's checks refused that draft, so nothing was saved:\n${checked.errors
                  .slice(0, 8)
                  .map((e) => `- ${e}`)
                  .join(
                    "\n",
                  )}\nSend the corrected plan in full, in plan_json. Keep what was fine, fix or drop what was refused, and make the reply describe the corrected plan. If it can't be fixed, leave the plan empty and say why in one sentence.</garrison_check>`,
              },
            ],
            false,
            holdMicros - cost.costMicros,
          );
          if (retry.usage)
            usage = {
              ...retry.usage,
              inputTokens: (usage?.inputTokens ?? 0) + retry.usage.inputTokens,
              outputTokens: (usage?.outputTokens ?? 0) + retry.usage.outputTokens,
              cacheReadTokens: (usage?.cacheReadTokens ?? 0) + (retry.usage.cacheReadTokens ?? 0),
              cacheWriteTokens:
                (usage?.cacheWriteTokens ?? 0) + (retry.usage.cacheWriteTokens ?? 0),
              costMicros: cost.costMicros + callUsage(retry.usage, model).costMicros,
            };
          cost = callUsage(usage, model);
          if (usage) await meterAiCall(ctx.db, reserved.id, cost);
          if (retry.ok) {
            result = retry;
            reply = retry.reply.trim() || reply;
            const fixed = retry.plan ? onto(retry.plan) : null;
            if (fixed) checked = await checkDraft(ctx, guild, fixed, snap.server, maxOperations);
            else if (retry.plan) checked = { ok: false, errors: [emptied] };
            else if (retry.planProblem) checked = { ok: false, errors: [retry.planProblem.error] };
            else checked = { ok: false, errors: [] };
          }
        }
        if (!checked.ok && !checked.errors.length) {
          // The model said why it couldn't be done; its reply already explains.
        } else if (!checked.ok) {
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
            result.ok ? result.model : model,
            { continues: working, replacing },
          );
          if (stored.ok) build = stored.build;
          else reply = `${reply} ${stored.error}`;
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
      supplies: suppliesFor(cost.costMicros),
    });
    return { ok: true, threadId: thread, reply, build };
  } finally {
    const spent = callUsage(usage, model);
    warnIfOverHold(ctx, guild.id, spent, reserved.hold);
    await finishAiCall(ctx.db, reserved.id, {
      ...spent,
      ok: answered,
      charge: true,
    }).catch((error: unknown) =>
      ctx.logger.warn("Couldn't record an AI assistant chat call", { guildId: guild.id, error }),
    );
  }
}

/** Not enough supplies left for a message, in plain words. */
export function chatLimitMessage(a: SuppliesInfo) {
  return `${suppliesMessage(a)} Plans you've drafted can still be built.`;
}
