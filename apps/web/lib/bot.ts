import "server-only";
import { after } from "next/server";

interface BotControl {
  poke(): Promise<void>;
}

/**
 * Tell the bot a request is waiting, so it runs it now rather than on its next
 * check (up to 5 seconds later). After the response, and best effort: without
 * the binding (local dev, Docker) or if it fails, the bot's own timer still picks
 * the request up.
 */
export function wakeBot() {
  after(async () => {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const env = getCloudflareContext().env as { BOT?: BotControl };
      await env.BOT?.poke();
    } catch {
      // The timer is the fallback.
    }
  });
}
