import { describe, expect, it } from 'vitest';
import { ENEMY_CAPACITY } from './enemy';
import { BURST_SIZE } from './enemies/areaboy';
import { SPREAD_COUNT } from './enemies/carrier';
import {
  AREABOY_COST,
  CARRIER_COST,
  OKADA_COST,
  RUSH_BONUS_OKADA,
  RUSH_HOUR_MS,
  WAVE_DURATION_MS,
  budgetForWave,
  isRushHour,
  mulberry32,
  normalizeWave,
  planRun,
  planWave,
} from './director';
import {
  applyBlackout,
  blackoutForWave,
  emissiveScaleForWave,
  lightIntensityForWave,
  normalizeBlackoutWave,
} from './blackout';

describe('director determinism', () => {
  it('same seed and wave yields byte-identical plans', () => {
    const first = planWave(42, 5);
    const second = planWave(42, 5);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('repeats stably across waves and seeds', () => {
    for (const wave of [1, 2, 3, 4, 5, 8, 10]) {
      expect(planWave(7, wave)).toEqual(planWave(7, wave));
    }
    expect(planWave(1, 5)).not.toEqual(planWave(42, 5));
  });

  it('mulberry32 streams are stable per seed', () => {
    const first = mulberry32(1234);
    const second = mulberry32(1234);
    for (let i = 0; i < 8; i += 1) {
      expect(second()).toBe(first());
    }
  });

  it('clamps waves below 1 and coerces seeds to uint32', () => {
    expect(normalizeWave(0)).toBe(1);
    expect(normalizeWave(-3)).toBe(1);
    expect(planWave(42, 0)).toEqual(planWave(42, 1));
    expect(planWave(42.9, 5).seed).toBe(42);
  });
});

describe('director budget', () => {
  it('budget is 4 + wave * 2', () => {
    expect(budgetForWave(1)).toBe(6);
    expect(budgetForWave(5)).toBe(14);
    expect(budgetForWave(10)).toBe(24);
  });

  it('budget grows strictly over waves 1..10', () => {
    const budgets = planRun(42, 10).map((plan) => plan.budget);
    expect(budgets).toHaveLength(10);
    for (let i = 1; i < budgets.length; i += 1) {
      expect(budgets[i]).toBeGreaterThan(budgets[i - 1] as number);
    }
  });

  it('spend never exceeds the budget', () => {
    for (let wave = 1; wave <= 10; wave += 1) {
      const plan = planWave(42, wave);
      const spent =
        plan.okada * OKADA_COST +
        plan.areaboy * AREABOY_COST +
        plan.carrier * CARRIER_COST;
      expect(spent).toBeLessThanOrEqual(plan.budget);
    }
  });

  it('wave 1 fields only Okadas', () => {
    const plan = planWave(42, 1);
    expect(plan.okada).toBeGreaterThan(0);
    expect(plan.areaboy).toBe(0);
    expect(plan.carrier).toBe(0);
  });

  it('wave 5 mixes all three kinds', () => {
    const plan = planWave(42, 5);
    expect(plan.okada).toBeGreaterThan(0);
    expect(plan.areaboy).toBeGreaterThan(0);
    expect(plan.carrier).toBeGreaterThan(0);
  });

  it('planRun covers waves 1..count in order', () => {
    const plans = planRun(42, 5);
    expect(plans.map((plan) => plan.wave)).toEqual([1, 2, 3, 4, 5]);
    expect(plans[4]).toEqual(planWave(42, 5));
  });
});

describe('rush hour', () => {
  it('fires exactly every 4th wave', () => {
    for (let wave = 1; wave <= 12; wave += 1) {
      expect(planWave(42, wave).rushHour).toBe(wave % 4 === 0);
      expect(isRushHour(wave)).toBe(wave % 4 === 0);
    }
  });

  it('rush waves carry the 10 s swarm and bonus Okadas', () => {
    const rush = planWave(42, 4);
    expect(rush.rushHour).toBe(true);
    expect(rush.durationMs).toBe(RUSH_HOUR_MS);
    expect(rush.durationMs).toBe(10000);
    expect(rush.rushBonusOkada).toBe(RUSH_BONUS_OKADA);
    expect(rush.rushBonusOkada).toBe(6);
  });

  it('normal waves carry the standard duration and no bonus', () => {
    const calm = planWave(42, 5);
    expect(calm.rushHour).toBe(false);
    expect(calm.durationMs).toBe(WAVE_DURATION_MS);
    expect(calm.rushBonusOkada).toBe(0);
  });
});

describe('pool fit', () => {
  function planTotal(seed: number, wave: number): number {
    const plan = planWave(seed, wave);
    return plan.okada + plan.areaboy + plan.carrier + plan.rushBonusOkada;
  }

  it('wave-8 plan totals 19 and fits the enemy pool', () => {
    const plan = planWave(42, 8);
    const total =
      plan.okada + plan.areaboy + plan.carrier + plan.rushBonusOkada;
    expect(total).toBe(19);
    expect(total).toBeLessThanOrEqual(ENEMY_CAPACITY);
  });

  it('every seed x wave in scope fits the enemy pool', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (let wave = 1; wave <= 12; wave += 1) {
        expect(planTotal(seed, wave)).toBeLessThanOrEqual(ENEMY_CAPACITY);
      }
    }
  });
});

