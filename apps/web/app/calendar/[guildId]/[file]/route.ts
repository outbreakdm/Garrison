import { timingSafeEqual } from "node:crypto";
import { buildIcs, getActiveGuild, getCalendarToken, listOpsForCalendar } from "@garrison/db";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { isSnowflake } from "@/lib/security";

/**
 * A server's raids as an ICS feed, for calendar apps that can't sign in: the link
 * carries a secret the dashboard makes (`/calendar/<server>/<secret>.ics`). Raid
 * names, times and notes only, never who signed up. Resetting the secret on the
 * dashboard cuts off every old link.
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guildId: string; file: string }> },
) {
  const { guildId, file } = await params;
  const token = file.endsWith(".ics") ? file.slice(0, -4) : file;
  if (!isSnowflake(guildId) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return notFound();
  const db = await getDb();
  const guild = await getActiveGuild(db, guildId);
  const stored = guild ? await getCalendarToken(db, guild.id) : null;
  if (!guild || !stored || !same(stored, token)) return notFound();
  const now = new Date();
  const raids = await listOpsForCalendar(db, guild.id, new Date(now.getTime() - 60 * 86_400_000));
  const ics = buildIcs({
    calendarName: `${guild.name} raids`,
    raids,
    url: `${env().APP_URL}/play/${guild.id}`,
    now,
  });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="raids.ics"',
      "cache-control": "private, max-age=900",
      "x-robots-tag": "noindex",
    },
  });
}
