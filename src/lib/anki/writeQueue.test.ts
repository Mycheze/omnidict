import { describe, it, expect } from "vitest";
import {
  enqueueAnkiWrite,
  getPendingWriteCount,
  trackPendingWrite,
} from "./writeQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("writeQueue", () => {
  it("serializes writes in enqueue order", async () => {
    const order: string[] = [];
    const first = deferred<void>();

    const a = enqueueAnkiWrite(async () => {
      await first.promise;
      order.push("a");
    });
    const b = enqueueAnkiWrite(async () => {
      order.push("b");
    });

    // b must not run while a is still pending
    await Promise.resolve();
    expect(order).toEqual([]);

    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["a", "b"]);
  });

  it("keeps running later jobs after a failure", async () => {
    const failing = enqueueAnkiWrite(async () => {
      throw new Error("boom");
    });
    const next = enqueueAnkiWrite(async () => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });

  it("tracks pending operations across the whole op, even on failure", async () => {
    expect(getPendingWriteCount()).toBe(0);

    const gate = deferred<void>();
    const op = trackPendingWrite(async () => {
      await gate.promise;
    });

    expect(getPendingWriteCount()).toBe(1);
    gate.resolve();
    await op;
    expect(getPendingWriteCount()).toBe(0);

    await expect(
      trackPendingWrite(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(getPendingWriteCount()).toBe(0);
  });
});
