import { ledgerTypeLabels } from "@garrison/brand";
import { entitlements, exportLedger, getGuildPlan } from "@garrison/db";
import { getDb } from "@/lib/db";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";

/**
 * The event log as CSV (Pro), with the page's filters. Same gate as the page; a
 * Free server gets a 402 with a plain explanation. Cells that start like a formula
 * are prefixed so spreadsheets show them as text.
 */
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const access = await checkGuildAccess(guildId);
  if (!access) return new Response("Not found", { status: 404 });
  const db = await getDb();
  if (!entitlements(await getGuildPlan(db, access.guild.id))["ledger.export"])
    return new Response("Downloading the event log is part of Garrison Pro.", {
      status: 402,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  const url = new URL(req.url);
  const user = url.searchParams.get("user")?.trim();
  const type = url.searchParams.get("type") ?? undefined;
  const events = await exportLedger(db, {
    guildId: access.guild.id,
    userId: user && isSnowflake(user) ? user : undefined,
    type: type && Object.hasOwn(ledgerTypeLabels, type) ? type : undefined,
  });
  const rows = [
    ["id", "time_utc", "event", "summary", "actor_id", "target_id", "channel_id", "reason", "text"],
    ...events.map((e) => [
      e.id,
      e.createdAt.toISOString(),
      ledgerTypeLabels[e.type] ?? e.type,
      e.summary,
      e.actorId,
      e.targetId,
      e.channelId,
      typeof e.data.reason === "string" ? e.data.reason : "",
      typeof e.data.text === "string"
        ? e.data.text
        : typeof e.data.after === "string"
          ? `${e.data.before ?? ""} -> ${e.data.after}`
          : "",
    ]),
  ];
  return new Response(`${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ledger-${access.guild.id}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
