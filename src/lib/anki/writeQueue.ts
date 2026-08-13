/**
 * Serializer for Anki note writes.
 *
 * Media generation (10-20s) runs concurrently per card so the app stays
 * usable, but the actual Anki note writes are serialized through this queue:
 * note creation order must follow click order for "update last card"
 * semantics to make sense. Module-level so every caller shares one queue.
 */

let ankiWriteQueue: Promise<void> = Promise.resolve();
let pendingOperations = 0;

/**
 * Run `job` after every previously enqueued write has settled. Failures of
 * earlier jobs never block later ones.
 */
export function enqueueAnkiWrite<T>(job: () => Promise<T>): Promise<T> {
  const run = ankiWriteQueue.then(job, job);
  ankiWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Number of export/update operations currently in flight (including their
 * media-generation phase, not just the queued write itself).
 */
export function getPendingWriteCount(): number {
  return pendingOperations;
}

/**
 * Track a whole export/update operation (media generation + queued write) in
 * the pending count. Wrap the full operation, not just the write, so
 * "update last card" can refuse while any export is still ambiguous.
 */
export async function trackPendingWrite<T>(op: () => Promise<T>): Promise<T> {
  pendingOperations++;
  try {
    return await op();
  } finally {
    pendingOperations--;
  }
}
