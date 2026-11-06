// Generic preallocated object pool: fixed capacity set once at boot via
// the factory, then reused forever with no growth. acquire() hands out a
// free object or — when exhausted — the oldest active one as newest.
// Zero allocation in the hot path: acquire()/release() do only array
// index bookkeeping, never call the factory and never create objects.

export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly active: T[] = [];
  private readonly capacityValue: number;

  constructor(factory: () => T, capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`ObjectPool capacity must be an integer >= 1, got ${capacity}`);
    }
    this.capacityValue = capacity;
    for (let i = 0; i < capacity; i += 1) {
      this.free.push(factory());
    }
  }

  /** Fixed capacity: never changes after construction. */
  get size(): number {
    return this.capacityValue;
  }

  /** Number of currently checked-out objects (<= size). */
  get activeCount(): number {
    return this.active.length;
  }

  /** Number of objects available for reuse. */
  get freeCount(): number {
    return this.free.length;
  }

  acquire(): T {
    if (this.free.length > 0) {
      const obj = this.free.pop() as T;
      this.active.push(obj);
      return obj;
    }
    // Exhausted: reuse the oldest active object, re-appended as newest.
    const oldest = this.active.shift() as T;
    this.active.push(oldest);
    return oldest;
  }

  release(obj: T): void {
    const index = this.active.indexOf(obj);
    if (index < 0) {
      return;
    }
    this.active.splice(index, 1);
    this.free.push(obj);
  }
}
