import { createHmac } from "node:crypto";
import { safeEqual } from "./security";

/**
 * Whether a webhook really came from Twitch: the HMAC of its ID, time and body with Garrison's
 * secret, and sent in the last 10 minutes (so an old one can't be replayed). Pure but for the clock.
 */
export function verifyTwitchMessage(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
) {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const sent = Date.parse(headers.timestamp);
  if (Number.isNaN(sent) || Math.abs(now - sent) > 10 * 60_000) return false;
  const expected = `sha256=${createHmac("sha256", secret)
    .update(headers.id + headers.timestamp + body)
    .digest("hex")}`;
  return safeEqual(expected, headers.signature);
}
