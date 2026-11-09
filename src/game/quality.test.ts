// Quality tier pins: viewport mapping (performance exactly when
// shouldDisableBloom fires), DPR caps 2/1.5/1 composed under capDpr,
// bloom gating, and step-down hysteresis with no auto step-up.

import { describe, expect, it } from 'vitest';
import { capDpr } from './scene';
import { shouldDisableBloom } from './postfx';
import {
  BALANCED_VIEWPORT_PX,
  FPS_STEP_DOWN,
  STEP_DOWN_WINDOWS,
  bloomForTier,
  dprCapForTier,
  effectiveDprForTier,
  qualityForViewport,
  shouldStepDown,
  stepDownTier,
} from './quality';

describe('qualityForViewport', () => {
  it('is performance exactly when shouldDisableBloom fires', () => {
    const widths = [320, 360, 767, 768, 1024, 1280, 1920];
    for (const width of widths) {
      for (const coarse of [false, true]) {
        const disabled = shouldDisableBloom(width, coarse);
        const tier = qualityForViewport(width, coarse);
        expect(tier === 'performance').toBe(disabled);
      }
    }
  });

  it('maps narrow/coarse viewports to performance', () => {
    expect(qualityForViewport(360, false)).toBe('performance');
    expect(qualityForViewport(1024, true)).toBe('performance');
  });

  it('maps mid widths to balanced and wide desktops to high', () => {
    expect(BALANCED_VIEWPORT_PX).toBe(1280);
    expect(qualityForViewport(768, false)).toBe('balanced');
    expect(qualityForViewport(1024, false)).toBe('balanced');
    expect(qualityForViewport(1279, false)).toBe('balanced');
    expect(qualityForViewport(1280, false)).toBe('high');
    expect(qualityForViewport(1920, false)).toBe('high');
  });
});

describe('dpr caps', () => {
  it('caps DPR per tier at 2/1.5/1', () => {
    expect(dprCapForTier('high')).toBe(2);
    expect(dprCapForTier('balanced')).toBe(1.5);
    expect(dprCapForTier('performance')).toBe(1);
  });

  it('composes the tier cap under the global capDpr clamp', () => {
    expect(effectiveDprForTier('high', 3)).toBe(capDpr(3));
    expect(effectiveDprForTier('balanced', 3)).toBe(
      Math.min(capDpr(3), 1.5),
    );
    expect(effectiveDprForTier('performance', 2)).toBe(
      Math.min(capDpr(2), 1),
    );
    expect(effectiveDprForTier('high', 1)).toBe(1);
    expect(effectiveDprForTier('balanced', 1)).toBe(1);
    expect(effectiveDprForTier('performance', 1)).toBe(1);
  });
});

describe('bloom gating', () => {
  it('keeps bloom on high/balanced and drops it on performance', () => {
    expect(bloomForTier('high')).toBe(true);
    expect(bloomForTier('balanced')).toBe(true);
    expect(bloomForTier('performance')).toBe(false);
  });
});

describe('step-down hysteresis', () => {
  it('steps down only after sustained low windows', () => {
    expect(FPS_STEP_DOWN).toBe(45);
    expect(STEP_DOWN_WINDOWS).toBe(4);
    expect(shouldStepDown(0)).toBe(false);
    expect(shouldStepDown(STEP_DOWN_WINDOWS - 1)).toBe(false);
    expect(shouldStepDown(STEP_DOWN_WINDOWS)).toBe(true);
    expect(shouldStepDown(STEP_DOWN_WINDOWS + 3)).toBe(true);
  });

  it('walks high -> balanced -> performance and never steps up', () => {
    expect(stepDownTier('high')).toBe('balanced');
    expect(stepDownTier('balanced')).toBe('performance');
    expect(stepDownTier('performance')).toBe('performance');
    const tiers = ['high', 'balanced', 'performance'] as const;
    const rank = { high: 2, balanced: 1, performance: 0 } as const;
    for (const tier of tiers) {
      expect(rank[stepDownTier(tier)]).toBeLessThanOrEqual(rank[tier]);
    }
  });
});
