/**
 * Is the bot's database connection still answering?
 *
 * Every timer in the bot waits on the database. When the pool's connections hang (a query
 * written to a connection the network dropped, which no timeout of Postgres's can end), every
 * later query queues behind them forever: the heartbeat stops, dashboard requests sit until
 * they expire, and the AI assistant never replies. Discord stays connected, so the old health
 * check kept saying "ok" and nothing restarted the bot. On 2026-11-18 that lasted 11 hours.
 *
 * Now a tiny query runs every PROBE_EVERY_MS with its own time limit. After UNHEALTHY_AFTER_MS
 * without an answer /healthz says so, and after EXIT_AFTER_MS the process exits so its host
 * starts a fresh one (Cloudflare's cron within a minute; Docker's restart policy).
 */

export const PROBE_EVERY_MS = 30_000;
export const PROBE_LIMIT_MS = 15_000;
export const UNHEALTHY_AFTER_MS = 2 * 60_000;
export const EXIT_AFTER_MS = 5 * 60_000;

export type Verdict = "ok" | "unhealthy" | "exit";

/** What to do, given when the database last answered. */
export function verdict(lastOkAt: number, now: number): Verdict {
  const silent = now - lastOkAt;
  if (silent >= EXIT_AFTER_MS) return "exit";
  if (silent >= UNHEALTHY_AFTER_MS) return "unhealthy";
  return "ok";
}

/** Resolves true if `run` finishes (either way) within `ms`, false if it's still waiting. */
export async function answersWithin(run: () => Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([
      run().then(
        () => true,
        // A query that fails fast (a refused connection) still isn't an answer we can use.
        () => false,
      ),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface Liveness {
  /** When the database last answered a probe (the start time until the first one does). */
  lastOkAt(): number;
  healthy(now?: number): boolean;
  stop(): void;
}

/**
 * Probe on a timer. `onExit` is called once when the database has been silent for
 * EXIT_AFTER_MS; the caller logs and exits. Probes don't overlap: a hung one is left behind.
 */
export function watchDatabase(
  probe: () => Promise<unknown>,
  onExit: (silentMs: number) => void,
  options: { now?: () => number; every?: number } = {},
): Liveness {
  const now = options.now ?? Date.now;
  let lastOk = now();
  let probing = false;
  let exited = false;
  const tick = async () => {
    if (probing || exited) return;
    probing = true;
    try {
      if (await answersWithin(probe, PROBE_LIMIT_MS)) lastOk = now();
    } finally {
      probing = false;
    }
    if (verdict(lastOk, now()) === "exit" && !exited) {
      exited = true;
      onExit(now() - lastOk);
    }
  };
  const timer = setInterval(() => void tick(), options.every ?? PROBE_EVERY_MS);
  timer.unref?.();
  return {
    lastOkAt: () => lastOk,
    healthy: (at = now()) => verdict(lastOk, at) === "ok",
    stop: () => clearInterval(timer),
  };
}
