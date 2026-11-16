import { eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { type InviteLabel, readInviteLabels } from "../invite-labels";
import { inviteSettings } from "../schema";

export async function getInviteLabels(db: Db, guildId: string): Promise<InviteLabel[]> {
  const [row] = await db
    .select({ labels: inviteSettings.labels })
    .from(inviteSettings)
    .where(eq(inviteSettings.guildId, guildId));
  return readInviteLabels(row?.labels ?? []);
}

export interface InviteStat {
  code: string;
  joins: number;
  /** Of those who joined over a week ago, how many hadn't left within the week. */
  settled: number;
  stayed: number;
  lastJoin: Date | null;
}

/** Joins per invite over the last `days`, and how many stayed a week. */
export async function inviteStats(
  db: Db,
  guildId: string,
  days: number,
  now = new Date(),
): Promise<InviteStat[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const result = await db.execute(sql`
    select j.invite_code as code,
      count(*)::int as joins,
      count(*) filter (where j.at < ${weekAgo}::timestamptz)::int as settled,
      count(*) filter (where j.at < ${weekAgo}::timestamptz and not exists (
        select 1 from member_flow l
        where l.guild_id = j.guild_id and l.user_id = j.user_id and l.kind = 'leave'
          and l.at >= j.at and l.at < j.at + interval '7 days'))::int as stayed,
      max(j.at) as "lastJoin"
    from member_flow j
    where j.guild_id = ${guildId} and j.kind = 'join' and j.invite_code is not null
      and j.at >= ${since}::timestamptz
    group by j.invite_code`);
  // postgres-js answers with an array, PGlite with { rows }.
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    code: string;
    joins: number;
    settled: number;
    stayed: number;
    lastJoin: string | Date | null;
  }[];
  return rows.map((r) => ({
    code: r.code,
    joins: Number(r.joins),
    settled: Number(r.settled),
    stayed: Number(r.stayed),
    lastJoin: r.lastJoin ? new Date(r.lastJoin) : null,
  }));
}
