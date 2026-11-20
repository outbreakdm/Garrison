import { describe, expect, it } from "vitest";
import { type WatchedClient, watchClient } from "./watchdog";

/** A query like postgres-js's: a Promise that runs when first awaited (then calls handle). */
class FakeQuery extends Promise<unknown> {
  static override get [Symbol.species]() {
    return Promise;
  }
  ran = 0;
  isRaw: string | boolean = false;
  constructor(
    executor: (ok: (v: unknown) => void, no: (e: unknown) => void) => void,
    private run: () => void = () => {},
  ) {
    super(executor);
  }
  handle() {
    this.ran++;
    this.run();
  }
  values() {
    this.isRaw = "values";
    return this;
  }
  // biome-ignore lint/suspicious/noThenProperty: postgres-js's queries run when awaited, like this
  override then<A, B>(
    ok?: ((v: unknown) => A | PromiseLike<A>) | null,
    no?: ((e: unknown) => B | PromiseLike<B>) | null,
  ) {
    this.handle();
    return super.then(ok, no);
  }
}

/** A pool whose queries answer at once, or hang until it's ended (a dropped connection). */
function fakePool(name: string, hang: () => boolean) {
  const ended: number[] = [];
  const waiting: ((e: unknown) => void)[] = [];
  const pool: WatchedClient & { name: string; ended: number[]; sent: string[] } = {
    name,
    ended,
    sent: [],
    options: { parsers: {}, serializers: {} },
    unsafe(query: unknown) {
      let ok!: (v: unknown) => void;
      let no!: (e: unknown) => void;
      const q = new FakeQuery(
        (a, b) => {
          ok = a;
          no = b;
        },
        () => {
          pool.sent.push(String(query));
          if (hang()) waiting.push(no);
          else ok([{ pool: name }]);
        },
      );
      return q;
    },
    begin: async () => ({ pool: name }),
    end: async (o?: { timeout?: number }) => {
      ended.push(o?.timeout ?? -1);
      for (const no of waiting.splice(0)) no(new Error("write CONNECTION_DESTROYED"));
    },
  };
  return pool;
}

describe("the database watchdog", () => {
  it("leaves a query alone until it's awaited, and keeps postgres-js's .values()", async () => {
    const pools: ReturnType<typeof fakePool>[] = [];
    const dog = watchClient(
      () => {
        const p = fakePool(`p${pools.length}`, () => false);
        pools.push(p);
        return p;
      },
      { stuckAfterMs: 1000, checkEveryMs: 60_000 },
    );
    const q = dog.client.unsafe("select 1") as FakeQuery;
    expect(q.ran).toBe(0);
    expect(pools[0]?.sent).toEqual([]);
    // Drizzle asks for rows as arrays before awaiting; that must reach the real query.
    expect((q.values() as FakeQuery).isRaw).toBe("values");
    await expect(q).resolves.toEqual([{ pool: "p0" }]);
    expect(pools[0]?.sent).toEqual(["select 1"]);
    await dog.close();
  });

  it("replaces the pool when a query hangs, failing it instead of waiting forever", async () => {
    let t = 0;
    let hang = true;
    const pools: ReturnType<typeof fakePool>[] = [];
    const recycled: { stuckMs: number; running: number }[] = [];
    const dog = watchClient(
      () => {
        const p = fakePool(`p${pools.length}`, () => hang);
        pools.push(p);
        return p;
      },
      {
        stuckAfterMs: 60_000,
        checkEveryMs: 1_000_000,
        now: () => t,
        onRecycle: (i) => recycled.push(i),
      },
    );
    // Drizzle sets its parsers on the first pool; a new pool must parse the same way.
    const firstPool = pools[0];
    if (firstPool) firstPool.options.parsers["1184"] = "keep as text";

    const stuck = (dog.client.unsafe("select 'stuck'") as FakeQuery).then(
      () => "answered",
      (e: unknown) => (e as Error).message,
    );
    await Promise.resolve();
    t = 59_000;
    expect(dog.check()).toBe(false);
    t = 61_000;
    expect(dog.check()).toBe(true);
    expect(await stuck).toMatch(/CONNECTION_DESTROYED/);
    expect(pools[0]?.ended).toEqual([0]);
    expect(recycled).toEqual([{ stuckMs: 61_000, running: 1 }]);
    expect(pools[1]?.options.parsers["1184"]).toBe("keep as text");

    // The next query goes to the new pool and answers.
    hang = false;
    await expect(dog.client.unsafe("select 2") as FakeQuery).resolves.toEqual([{ pool: "p1" }]);
    // Nothing is stuck now, so nothing is replaced again.
    t = 500_000;
    expect(dog.check()).toBe(false);
    expect(dog.recycles()).toBe(1);
    await dog.close();
    expect(pools[1]?.ended).toEqual([5]);
  });

  it("times transactions too, and forgets what finished", async () => {
    let t = 0;
    const dog = watchClient(() => fakePool("p", () => false), {
      stuckAfterMs: 1000,
      checkEveryMs: 1_000_000,
      now: () => t,
    });
    await dog.client.begin(async () => {});
    await dog.client.unsafe("select 1");
    t = 10_000;
    expect(dog.check()).toBe(false);
    await dog.close();
  });
});
