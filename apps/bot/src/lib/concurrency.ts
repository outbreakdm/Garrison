/**
 * Run `work` over `items` with at most `limit` running at once, in order of starting. For
 * per-server loops that outgrow one-at-a-time as servers grow, without sending every server
 * at the database pool (5 connections) or Discord's per-route limits at once. Each item's
 * error is the callback's to handle; one that throws doesn't stop the others.
 */
export async function forEachLimit<T>(
  items: Iterable<T>,
  limit: number,
  work: (item: T) => Promise<unknown>,
): Promise<void> {
  const queue = [...items];
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const item = queue[next++] as T;
      await work(item).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, worker));
}
