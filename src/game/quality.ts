// Render quality tiers: discrete DPR/bloom steps the boot loop drops
// through only after sustained sub-floor fps, never up (no oscillation).
// Pure predicates only (no DOM, no three.js): viewport -> tier, tier ->
// DPR cap, tier -> bloom, and the sustained-low step-down helper. The
// adaptive driver lives in main.ts; unit pins live in quality.test.ts.

import { capDpr } from './scene';
import { shouldDisableBloom } from './postfx';

/** Discrete quality steps from full (high) to fill-rate-safe (performance). */
export type QualityTier = 'high' | 'balanced' | 'performance';

/**
 * Width at or above which a non-performance viewport keeps full quality.
 * Below it (but above the bloom-disable cutover) the tier is balanced.
 */
export const BALANCED_VIEWPORT_PX = 1280;

/**
 * Map a viewport to its starting tier. Performance exactly when
 * shouldDisableBloom says the composer is skipped (coarse pointer or
 * narrow viewport); balanced for mid widths; high otherwise.
 */
export function qualityForViewport(
  widthPx: number,
  coarsePointer: boolean,
): QualityTier {
  if (shouldDisableBloom(widthPx, coarsePointer)) {
    return 'performance';
  }
  if (widthPx < BALANCED_VIEWPORT_PX) {
    return 'balanced';
  }
  return 'high';
}

/**
 * DPR ceiling per tier, always under the hard RENDERER_MAX_DPR = 2 cap:
 * high keeps 2, balanced halves fill-rate at 1.5, performance at 1.
 */
export function dprCapForTier(tier: QualityTier): number {
  if (tier === 'performance') {
    return 1;
  }
  if (tier === 'balanced') {
    return 1.5;
  }
  return 2;
}

/**
 * Effective DPR for a tier and device: the tier cap composed under the
 * global capDpr clamp, so both ceilings always hold.
 */
export function effectiveDprForTier(
  tier: QualityTier,
  devicePixelRatio: number,
): number {
  return Math.min(capDpr(devicePixelRatio), dprCapForTier(tier));
}

/** Whether the tier builds the bloom composer at all. */
export function bloomForTier(tier: QualityTier): boolean {
  return tier !== 'performance';
}

/** Sustained fps below this floor counts as a low window. */
export const FPS_STEP_DOWN = 45;

/** Consecutive low fps windows before the tier steps down once. */
export const STEP_DOWN_WINDOWS = 4;

/**
 * Pure hysteresis: step down only after STEP_DOWN_WINDOWS consecutive
 * low windows. There is deliberately no step-up helper — the tier never
 * climbs back on its own, so quality cannot oscillate mid-fight.
 */
export function shouldStepDown(consecutiveLowWindows: number): boolean {
  return consecutiveLowWindows >= STEP_DOWN_WINDOWS;
}

/** One step down the ladder; saturates at performance, never steps up. */
export function stepDownTier(tier: QualityTier): QualityTier {
  if (tier === 'high') {
    return 'balanced';
  }
  return 'performance';
}
