// Pure scoring state machine: graze-driven multiplier with time decay,
// per-kill payouts, and a no-hit wave bonus. No Three.js, no DOM, no
// store access: plain numbers only, safe for headless vitest.

/** Multiplier cap: grazes stack 1 -> 2 -> 3 and pin there. */
export const MAX_MULTIPLIER = 3;
/** Idle window per decay step: each full window drops the multiplier by 1. */
export const MULTIPLIER_DECAY_MS = 4000;
/** Flat wave-clear bonus, paid only on a no-hit wave. */
export const WAVE_BONUS_POINTS = 500;

export interface ScoreState {
  score: number;
  kills: number;
  multiplier: number;
  /** Milliseconds since the last graze; drives decay in updateScore. */
  msSinceGraze: number;
}

/** Fresh run state: zero score, zero kills, 1x multiplier, idle timer. */
export function createScore(): ScoreState {
  return { score: 0, kills: 0, multiplier: 1, msSinceGraze: 0 };
}

/**
 * Register a near-miss: multiplier steps up by exactly 1 toward the cap
 * and the decay timer resets. Never throttled here; live throttling (if
 * any) belongs to the caller so tables and debug hooks stay deterministic.
 */
export function registerGraze(state: ScoreState): void {
  if (state.multiplier < MAX_MULTIPLIER) {
    state.multiplier += 1;
  }
  state.msSinceGraze = 0;
}

/**
 * Pay out a kill at the current multiplier: score gains
 * basePoints * multiplier and kills increments by one. Kills never touch
 * the decay timer; only registerGraze resets it.
 */
export function awardKill(state: ScoreState, basePoints: number): number {
  const payout = Math.max(basePoints, 0) * state.multiplier;
  state.score += payout;
  state.kills += 1;
  return payout;
}

/**
 * Decay the multiplier toward 1: each full MULTIPLIER_DECAY_MS window
 * since the last graze steps it down by 1. Never drops below 1. At 1x the
 * idle timer parks at 0 so it cannot grow without bound.
 */
export function updateScore(state: ScoreState, dtMs: number): void {
  const step = Math.max(dtMs, 0);
  if (step <= 0) {
    return;
  }
  if (state.multiplier <= 1) {
    state.multiplier = 1;
    state.msSinceGraze = 0;
    return;
  }
  state.msSinceGraze += step;
  // Epsilon guards float error: 240 STEP_MS quanta sum to exactly
  // 4000 ms in reals but accumulate just under it in binary floats.
  while (
    state.msSinceGraze + 1e-9 >= MULTIPLIER_DECAY_MS &&
    state.multiplier > 1
  ) {
    state.multiplier -= 1;
    state.msSinceGraze = Math.max(0, state.msSinceGraze - MULTIPLIER_DECAY_MS);
  }
  if (state.multiplier <= 1) {
    state.multiplier = 1;
    state.msSinceGraze = 0;
  }
}

/**
 * Wave-clear bonus: adds WAVE_BONUS_POINTS only when tookHit is false.
 * Returns the bonus paid (500 or 0).
 */
export function applyWaveBonus(state: ScoreState, tookHit: boolean): number {
  if (tookHit) {
    return 0;
  }
  state.score += WAVE_BONUS_POINTS;
  return WAVE_BONUS_POINTS;
}

/** Restore fresh values in place so owners keep a single authority. */
export function resetScore(state: ScoreState): void {
  state.score = 0;
  state.kills = 0;
  state.multiplier = 1;
  state.msSinceGraze = 0;
}
