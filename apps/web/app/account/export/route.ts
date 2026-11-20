import { exportMyData } from "@garrison/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

/**
 * "Download your data": everything Garrison keeps that is the signed-in person's own, as one
 * JSON file. Only ever their own (the session's user ID); never cached. Server records about
 * them (cases, notes, tickets, the event log) belong to each server and are listed as such.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login?next=/account", env().APP_URL), 303);
  const data = await exportMyData(await getDb(), session.userId);
  const body = {
    about:
      "Everything Garrison keeps that is yours. Records a server keeps about you (moderation cases, staff notes, tickets, its event log) belong to that server: ask its staff, or email support@garrisonbot.com.",
    exportedAt: new Date().toISOString(),
    account: { discordId: session.userId, username: session.username },
    ...data,
  };
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="garrison-data-${day}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
