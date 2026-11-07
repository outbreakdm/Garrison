import { revokeWebSession } from "@garrison/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken, isSameOrigin } from "@/lib/security";
import { SESSION_COOKIE } from "@/lib/session";

/** Log out: POST only, from our own origin. The session is revoked server-side, not just forgotten. */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), env().APP_URL)) {
    return new NextResponse("Cross-site request refused.", { status: 403 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && token.length <= 100) await revokeWebSession(await getDb(), hashToken(token));
  const response = NextResponse.redirect(new URL("/login", env().APP_URL), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
