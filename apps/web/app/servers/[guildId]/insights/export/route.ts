import { entitlements, getGuildPlan, getInsights } from "@garrison/db";
import { getDb } from "@/lib/db";
import { checkGuildAccess } from "@/lib/session";

/** Server insights as CSV (Pro): one row per day. Numbers and dates only, so no cell escaping. */
export const dynamic = "force-dynamic";

const WINDOWS = new Set([7, 30, 90, 365]);

export async function GET(req: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const access = await checkGuildAccess(guildId);
  if (!access) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const ent = entitlements(await getGuildPlan(db, access.guild.id));
  if (!ent["insights.export"])
    return new Response("Downloading insights is part of Garrison Pro.", {
      status: 402,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = WINDOWS.has(asked) && asked <= ent["insights.days"] ? asked : 30;
  const data = await getInsights(db, access.guild.id, days);
  const rows = [
    ["day_utc", "messages", "active_members", "joined", "left"],
    ...data.daily.map((d) => [d.day, d.messages, d.active, d.joins, d.leaves]),
  ];
  return new Response(`${rows.map((r) => r.join(",")).join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="insights-${access.guild.id}-${days}d.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
