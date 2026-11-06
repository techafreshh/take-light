import { describe, expect, it, vi } from 'vitest';
import {
  MAX_FRAME_DELTA_MS,
  MAX_STEPS_PER_FRAME,
  STEP_MS,
  computeStepCount,
  createFixedLoop,
} from './loop';

describe('accumulator', () => {
  it('2000 ms yields 120 steps at 60 Hz', () => {
    expect(computeStepCount(2000, STEP_MS)).toBe(120);
  });

  it('floor division keeps partial steps out', () => {
    expect(computeStepCount(STEP_MS * 2 + 1, STEP_MS)).toBe(2);
    expect(computeStepCount(0, STEP_MS)).toBe(0);
    expect(computeStepCount(-50, STEP_MS)).toBe(0);
  });

  it('remainder is preserved across frames', () => {
    const update = vi.fn();
    const loop = createFixedLoop(update, () => undefined, () => true);
    loop.frame(0);
    expect(update).toHaveBeenCalledTimes(0);
    // 25 ms: one step, ~8.33 ms carried over.
    loop.frame(25);
    expect(update).toHaveBeenCalledTimes(1);
    // +8.34 ms completes the carried remainder into a second step.
    loop.frame(25 + 8.34);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('delta over 100 ms is clamped', () => {
    const update = vi.fn();
    const loop = createFixedLoop(update, () => undefined, () => true);
    loop.frame(0);
    loop.frame(MAX_FRAME_DELTA_MS + 5000);
    // Clamped 100 ms budget caps steps even before the per-frame cap.
    expect(update.mock.calls.length).toBeLessThanOrEqual(
      MAX_STEPS_PER_FRAME,
    );
    expect(update.mock.calls.length).toBeGreaterThan(0);
  });

  it('more than MAX_STEPS_PER_FRAME of backlog is capped per frame', () => {
    const update = vi.fn();
    const loop = createFixedLoop(update, () => undefined, () => true);
    loop.frame(0);
    // 10 steps of backlog; only the per-frame cap may run.
    loop.frame(STEP_MS * 10);
    expect(update).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);
  });

  it('tick only advances while running and resets on demand', () => {
    let gate = false;
    const loop = createFixedLoop(
      () => undefined,
      () => undefined,
      () => gate,
    );
    loop.frame(0);
    loop.frame(STEP_MS * 3);
    expect(loop.getTick()).toBe(0);
    gate = true;
    loop.frame(STEP_MS * 3 + STEP_MS * 2);
    expect(loop.getTick()).toBe(2);
    loop.resetTick();
    expect(loop.getTick()).toBe(0);
  });

  it('update receives the fixed step and render runs every frame', () => {
    const update = vi.fn();
    const render = vi.fn();
    const loop = createFixedLoop(update, render, () => true);
    loop.frame(100);
    loop.frame(100 + STEP_MS);
    expect(update).toHaveBeenCalledWith(STEP_MS);
    // First frame (init) + one driven frame.
    expect(render).toHaveBeenCalledTimes(2);
  });
});
