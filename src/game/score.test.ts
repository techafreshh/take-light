import { describe, expect, it } from 'vitest';
import { STEP_MS } from './loop';
import { GRAZE_RADIUS, ORB_HIT_RADIUS, isGraze, orbHitsPlayer } from './combat';
import {
  MAX_MULTIPLIER,
  MULTIPLIER_DECAY_MS,
  WAVE_BONUS_POINTS,
  applyWaveBonus,
  awardKill,
  createScore,
  registerGraze,
  resetScore,
  updateScore,
} from './score';

describe('graze multiplier', () => {
  it('starts at 1x on a fresh state', () => {
    const state = createScore();
    expect(state.score).toBe(0);
    expect(state.kills).toBe(0);
    expect(state.multiplier).toBe(1);
    expect(state.msSinceGraze).toBe(0);
  });

  it('stacks one graze per step up to x3', () => {
    const state = createScore();
    registerGraze(state);
    expect(state.multiplier).toBe(2);
    registerGraze(state);
    expect(state.multiplier).toBe(3);
  });

  it('caps at x3 on repeated grazes', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    registerGraze(state);
    expect(state.multiplier).toBe(MAX_MULTIPLIER);
    expect(state.multiplier).toBe(3);
  });

  it('resets the decay timer on every graze', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    updateScore(state, MULTIPLIER_DECAY_MS - 1);
    expect(state.multiplier).toBe(3);
    registerGraze(state);
    updateScore(state, MULTIPLIER_DECAY_MS - 1);
    expect(state.multiplier).toBe(3);
  });
});

describe('multiplier decay', () => {
  it('holds x3 just inside the window', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    updateScore(state, MULTIPLIER_DECAY_MS - 1);
    expect(state.multiplier).toBe(3);
  });

  it('steps 3 -> 2 on exactly one window', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    updateScore(state, MULTIPLIER_DECAY_MS);
    expect(state.multiplier).toBe(2);
  });

  it('steps down one per window toward 1 and never below', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    updateScore(state, MULTIPLIER_DECAY_MS);
    expect(state.multiplier).toBe(2);
    updateScore(state, MULTIPLIER_DECAY_MS);
    expect(state.multiplier).toBe(1);
    updateScore(state, MULTIPLIER_DECAY_MS * 3);
    expect(state.multiplier).toBe(1);
  });

  it('drains two windows in a single large step', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    updateScore(state, MULTIPLIER_DECAY_MS * 2);
    expect(state.multiplier).toBe(1);
  });

  it('decays on STEP_MS quanta without skipping', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    const steps = Math.round(MULTIPLIER_DECAY_MS / STEP_MS);
    for (let i = 0; i < steps - 1; i += 1) {
      updateScore(state, STEP_MS);
    }
    expect(state.multiplier).toBe(3);
    updateScore(state, STEP_MS);
    expect(state.multiplier).toBe(2);
  });
});

describe('kill payouts', () => {
  it.each([
    { grazes: 0, expected: 100 },
    { grazes: 1, expected: 200 },
    { grazes: 2, expected: 300 },
  ])('pays base x multiplier with $grazes grazes', ({ grazes, expected }) => {
    const state = createScore();
    for (let i = 0; i < grazes; i += 1) {
      registerGraze(state);
    }
    awardKill(state, 100);
    expect(state.score).toBe(expected);
    expect(state.kills).toBe(1);
  });

  it('accumulates kills without refreshing decay', () => {
    const state = createScore();
    registerGraze(state);
    registerGraze(state);
    awardKill(state, 100);
    awardKill(state, 50);
    expect(state.score).toBe(300 + 150);
    expect(state.kills).toBe(2);
    updateScore(state, MULTIPLIER_DECAY_MS);
    expect(state.multiplier).toBe(2);
  });
});

describe('wave bonus', () => {
  it('adds 500 on a no-hit wave', () => {
    const state = createScore();
    const bonus = applyWaveBonus(state, false);
    expect(bonus).toBe(WAVE_BONUS_POINTS);
    expect(state.score).toBe(500);
  });

  it('pays nothing after a hit', () => {
    const state = createScore();
    const bonus = applyWaveBonus(state, true);
    expect(bonus).toBe(0);
    expect(state.score).toBe(0);
  });

  it('resets to fresh values', () => {
    const state = createScore();
    registerGraze(state);
    awardKill(state, 100);
    resetScore(state);
    expect(state).toEqual({ score: 0, kills: 0, multiplier: 1, msSinceGraze: 0 });
  });
});

describe('graze geometry boundaries', () => {
  it.each([
    { dist: 0, hit: true, graze: false },
    { dist: ORB_HIT_RADIUS, hit: true, graze: false },
    { dist: 0.61, hit: false, graze: true },
    { dist: 1.0, hit: false, graze: true },
    { dist: GRAZE_RADIUS, hit: false, graze: true },
    { dist: 1.51, hit: false, graze: false },
  ])('dist $dist -> hit $hit, graze $graze', ({ dist, hit, graze }) => {
    expect(orbHitsPlayer(dist, 0, 0, 0)).toBe(hit);
    expect(isGraze(dist, 0, 0, 0)).toBe(graze);
  });

  it('uses the default 0.6 hit radius', () => {
    expect(ORB_HIT_RADIUS).toBe(0.6);
    expect(GRAZE_RADIUS).toBe(1.5);
  });
});
