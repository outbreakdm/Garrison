import {
  DISCORD_EXEMPT,
  entitlements,
  getAutomod,
  getAutomodRule,
  getGuildPlan,
  listPatternGuilds,
  PATTERN_BLOCK_MESSAGE,
  RULE_TEXT,
  removeAutomodRule,
  saveAutomodRule,
} from "@garrison/db";
import {
  type AutoModerationActionExecution,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  type Client,
  DiscordAPIError,
  type Guild,
  PermissionFlagsBits as P,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { caseDue, logToWatch } from "./automod.js";
import { applyMemberAction } from "./service.js";

/**
 * Patterns (regular expressions) run by Discord's own AutoMod. Garrison keeps one keyword
 * rule per server in step with the patterns saved on the dashboard: Discord blocks a
 * matching message before anyone sees it (its Rust engine can't be made to hang), and
 * Garrison turns each block into a case and the server's automod action, so the warning
 * ladder counts it like any other automod hit.
 */

const RULE_NAME = "Garrison: blocked patterns";
/** Unknown AutoMod rule: deleted in Discord by hand. */
const UNKNOWN_RULE = 10066;
let running = false;

/** The rule Garrison keeps in each server, for telling its blocks from other rules'. */
const ruleIds = new Map<string, { id: string | null; at: number }>();
const RULE_TTL_MS = 60_000;

async function ourRule(ctx: BotContext, guildId: string): Promise<string | null> {
  const hit = ruleIds.get(guildId);
  if (hit && Date.now() - hit.at < RULE_TTL_MS) return hit.id;
  const rec = await getAutomodRule(ctx.db, guildId);
  const id = rec?.ruleId ?? null;
  ruleIds.set(guildId, { id, at: Date.now() });
  return id;
}

/** Discord's refusal in a sentence, pointing at the pattern it means when it says. */
export function discordRefusal(error: unknown): string {
  if (!(error instanceof DiscordAPIError)) return "Discord didn't answer. Garrison tries again.";
  const found: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== "object") return;
    const errors = (node as { _errors?: { message?: string }[] })._errors;
    if (Array.isArray(errors))
      for (const e of errors) {
        const i = path.indexOf("regex_patterns");
        const which = i >= 0 && path[i + 1] ? `Pattern ${Number(path[i + 1]) + 1}: ` : "";
        if (e.message) found.push(`${which}${e.message}`);
      }
    for (const [k, v] of Object.entries(node)) if (k !== "_errors") walk(v, [...path, k]);
  };
  walk((error.rawError as { errors?: unknown }).errors, []);
  return (found[0] ?? error.message).slice(0, 300);
}

