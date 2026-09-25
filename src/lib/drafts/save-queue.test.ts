import { describe, expect, it } from "vitest";
import { createSaveQueue } from "./save-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createSaveQueue", () => {
  it("runs saves for one key strictly in order, even when the first is slower", async () => {
    const queue = createSaveQueue();
    const order: string[] = [];
    const first = deferred<void>();
    const a = queue.enqueue("m:basics", async () => {
      order.push("a:start");
      await first.promise;
      order.push("a:end");
    });
    const b = queue.enqueue("m:basics", async () => {
      order.push("b:start");
    });
    await tick();
    expect(order).toEqual(["a:start"]);
    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("doesn't hold up a different key", async () => {
    const queue = createSaveQueue();
    const blocker = deferred<void>();
    const order: string[] = [];
    const a = queue.enqueue("m:basics", async () => {
      await blocker.promise;
      order.push("basics");
    });
    await queue.enqueue("m:media", async () => {
      order.push("media");
    });
    expect(order).toEqual(["media"]);
    blocker.resolve();
    await a;
  });

  it("a failed save rejects its own caller but doesn't block the next", async () => {
    const queue = createSaveQueue();
    const failed = queue.enqueue("k", async () => {
      throw new Error("nope");
    });
    const next = queue.enqueue("k", async () => "ok");
    await expect(failed).rejects.toThrow("nope");
    await expect(next).resolves.toBe("ok");
  });

  it("counts pending saves per prefix and resolves whenIdle", async () => {
    const queue = createSaveQueue();
    const gate = deferred<void>();
    let notified = 0;
    queue.subscribe(() => notified++);
    const a = queue.enqueue("m1:media", () => gate.promise);
    const b = queue.enqueue("m1:media", async () => undefined);
    const c = queue.enqueue("m1:basics", async () => undefined);
    expect(queue.pending("m1:media")).toBe(2);
    expect(queue.pending("m1:")).toBe(3);
    await c;
    await tick();
    expect(queue.pending("m1:basics")).toBe(0);
    let idle = false;
    const idlePromise = queue.whenIdle("m1:").then(() => {
      idle = true;
    });
    await tick();
    expect(idle).toBe(false);
    gate.resolve();
    await Promise.all([a, b, idlePromise]);
    expect(idle).toBe(true);
    expect(queue.pending()).toBe(0);
    expect(notified).toBeGreaterThan(0);
  });
});

/**
 * The pattern the list editors use: update the list ref optimistically,
 * then queue a save whose payload is read from the ref when it RUNS.
 */
describe("list saves built at run time", () => {
  function fakeServer() {
    const stored: { list: string[] } = { list: [] };
    const gates: Array<ReturnType<typeof deferred<void>>> = [];
    return {
      stored,
      gates,
      // A slow network: each save waits for its own gate before storing.
      async save(list: string[]) {
        const gate = deferred<void>();
        gates.push(gate);
        await gate.promise;
        stored.list = list;
      },
    };
  }

  it("two rapid additions both land", async () => {
    const queue = createSaveQueue();
    const server = fakeServer();
    const ref = { current: [] as string[] };

    function add(item: string) {
      ref.current = [...ref.current, item];
      return queue.enqueue("m:links", () => server.save(ref.current));
    }

    const first = add("a");
    const second = add("b");
    await tick();
    server.gates[0].resolve();
    await first;
    await tick();
    server.gates[1].resolve();
    await second;
    expect(server.stored.list).toEqual(["a", "b"]);
  });

  it("a delete queued behind an add isn't resurrected", async () => {
    const queue = createSaveQueue();
    const server = fakeServer();
    const ref = { current: ["a"] as string[] };

    ref.current = [...ref.current, "b"];
    const add = queue.enqueue("m:links", () => server.save(ref.current));
    ref.current = ref.current.filter((item) => item !== "a");
    const remove = queue.enqueue("m:links", () => server.save(ref.current));

    await tick();
    server.gates[0].resolve();
    await add;
    await tick();
    server.gates[1].resolve();
    await remove;
    expect(server.stored.list).toEqual(["b"]);
  });
});
