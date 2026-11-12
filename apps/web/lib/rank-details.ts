import {
  entitlements,
  getActiveGuild,
  getGuildPlan,
  getRankDetails,
  getRanksSettings,
  listRankGuildsForUser,
  type RankCardField,
  rankCardForPlan,
  readRankCard,
} from "@garrison/db";
import { getDb } from "./db";
import { isGuildMember } from "./discord";

export interface RankDetailsForm {
  guildId: string;
  guildName: string;
  fields: RankCardField[];
  answers: Record<string, string>;
}

/**
 * Servers where this member has XP, is still a member, and the rank card asks
 * for details (Pro). Each server's membership is asked of Discord.
 */
export async function rankDetailsForms(userId: string, onlyGuildId?: string) {
  const db = await getDb();
  const rows = (await listRankGuildsForUser(db, userId)).filter(
    (r) => !onlyGuildId || r.guildId === onlyGuildId,
  );
  const out: RankDetailsForm[] = [];
  for (const r of rows.slice(0, 20)) {
    const guild = await getActiveGuild(db, r.guildId);
    if (!guild) continue;
    const [settings, plan] = await Promise.all([
      getRanksSettings(db, guild.id),
      getGuildPlan(db, guild.id),
    ]);
    const style = rankCardForPlan(readRankCard(settings.card), entitlements(plan));
    if (!settings.enabled || !style.fields.length) continue;
    if (!(await isGuildMember(guild.id, userId))) continue;
    out.push({
      guildId: guild.id,
      guildName: guild.name,
      fields: style.fields,
      answers: await getRankDetails(db, guild.id, userId),
    });
  }
  return out;
}
