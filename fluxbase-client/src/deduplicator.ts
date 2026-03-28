// ============================================================
// Fluxbase Client SDK - Request Deduplicator
// Prevents identical concurrent fetches from making multiple
// HTTP requests. All callers share a single in-flight promise.
// ============================================================

export class Deduplicator {
  private _inflight: Map<string, Promise<any>> = new Map();

  /**
   * Execute a fetch function, deduplicating identical concurrent calls.
   * @param key - Unique cache key (e.g. hash of SQL + projectId)
   * @param fn - The async function to execute
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this._inflight.has(key)) {
      return this._inflight.get(key) as Promise<T>;
    }

    const promise = fn().finally(() => {
      this._inflight.delete(key);
    });

    this._inflight.set(key, promise);
    return promise;
  }

  /** Returns how many requests are currently in-flight */
  get size(): number {
    return this._inflight.size;
  }
}
