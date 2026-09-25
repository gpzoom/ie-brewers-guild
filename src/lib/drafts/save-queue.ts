/**
 * Runs draft saves for one key (a member + section) strictly one after
 * another, and lets the page know when saves are still pending.
 *
 * Several editors send whole arrays (hours, slides, links), and the
 * database merges each save over the stored section, so:
 *
 * - Saves for a key never overlap: the last save sent is the last one
 *   stored.
 * - A task's payload should be built WHEN THE TASK RUNS, from the editor's
 *   latest list (a ref the editor updates optimistically before queueing),
 *   not captured when it was queued. Otherwise a save queued just before
 *   another edit -- say two quick "Add" clicks -- would send a list missing
 *   the second item, or a later save would re-send an item that an earlier
 *   one had removed. useSaveDraftSection passes the patch as a function for
 *   exactly this.
 * - A failed save doesn't block the ones queued behind it.
 *
 * `pending(prefix)` / `subscribe` let editors skip a loader re-sync while
 * their section still has saves in flight, and let the top bar show
 * "Saving…" and wait for `whenIdle()` before publishing or discarding.
 */
export type SaveQueue = {
  enqueue: <T>(key: string, task: () => Promise<T>) => Promise<T>;
  /** Queued + running saves whose key starts with `prefix` (all when omitted). */
  pending: (prefix?: string) => number;
  /** Resolves once nothing (matching `prefix`) is queued or running. Never rejects. */
  whenIdle: (prefix?: string) => Promise<void>;
  /** Called whenever the pending count changes; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
};

export function createSaveQueue(): SaveQueue {
  const tails = new Map<string, Promise<unknown>>();
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let idleWaiters: Array<{ prefix: string; resolve: () => void }> = [];

  function pending(prefix = ""): number {
    let total = 0;
    for (const [key, count] of counts) if (key.startsWith(prefix)) total += count;
    return total;
  }

  function changed() {
    idleWaiters = idleWaiters.filter((waiter) => {
      if (pending(waiter.prefix) > 0) return true;
      waiter.resolve();
      return false;
    });
    for (const listener of listeners) listener();
  }

  function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    changed();
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.then(
      () => task(),
      () => task(),
    );
    const tail = run
      .catch(() => undefined)
      .then(() => {
        const next = (counts.get(key) ?? 1) - 1;
        if (next > 0) counts.set(key, next);
        else counts.delete(key);
        if (tails.get(key) === tail) tails.delete(key);
        changed();
      });
    tails.set(key, tail);
    return run;
  }

  return {
    enqueue,
    pending,
    whenIdle(prefix = "") {
      if (pending(prefix) === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push({ prefix, resolve }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One queue for the whole browser tab. */
export const draftSaveQueue: SaveQueue = createSaveQueue();

export function draftQueueKey(memberId: string, section: string) {
  return `${memberId}:${section}`;
}
