import { describe, expect, it } from 'vitest';
import { planWave } from './director';
import { blackoutT, lightIntensityForWave } from './blackout';
import { OKADA_TELEGRAPH_MS } from './enemies/okada';
import { AREABOY_TELEGRAPH_MS } from './enemies/areaboy';
import { CARRIER_TELEGRAPH_MS } from './enemies/carrier';

describe('run length shape', () => {
  it('waves 1..10 elapse 180000..300000 ms (~3-5 minutes)', () => {
    let total = 0;
    for (let wave = 1; wave <= 10; wave += 1) {
      total += planWave(42, wave).durationMs;
    }
    expect(total).toBeGreaterThanOrEqual(180000);
    expect(total).toBeLessThanOrEqual(300000);
  });

  it('wave-10 is near-dark with a monotonic blackout curve', () => {
    expect(lightIntensityForWave(10)).toBeLessThan(0.35);
    for (let wave = 1; wave < 10; wave += 1) {
      expect(blackoutT(wave + 1)).toBeGreaterThanOrEqual(blackoutT(wave));
      expect(lightIntensityForWave(wave + 1)).toBeLessThanOrEqual(
        lightIntensityForWave(wave),
      );
    }
  });

  it('all telegraphs stay visible+audible for >= 400 ms', () => {
    expect(OKADA_TELEGRAPH_MS).toBeGreaterThanOrEqual(400);
    expect(AREABOY_TELEGRAPH_MS).toBeGreaterThanOrEqual(400);
    expect(CARRIER_TELEGRAPH_MS).toBeGreaterThanOrEqual(400);
  });
});
