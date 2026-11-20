/**
 * A database client that replaces its connections when a query hangs.
 *
 * A query written to a connection the network dropped without saying so waits on a socket
 * nobody reads, and nothing in postgres-js ends it: the caller waits forever, and queries
 * queued behind it on the same connection wait too. Postgres can't help, since the query
 * never reached it. For the bot that meant AI assistant messages and other dashboard requests
 * sitting until they expired ("Garrison didn't get to this in time"), while the heartbeat,
 * on another connection, said all was well.
 *
 * The bot's role has a 30 s statement timeout, so no real query of its runs much longer. A
 * query still waiting after `stuckAfterMs` is on a dead connection: the whole pool is
 * swapped for a fresh one and the old one closed at once, which fails every query left on
 * it with an error its caller can report, instead of a hang. Queries from then on go to the
 * new pool.
 */

/** The parts of a postgres-js client the watchdog wraps. */
export interface WatchedClient {
  unsafe(...args: unknown[]): unknown;
  begin(...args: unknown[]): Promise<unknown>;
  end(options?: { timeout?: number }): Promise<void>;
  options: { parsers: Record<string, unknown>; serializers: Record<string, unknown> };
}

export interface WatchdogOptions {
  /** A query running this long is on a dead connection. */
  stuckAfterMs: number;
  /** How often to look. Default: a fifth of stuckAfterMs. */
  checkEveryMs?: number;
  /** Called after the pool was replaced. */
  onRecycle?: (info: { stuckMs: number; running: number }) => void;
  now?: () => number;
}

export interface Watchdog<C> {
  /** The client to hand to Drizzle: it always uses the current pool. */
  client: C;
  /** Look now (the timer does this on its own). Returns whether the pool was replaced. */
  check(): boolean;
  /** Stop looking and close the current pool. */
  close(timeoutS?: number): Promise<void>;
  /** How many times the pool was replaced. */
  recycles(): number;
}

/**
 * Wrap a postgres-js client so a hung query replaces the pool. `make` opens a fresh one; the
 * first is the one Drizzle sets its parsers on, and each later one gets the same parsers.
 */
export function watchClient<C extends WatchedClient>(
  make: () => C,
  options: WatchdogOptions,
): Watchdog<C> {
  const now = options.now ?? Date.now;
  const first = make();
  let current = first;
  let count = 0;
  // What's running, and since when, on the pool it was sent to.
  const running = new Map<object, { at: number; pool: C }>();

  const started = (key: object) => running.set(key, { at: now(), pool: current });
  const settled = (key: object) => running.delete(key);

  const fresh = () => {
    const next = make();
    Object.assign(next.options.parsers, first.options.parsers);
    Object.assign(next.options.serializers, first.options.serializers);
    return next;
  };

  /** A postgres-js query runs when it's first awaited; time it from then until it settles. */
  const watchQuery = (query: unknown) => {
    if (!query || typeof query !== "object" || !("handle" in query)) return query;
    const q = query as { handle: () => unknown };
    const handle = q.handle.bind(q);
    let begun = false;
    q.handle = () => {
      if (!begun) {
        begun = true;
        started(q);
        // Promise's own then, so listening doesn't run the query a second way.
        Promise.prototype.then.call(
          q,
          () => settled(q),
          () => settled(q),
        );
      }
      return handle();
    };
    return q;
  };

  const client = new Proxy(first, {
    get(_, prop) {
      if (prop === "unsafe") return (...args: unknown[]) => watchQuery(current.unsafe(...args));
      if (prop === "begin")
        return (...args: unknown[]) => {
          const p = current.begin(...args);
          started(p);
          p.then(
            () => settled(p),
            () => settled(p),
          );
          return p;
        };
      const value = (current as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? value.bind(current) : value;
    },
    apply(_, self, args) {
      return Reflect.apply(current as unknown as (...a: unknown[]) => unknown, self, args);
    },
  }) as C;

  const check = () => {
    const at = now();
    let oldest = 0;
    for (const r of running.values()) if (r.pool === current) oldest = Math.max(oldest, at - r.at);
    if (oldest < options.stuckAfterMs) return false;
    const old = current;
    current = fresh();
    count++;
    const left = [...running.values()].filter((r) => r.pool === old).length;
    for (const [key, r] of running) if (r.pool === old) running.delete(key);
    // At once: the stuck queries fail with an error instead of waiting forever.
    void old.end({ timeout: 0 }).catch(() => {});
    options.onRecycle?.({ stuckMs: oldest, running: left });
    return true;
  };

  const timer = setInterval(check, options.checkEveryMs ?? Math.ceil(options.stuckAfterMs / 5));
  (timer as { unref?: () => void }).unref?.();

  return {
    client,
    check,
    recycles: () => count,
    close: async (timeoutS = 5) => {
      clearInterval(timer);
      await current.end({ timeout: timeoutS });
    },
  };
}
