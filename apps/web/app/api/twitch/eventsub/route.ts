import {
  addTwitchSubscriber,
  followsTwitch,
  removeTwitchSubscriber,
  revokeTwitchSubs,
} from "@garrison/db";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyTwitchMessage } from "@/lib/twitch-verify";

/**
 * Twitch's webhooks for subscriber roles (EventSub). Only messages signed with Garrison's
 * secret in the last 10 minutes count; anything else is a 403. A subscription starting or
 * ending updates the list the bot gives the role from; Twitch revoking access stops it.
 */

const ID = /^\d{1,20}$/;
const TIERS = new Set(["1000", "2000", "3000"]);

export async function POST(request: Request) {
  const secret = env().TWITCH_EVENTSUB_SECRET;
  if (!secret) return new Response("Not set up", { status: 404 });
  const body = await request.text();
  if (body.length > 100_000) return new Response("Too large", { status: 413 });
  const h = request.headers;
  if (
    !verifyTwitchMessage(
      secret,
      {
        id: h.get("twitch-eventsub-message-id"),
        timestamp: h.get("twitch-eventsub-message-timestamp"),
        signature: h.get("twitch-eventsub-message-signature"),
      },
      body,
    )
  )
    return new Response("Forbidden", { status: 403 });

  let message: {
    challenge?: unknown;
    subscription?: { type?: unknown; condition?: { broadcaster_user_id?: unknown } };
    event?: { user_id?: unknown; broadcaster_user_id?: unknown; tier?: unknown };
  };
  try {
    message = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const kind = h.get("twitch-eventsub-message-type");
  if (kind === "webhook_callback_verification" && typeof message.challenge === "string")
    return new Response(message.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });

  const db = await getDb();
  const broadcaster = String(
    message.event?.broadcaster_user_id ??
      message.subscription?.condition?.broadcaster_user_id ??
      "",
  );
  if (!ID.test(broadcaster) || !(await followsTwitch(db, broadcaster)))
    return new Response(null, { status: 204 });
  if (kind === "revocation") {
    await revokeTwitchSubs(db, broadcaster);
    return new Response(null, { status: 204 });
  }
  if (kind !== "notification") return new Response(null, { status: 204 });
  const user = String(message.event?.user_id ?? "");
  if (!ID.test(user)) return new Response(null, { status: 204 });
  const type = message.subscription?.type;
  if (type === "channel.subscribe") {
    const tier = String(message.event?.tier ?? "1000");
    await addTwitchSubscriber(db, broadcaster, user, TIERS.has(tier) ? tier : "1000");
  } else if (type === "channel.subscription.end") {
    await removeTwitchSubscriber(db, broadcaster, user);
  }
  return new Response(null, { status: 204 });
}