describe('early-wave shooter caps', () => {
  it('wave 2 fields at most 1 AreaBoy and no Carriers', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = planWave(seed, 2);
      expect(plan.areaboy).toBeLessThanOrEqual(1);
      expect(plan.carrier).toBe(0);
      const spent =
        plan.okada * OKADA_COST +
        plan.areaboy * AREABOY_COST +
        plan.carrier * CARRIER_COST;
      expect(spent).toBeLessThanOrEqual(plan.budget);
    }
  });

  it('wave 3 fields at most 1 AreaBoy and at most 1 Carrier', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = planWave(seed, 3);
      expect(plan.areaboy).toBeLessThanOrEqual(1);
      expect(plan.carrier).toBeLessThanOrEqual(1);
      const spent =
        plan.okada * OKADA_COST +
        plan.areaboy * AREABOY_COST +
        plan.carrier * CARRIER_COST;
      expect(spent).toBeLessThanOrEqual(plan.budget);
    }
  });

  it('caps worst-case volley orbs to 3 on wave 2 and 8 on wave 3', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const wave2 = planWave(seed, 2);
      expect(wave2.areaboy * BURST_SIZE + wave2.carrier * SPREAD_COUNT)
        .toBeLessThanOrEqual(3);
      const wave3 = planWave(seed, 3);
      expect(wave3.areaboy * BURST_SIZE + wave3.carrier * SPREAD_COUNT)
        .toBeLessThanOrEqual(8);
    }
  });

  it('capped plans stay seed-stable', () => {
    expect(planWave(42, 2)).toEqual(planWave(42, 2));
    expect(JSON.stringify(planWave(42, 2))).toBe(
      JSON.stringify(planWave(42, 2)),
    );
    expect(planWave(42, 3)).toEqual(planWave(42, 3));
  });

  it('waves 4+ stay uncapped', () => {
    let uncapped = false;
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = planWave(seed, 5);
      if (plan.areaboy > 1 || plan.carrier > 1) {
        uncapped = true;
        break;
      }
    }
    expect(uncapped).toBe(true);
  });
});

