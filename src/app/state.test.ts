import { describe, expect, it, vi } from 'vitest';
import { createStore, isLegalTransition } from './state';

describe('state machine', () => {
  it('BOOT -> MENU -> RUNNING -> GAMEOVER -> MENU succeeds', () => {
    const store = createStore('BOOT');
    const seen: string[] = [];
    store.subscribe((state) => {
      seen.push(state);
    });
    store.set('MENU');
    store.set('RUNNING');
    store.set('GAMEOVER');
    store.set('MENU');
    expect(store.get()).toBe('MENU');
    expect(seen).toEqual(['BOOT', 'MENU', 'RUNNING', 'GAMEOVER', 'MENU']);
  });

  it('RUNNING -> MENU restart succeeds', () => {
    const store = createStore('MENU');
    store.set('RUNNING');
    store.set('MENU');
    expect(store.get()).toBe('MENU');
  });

  it('same-state set does not re-notify', () => {
    const store = createStore('MENU');
    const listener = vi.fn();
    store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    store.set('MENU');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('illegal BOOT -> RUNNING is ignored', () => {
    const store = createStore('BOOT');
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('RUNNING');
    expect(store.get()).toBe('BOOT');
    // Only the immediate subscribe notification, no transition.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('illegal MENU -> GAMEOVER is ignored', () => {
    const store = createStore('MENU');
    store.set('GAMEOVER');
    expect(store.get()).toBe('MENU');
    expect(isLegalTransition('MENU', 'GAMEOVER')).toBe(false);
    expect(isLegalTransition('MENU', 'RUNNING')).toBe(true);
  });

  it('unsubscribe stops notifications', () => {
    const store = createStore('BOOT');
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set('MENU');
    expect(store.get()).toBe('MENU');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
