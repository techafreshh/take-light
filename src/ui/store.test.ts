/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHudStore, defaultSnapshot, hudStore } from './store';

describe('hud bridge store', () => {
  it('singleton defaults score 0, 1x, wave 1, shields 3/3, dash max 1200', () => {
    const snapshot = hudStore.get();
    expect(snapshot.score).toBe(0);
    expect(snapshot.multiplier).toBe(1);
    expect(snapshot.wave).toBe(1);
    expect(snapshot.kills).toBe(0);
    expect(snapshot.shields).toBe(3);
    expect(snapshot.maxShields).toBe(3);
    expect(snapshot.dashCooldownMs).toBe(0);
    expect(snapshot.dashCooldownMaxMs).toBe(1200);
    expect(defaultSnapshot().dashCooldownMaxMs).toBe(1200);
  });

  it('push notifies subscribers with the new snapshot', () => {
    const bridge = createHudStore();
    const listener = vi.fn();
    bridge.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    bridge.push({
      score: 250,
      multiplier: 2,
      kills: 3,
      wave: 2,
      shields: 2,
      maxShields: 3,
      dashCooldownMs: 600,
      dashCooldownMaxMs: 1200,
    });
    expect(listener).toHaveBeenCalledTimes(2);
    const latest = listener.mock.calls[1]?.[0] as unknown as {
      score: number;
      multiplier: number;
    };
    expect(latest.score).toBe(250);
    expect(latest.multiplier).toBe(2);
    expect(bridge.get().score).toBe(250);
  });

  it('unsubscribe stops notifications', () => {
    const bridge = createHudStore();
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    bridge.push({
      ...bridge.get(),
      score: 999,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('source imports neither three nor game/', () => {
    const source = readFileSync('src/ui/store.ts', 'utf8');
    expect(source).not.toMatch(/from\s+['"]three['"]/);
    expect(source).not.toContain('game/');
  });
});