describe('blackout curve', () => {
  it('is full-bright at wave 1 and near-dark at wave 10', () => {
    expect(lightIntensityForWave(1)).toBe(1);
    expect(emissiveScaleForWave(1)).toBe(1);
    expect(lightIntensityForWave(10)).toBeLessThan(0.35);
    expect(lightIntensityForWave(10)).toBeCloseTo(0.28, 5);
    expect(emissiveScaleForWave(10)).toBeCloseTo(0.35, 5);
  });

  it('dims monotonically through wave 10 then holds', () => {
    let previous = lightIntensityForWave(1);
    for (let wave = 2; wave <= 10; wave += 1) {
      const current = lightIntensityForWave(wave);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
    expect(lightIntensityForWave(11)).toBe(lightIntensityForWave(10));
    expect(blackoutForWave(10)).toEqual({
      wave: 10,
      lightIntensity: lightIntensityForWave(10),
      emissiveScale: emissiveScaleForWave(10),
    });
  });

  it('applyBlackout scales bases idempotently', () => {
    const lights = {
      hemi: { intensity: 0.7 },
      sun: { intensity: 1.6 },
      ambient: { intensity: 0.5 },
      pylonEmissive: { emissiveIntensity: 0.7 },
    };
    const first = applyBlackout(lights, 10);
    const afterFirst = {
      hemi: lights.hemi.intensity,
      sun: lights.sun.intensity,
      ambient: lights.ambient.intensity,
      pylon: lights.pylonEmissive.emissiveIntensity,
    };
    expect(afterFirst.hemi).toBeCloseTo(0.7 * first.lightIntensity, 10);
    expect(afterFirst.sun).toBeCloseTo(1.6 * first.lightIntensity, 10);
    expect(afterFirst.pylon).toBeCloseTo(
      0.7 * first.emissiveScale,
      10,
    );
    const second = applyBlackout(lights, 10);
    expect(second).toEqual(first);
    expect(lights.hemi.intensity).toBe(afterFirst.hemi);
    expect(lights.sun.intensity).toBe(afterFirst.sun);
    expect(lights.ambient.intensity).toBe(afterFirst.ambient);
    expect(lights.pylonEmissive.emissiveIntensity).toBe(afterFirst.pylon);
  });

  it('applyBlackout restores full-bright at wave 1', () => {
    const lights = {
      hemi: { intensity: 0.7 },
      sun: { intensity: 1.6 },
      ambient: { intensity: 0.5 },
      pylonEmissive: { emissiveIntensity: 0.7 },
    };
    applyBlackout(lights, 10);
    applyBlackout(lights, 1);
    expect(lights.hemi.intensity).toBeCloseTo(0.7, 10);
    expect(lights.sun.intensity).toBeCloseTo(1.6, 10);
    expect(lights.pylonEmissive.emissiveIntensity).toBeCloseTo(0.7, 10);
  });

  it('dims the city emissive idempotently and restores it at wave 1', () => {
    const lights = {
      pylonEmissive: { emissiveIntensity: 1.4 },
      cityEmissive: { emissiveIntensity: 1.4 },
    };
    const first = applyBlackout(lights, 10);
    expect(lights.cityEmissive.emissiveIntensity).toBeCloseTo(
      1.4 * first.emissiveScale,
      10,
    );
    expect(lights.pylonEmissive.emissiveIntensity).toBeCloseTo(
      1.4 * first.emissiveScale,
      10,
    );
    const second = applyBlackout(lights, 10);
    expect(second).toEqual(first);
    expect(lights.cityEmissive.emissiveIntensity).toBeCloseTo(
      1.4 * first.emissiveScale,
      10,
    );
    applyBlackout(lights, 1);
    expect(lights.cityEmissive.emissiveIntensity).toBeCloseTo(1.4, 10);
  });
});

describe('wave agreement', () => {
  it('normalizeWave and normalizeBlackoutWave agree on waves 1..12', () => {
    for (let wave = 1; wave <= 12; wave += 1) {
      expect(normalizeBlackoutWave(wave)).toBe(normalizeWave(wave));
    }
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(normalizeWave(bad)).toBe(1);
      expect(normalizeBlackoutWave(bad)).toBe(1);
    }
  });
});
