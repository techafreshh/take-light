import { describe, expect, it, vi } from 'vitest';
import { STEP_MS } from './loop';
import { createBulletField } from './bullets';
import { EMPTY_INPUT } from './input';
import { HOVER_Y, createPlayer } from './player';
import {
  FIRE_INTERVAL_MS,
  MAGNET_CONE_RAD,
  MUZZLE_VISIBLE_MS,
  SPREAD_HALF_RAD,
  applyAimMagnetism,
  createWeapon,
  isMuzzleVisible,
  muzzleOpacity,
  recoilStrength,
  resetWeapon,
  resolveAimDir,
  updateWeapon,
} from './weapon';

const FIRING = { ...EMPTY_INPUT, firing: true };
const IDLE = { ...EMPTY_INPUT, firing: false };

describe('fire rate', () => {
  it('fires immediately on first trigger', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    updateWeapon(weapon, field, FIRING, player, STEP_MS, [], vi.fn());
    expect(field.alive).toBe(1);
    expect(isMuzzleVisible(weapon)).toBe(true);
  });

  it('rate-limits to 8/s over 1000 ms of fixed steps', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    const steps = Math.round(1000 / STEP_MS);
    const shots: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      const before = field.alive;
      void before;
      updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
      shots.push(field.alive);
    }
    // TTL (1200 ms) outlives the window, so alive equals shots fired.
    expect(field.alive).toBe(8);
  });

  it('holds fire spacing at the 125 ms interval', () => {
    expect(FIRE_INTERVAL_MS).toBe(125);
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    // First shot immediate; the next must wait out the cooldown.
    updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
    expect(field.alive).toBe(1);
    updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
    expect(field.alive).toBe(1);
  });

  it('does not fire when idle', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    for (let i = 0; i < 60; i += 1) {
      updateWeapon(weapon, field, IDLE, player, STEP_MS, []);
    }
    expect(field.alive).toBe(0);
    expect(isMuzzleVisible(weapon)).toBe(false);
  });

  it('invokes the onFire audio hook per shot', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    const onFire = vi.fn();
    const steps = Math.round(1000 / STEP_MS);
    for (let i = 0; i < steps; i += 1) {
      updateWeapon(weapon, field, FIRING, player, STEP_MS, [], onFire);
    }
    expect(onFire).toHaveBeenCalledTimes(8);
  });
});

describe('aim fallback', () => {
  it('fires along the player heading when aim is in the dead zone', () => {
    const player = createPlayer();
    player.headingX = 1;
    player.headingZ = 0;
    const dir = resolveAimDir(IDLE, player);
    expect(dir.x).toBeCloseTo(1, 10);
    expect(dir.z).toBeCloseTo(0, 10);
  });

  it('maps screen aimY down-positive to world +Z', () => {
    const player = createPlayer();
    const dir = resolveAimDir({ ...EMPTY_INPUT, aimX: 0, aimY: 1 }, player);
    expect(dir.x).toBeCloseTo(0, 10);
    expect(dir.z).toBeCloseTo(1, 10);
  });

  it('defaults to world -Z when heading is degenerate', () => {
    const player = createPlayer();
    player.headingX = 0;
    player.headingZ = 0;
    const dir = resolveAimDir(IDLE, player);
    expect(dir.x).toBeCloseTo(0, 10);
    expect(dir.z).toBeCloseTo(-1, 10);
  });
});

describe('spread', () => {
  it('stays within +/-0.06 rad across 200 shots', () => {
    const player = createPlayer();
    for (let i = 0; i < 200; i += 1) {
      const field = createBulletField();
      const weapon = createWeapon();
      const input = { ...EMPTY_INPUT, firing: true, aimX: 0, aimY: -1 };
      updateWeapon(weapon, field, input, player, STEP_MS, []);
      expect(field.alive).toBe(1);
      const speed = Math.hypot(field.vx[0], field.vz[0]);
      expect(speed).toBeGreaterThan(0);
      const base = { x: 0, z: -1 };
      const dot = Math.min(
        1,
        Math.max(-1, (field.vx[0] * base.x + field.vz[0] * base.z) / speed),
      );
      const angle = Math.acos(dot);
      expect(angle).toBeLessThanOrEqual(SPREAD_HALF_RAD + 1e-9);
    }
  });
});

