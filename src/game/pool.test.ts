import { describe, expect, it, vi } from 'vitest';
import { ObjectPool } from './pool';

describe('ObjectPool', () => {
  it('preallocates N objects at construction and exposes size/activeCount', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const pool = new ObjectPool(factory, 8);
    expect(factory).toHaveBeenCalledTimes(8);
    expect(pool.size).toBe(8);
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(8);
    const obj = pool.acquire();
    expect(pool.activeCount).toBe(1);
    expect(pool.freeCount).toBe(7);
    pool.release(obj);
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(8);
    expect(factory).toHaveBeenCalledTimes(8);
  });

  it('pool capacity 128 never grows', () => {
    const factory = vi.fn(() => ({}));
    const pool = new ObjectPool<Record<string, never>>(factory, 128);
    for (let i = 0; i < 128 + 10; i += 1) {
      pool.acquire();
    }
    expect(pool.size).toBe(128);
    expect(pool.activeCount).toBe(128);
    expect(pool.freeCount).toBe(0);
    expect(factory).toHaveBeenCalledTimes(128);
  });

  it('reuses the oldest object when exhausted at capacity 4', () => {
    const pool = new ObjectPool<{ id: number }>(() => ({ id: -1 }), 4);
    const acquired = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];
    acquired.forEach((obj, index) => {
      obj.id = index;
    });
    expect(pool.activeCount).toBe(4);
    const oldest = acquired[0];
    const fifth = pool.acquire();
    expect(fifth).toBe(oldest);
    expect(pool.activeCount).toBe(4);
    expect(pool.size).toBe(4);
    expect(pool.freeCount).toBe(0);
    pool.release(fifth);
    expect(pool.activeCount).toBe(3);
    expect(pool.freeCount).toBe(1);
    expect(pool.acquire()).toBe(fifth);
    expect(pool.activeCount).toBe(4);
  });
});
