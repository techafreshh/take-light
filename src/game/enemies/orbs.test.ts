import { describe, expect, it } from 'vitest';
import {
  CARRIER_FAN_RAD,
  AREABOY_CONE_RAD,
  ORB_CAPACITY,
  ORB_SPEED,
  ORB_TTL_MS,
  clearOrbs,
  createOrbField,
  fireAreaboyBurst,
  fireCarrierSpread,
  fireOrb,
  orbHitsPlayer,
  updateOrbs,
} from './orbs';

describe('orb pool caps', () => {
  it('never grows past capacity and recycles the oldest slot', () => {
    const field = createOrbField(undefined, 4);
    expect(field.pool.size).toBe(4);
    for (let i = 0; i < 6; i += 1) {
      fireOrb(field, i, 0, 0, -1);
    }
    expect(field.pool.size).toBe(4);
    expect(field.pool.activeCount).toBeLessThanOrEqual(4);
    expect(field.live.length).toBeLessThanOrEqual(4);
  });

  it('defaults to the 32-slot capacity', () => {
    const field = createOrbField();
    expect(field.pool.size).toBe(ORB_CAPACITY);
    expect(ORB_CAPACITY).toBe(32);
  });

  it('clearOrbs returns every slot to the pool', () => {
    const field = createOrbField();
    fireAreaboyBurst(field, 0, 0, 0, -1);
    fireCarrierSpread(field, 5, 0, 0, -1);
    expect(field.live.length).toBe(8);
    clearOrbs(field);
    expect(field.live.length).toBe(0);
    expect(field.pool.activeCount).toBe(0);
  });
});

describe('orb velocity', () => {
  it('flies at exactly 6 units/s', () => {
    const field = createOrbField();
    const orb = fireOrb(field, 0, 0, 0, -1);
    expect(Math.hypot(orb.vx, orb.vz)).toBeCloseTo(6, 10);
    expect(ORB_SPEED).toBe(6);
  });

  it('integrates position on the fixed quantum', () => {
    const field = createOrbField();
    const orb = fireOrb(field, 0, 0, 1, 0);
    updateOrbs(field, 1000);
    expect(orb.x).toBeCloseTo(6, 9);
    expect(orb.z).toBeCloseTo(0, 9);
  });

  it('areaboy cone stays tight and carrier fan spreads wide', () => {
    expect(AREABOY_CONE_RAD).toBeCloseTo(0.08, 10);
    expect(CARRIER_FAN_RAD).toBeCloseTo(0.35, 10);
    const tight = createOrbField();
    fireAreaboyBurst(tight, 0, 0, 0, -1);
    const tightAngles = tight.live.map((orb) =>
      Math.atan2(orb.vx, -orb.vz),
    );
    const tightSpan = Math.max(...tightAngles) - Math.min(...tightAngles);
    const wide = createOrbField();
    fireCarrierSpread(wide, 0, 0, 0, -1);
    const wideAngles = wide.live.map((orb) => Math.atan2(orb.vx, -orb.vz));
    const wideSpan = Math.max(...wideAngles) - Math.min(...wideAngles);
    expect(tightSpan).toBeGreaterThan(0);
    expect(wideSpan).toBeGreaterThan(tightSpan);
    expect(wideSpan).toBeCloseTo(CARRIER_FAN_RAD * 2, 9);
  });
});

describe('orb ttl', () => {
  it('retires orbs once the ttl expires', () => {
    const field = createOrbField();
    fireOrb(field, 0, 0, 0, -1);
    expect(field.live.length).toBe(1);
    expect(ORB_TTL_MS).toBe(6000);
    updateOrbs(field, ORB_TTL_MS + 16);
    expect(field.live.length).toBe(0);
    expect(field.pool.activeCount).toBe(0);
  });

  it('keeps orbs alive before expiry', () => {
    const field = createOrbField();
    fireOrb(field, 0, 0, 0, -1);
    updateOrbs(field, ORB_TTL_MS - 1000);
    expect(field.live.length).toBe(1);
  });
});

describe('orb hit check', () => {
  it('hits inside the disc and misses outside', () => {
    expect(orbHitsPlayer(0, 0, 0, 0)).toBe(true);
    expect(orbHitsPlayer(0.5, 0, 0, 0)).toBe(true);
    expect(orbHitsPlayer(5, 0, 0, 0)).toBe(false);
  });
});