describe('magnetism', () => {
  const origin = { x: 0, z: 0 };

  it('is identity for desktop shots', () => {
    const out = applyAimMagnetism(0, -1, origin, [{ x: 2, z: -10 }], false);
    expect(out.x).toBe(0);
    expect(out.z).toBe(-1);
  });

  it('is identity when the drone list is empty', () => {
    const out = applyAimMagnetism(0, -1, origin, [], true);
    expect(out.x).toBe(0);
    expect(out.z).toBe(-1);
  });

  it('bends touch shots toward a stub drone inside the cone', () => {
    // Drone slightly right of straight ahead: inside the 0.35 rad cone.
    const offAxis = Math.tan(0.2) * 10;
    const straight = applyAimMagnetism(0, -1, origin, [], true);
    const bent = applyAimMagnetism(
      0,
      -1,
      origin,
      [{ x: offAxis, z: -10 }],
      true,
    );
    expect(bent.x).toBeGreaterThan(straight.x);
    const dot = Math.min(
      1,
      Math.max(-1, bent.x * 0 + bent.z * -1),
    );
    expect(Math.acos(dot)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(Math.acos(dot)).toBeGreaterThan(0);
  });

  it('ignores drones outside the cone', () => {
    const out = applyAimMagnetism(
      0,
      -1,
      origin,
      [{ x: 10, z: 0 }],
      true,
    );
    expect(out.x).toBeCloseTo(0, 10);
    expect(out.z).toBeCloseTo(-1, 10);
  });

  it('cone constant matches the 0.35 rad contract', () => {
    expect(MAGNET_CONE_RAD).toBeCloseTo(0.35, 10);
  });
});

describe('muzzle and recoil', () => {
  it('muzzle visible holds to 120 ms while opacity fades by 60 ms', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
    expect(isMuzzleVisible(weapon)).toBe(true);
    expect(muzzleOpacity(weapon)).toBe(1);
    expect(MUZZLE_VISIBLE_MS).toBe(120);
    // Age the weapon without firing: opacity hits 0 at 60 ms.
    for (let i = 0; i < Math.round(60 / STEP_MS); i += 1) {
      updateWeapon(weapon, field, IDLE, player, STEP_MS, []);
    }
    expect(muzzleOpacity(weapon)).toBe(0);
    expect(isMuzzleVisible(weapon)).toBe(true);
    for (let i = 0; i < Math.round(60 / STEP_MS); i += 1) {
      updateWeapon(weapon, field, IDLE, player, STEP_MS, []);
    }
    expect(isMuzzleVisible(weapon)).toBe(false);
  });

  it('recoil decays to zero', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    expect(recoilStrength(weapon)).toBe(0);
    updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
    // Post-fire step keeps muzzle at 0 but recoil armed at full.
    expect(recoilStrength(weapon)).toBe(1);
    for (let i = 0; i < 20; i += 1) {
      updateWeapon(weapon, field, IDLE, player, STEP_MS, []);
    }
    expect(recoilStrength(weapon)).toBe(0);
  });

  it('reset restores a ready hidden weapon', () => {
    const field = createBulletField();
    const weapon = createWeapon();
    const player = createPlayer();
    updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
    resetWeapon(weapon);
    expect(weapon.cooldownMsLeft).toBe(0);
    expect(isMuzzleVisible(weapon)).toBe(false);
    expect(recoilStrength(weapon)).toBe(0);
  });

  it('stepping with STEP_MS is deterministic', () => {
    const run = (): number => {
      const field = createBulletField();
      const weapon = createWeapon();
      const player = createPlayer();
      for (let i = 0; i < 60; i += 1) {
        updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
      }
      return field.alive;
    };
    expect(run()).toBe(run());
  });

  it('hover height is unchanged by firing', () => {
    const player = createPlayer();
    const field = createBulletField();
    const weapon = createWeapon();
    updateWeapon(weapon, field, FIRING, player, STEP_MS, []);
    expect(player.pos.y).toBe(HOVER_Y);
  });
});
