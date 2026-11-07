import "server-only";
import { getBotStatus, getLatency, uptimeSummary } from "@garrison/db";
import { getDb } from "./db";

const ONLINE_WITHIN_MS = 3 * 60_000;

/** Public service numbers for the landing and status pages. Null when the database isn't reachable. */
export async function publicMetrics() {
  try {
    const db = getDb();
    const [latency, { status, uptime }] = await Promise.all([
      getLatency(db, "", 24),
      getBotStatus(db, 30),
    ]);
    const online = Boolean(status && Date.now() - status.lastBeatAt.getTime() < ONLINE_WITHIN_MS);
    const { uptimePct, days } = uptimeSummary(uptime);
    return {
      online,
      lastBeatAt: status?.lastBeatAt ?? null,
      uptimePct,
      days,
      latency,
    };
  } catch {
    return null;
  }
}