async function syncGuild(ctx: BotContext, guild: Guild) {
  const [config, rec, plan] = await Promise.all([
    getAutomod(ctx.db, guild.id),
    getAutomodRule(ctx.db, guild.id),
    getGuildPlan(ctx.db, guild.id),
  ]);
  // On Free, patterns saved under Pro past the limit wait until Pro returns.
  const patterns = config.enabled
    ? config.regexPatterns.slice(0, entitlements(plan)["automod.patterns"])
    : [];
  if (!patterns.length) {
    if (rec?.ruleId)
      await guild.autoModerationRules
        .delete(rec.ruleId, "Automod patterns removed")
        .catch((error) => {
          if (!(error instanceof DiscordAPIError && error.code === UNKNOWN_RULE)) throw error;
        });
    if (rec) await removeAutomodRule(ctx.db, guild.id);
    ruleIds.delete(guild.id);
    return;
  }
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(P.ManageGuild)) {
    const error = "Garrison needs Manage Server to give Discord the patterns.";
    // Sent stays empty, so the patterns go as soon as the permission is back.
    if (rec?.error !== error)
      await saveAutomodRule(ctx.db, {
        guildId: guild.id,
        ruleId: rec?.ruleId ?? null,
        sent: "",
        error,
      });
    return;
  }
  const data = {
    name: RULE_NAME,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.Keyword,
    triggerMetadata: { keywordFilter: [], regexPatterns: patterns, allowList: config.regexAllow },
    actions: [
      {
        type: AutoModerationActionType.BlockMessage,
        metadata: { customMessage: PATTERN_BLOCK_MESSAGE },
      },
    ],
    enabled: true,
    exemptRoles: config.exemptRoleIds.slice(0, DISCORD_EXEMPT.roles),
    exemptChannels: config.exemptChannelIds.slice(0, DISCORD_EXEMPT.channels),
    reason: "Garrison automod patterns",
  };
  const sent = JSON.stringify([
    patterns,
    config.regexAllow,
    data.exemptRoles,
    data.exemptChannels,
    PATTERN_BLOCK_MESSAGE,
  ]);
  // Sent before (accepted or refused): only a change is worth asking Discord again.
  if (rec?.sent === sent) return;
  try {
    let rule = rec?.ruleId
      ? await guild.autoModerationRules.edit(rec.ruleId, data).catch((error) => {
          if (error instanceof DiscordAPIError && error.code === UNKNOWN_RULE) return null;
          throw error;
        })
      : null;
    rule ??= await guild.autoModerationRules.create(data);
    await saveAutomodRule(ctx.db, { guildId: guild.id, ruleId: rule.id, sent, error: null });
    ruleIds.set(guild.id, { id: rule.id, at: Date.now() });
  } catch (error) {
    ctx.logger.warn("Discord refused the automod patterns", { guildId: guild.id, error });
    await saveAutomodRule(ctx.db, {
      guildId: guild.id,
      ruleId: rec?.ruleId ?? null,
      sent,
      error: discordRefusal(error),
    });
  }
}

/** Runs with the other sweeps, on its own, so a slow answer from Discord holds nothing up. */
export function sweepPatterns(ctx: BotContext, client: Client<true>) {
  if (running) return;
  running = true;
  void (async () => {
    const ids = await listPatternGuilds(ctx.db, [...client.guilds.cache.keys()]);
    for (const id of ids) {
      const guild = client.guilds.cache.get(id);
      if (!guild?.available) continue;
      await syncGuild(ctx, guild).catch((error) =>
        ctx.logger.warn("Automod patterns sync failed", { guildId: id, error }),
      );
    }
  })()
    .catch((error) => ctx.logger.error("Automod patterns sweep failed", { error }))
    .finally(() => {
      running = false;
    });
}

/**
 * Discord blocked a message with Garrison's rule: a case and the server's automod action,
 * at most one case per member every 30 seconds, like Garrison's own automod.
 */
export async function onPatternBlock(ctx: BotContext, execution: AutoModerationActionExecution) {
  if (execution.action.type !== AutoModerationActionType.BlockMessage) return;
  const guild = execution.guild;
  if (execution.ruleId !== (await ourRule(ctx, guild.id))) return;
  const config = await getAutomod(ctx.db, guild.id);
  const where = {
    guild,
    channelId: execution.channelId ?? "",
    authorId: execution.userId,
    content: execution.content,
  };
  const why = `For ${RULE_TEXT.pattern}${execution.matchedContent ? ` (“${execution.matchedContent.slice(0, 80)}”)` : ""}.`;
  if (config.action === "delete" || !caseDue(guild.id, execution.userId)) {
    await logToWatch(ctx, where, "Discord blocked a message", why);
    return;
  }
  const member =
    execution.member ?? (await guild.members.fetch(execution.userId).catch(() => null));
  if (!member) return;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const result = await applyMemberAction(ctx, {
    guild,
    actor: { id: me.id, tag: me.user.username },
    target: member.user,
    member,
    action: config.action,
    reason: `Automod: ${RULE_TEXT.pattern}`,
    durationSeconds: config.action === "timeout" ? config.timeoutMinutes * 60 : null,
    source: "automod",
  });
  if (!result.ok)
    await logToWatch(ctx, where, "Discord blocked a message", `${why} ${result.error}`);
}
