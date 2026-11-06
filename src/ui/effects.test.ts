/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DAMAGE_TTL_MS,
  MARKER_TTL_MS,
  mountEffects,
  spawnDamageNumber,
  spawnHitMarker,
} from './effects';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('effects layer', () => {
  it('spawn appends .damage-number synchronously', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const handle = mountEffects();
    const element = spawnDamageNumber(handle, 100, 200, '+100');
    expect(document.querySelector('.damage-number')).toBe(element);
    expect(element.textContent).toBe('+100');
    handle.unmount();
  });

  it('damage number is gone after its TTL', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    const handle = mountEffects();
    spawnDamageNumber(handle, 100, 200, '+100');
    expect(document.querySelector('.damage-number')).not.toBeNull();
    vi.advanceTimersByTime(DAMAGE_TTL_MS + 50);
    expect(document.querySelector('.damage-number')).toBeNull();
    handle.unmount();
  });

  it('hit marker flashes and removes quickly', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    const handle = mountEffects();
    spawnHitMarker(handle, 40, 60);
    expect(document.querySelector('.hit-marker')).not.toBeNull();
    vi.advanceTimersByTime(MARKER_TTL_MS + 50);
    expect(document.querySelector('.hit-marker')).toBeNull();
    handle.unmount();
  });

  it('unmount removes the layer', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const handle = mountEffects();
    expect(document.getElementById('fx-layer')).not.toBeNull();
    handle.unmount();
    expect(document.getElementById('fx-layer')).toBeNull();
  });
});
