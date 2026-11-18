import { getBotLastBeat } from "@garrison/db";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { AutoRefresh } from "./AutoRefresh";
import { formatTime } from "./format";

/** The bot checks in every minute; three missed check-ins means it isn't running. */
export const BOT_ONLINE_WITHIN_MS = 3 * 60_000;

/** When the bot last checked in: null if never, undefined when the database can't say (then pages act as if it's running). */
export const botLastBeat = cache(async () => {
  try {
    return await getBotLastBeat(await getDb());
  } catch {
    return undefined;
  }
});

export function botIsLive(lastBeat: Date | null | undefined, now = Date.now()) {
  return (
    lastBeat === undefined || (lastBeat !== null && now - lastBeat.getTime() < BOT_ONLINE_WITHIN_MS)
  );
}

/**
 * While requests wait: refresh the page so their results show up, and if the bot isn't
 * running, say so instead of looking busy forever. Offline, the page still checks every
 * 15 s so it picks up the bot coming back, without hammering Discord and the database.
 */
export async function WaitingForBot({ every, forMs }: { every?: number; forMs?: number }) {
  const lastBeat = await botLastBeat();
  if (botIsLive(lastBeat)) return <AutoRefresh every={every} forMs={forMs} />;
  return (
    <>
      <AutoRefresh every={15_000} forMs={10 * 60_000} />
      <p className="notice" role="status">
        Garrison's bot isn't running right now
        {lastBeat ? ` (last seen ${formatTime(lastBeat)})` : ""}, so it can't do this yet. Your
        request waits and runs when the bot is back, or expires after 10 minutes.
      </p>
    </>
  );
}
