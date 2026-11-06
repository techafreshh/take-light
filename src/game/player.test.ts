import { describe, expect, it } from 'vitest';
import { STEP_MS } from './loop';
import {
  ARENA_HALF,
  DASH_COOLDOWN_MS,
  DASH_IFRAMES_MS,
  MAX_SHIELDS,
  MAX_TILT_RAD,
  createPlayer,
  createPlayerMesh,
  resetPlayer,
  syncPlayerMesh,
  takeHit,
  toPlayerSnapshot,
  tryDash,
  updatePlayer,
} from './player';

const FORWARD = { moveX: 0, moveY: -1, aimX: 0, aimY: 0, firing: false, dash: false };
const IDLE = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, firing: false, dash: false };

function stepTimes(
  player: Parameters<typeof updatePlayer>[0],
  steps: number,
): void {
  for (let i = 0; i < steps; i += 1) {
    updatePlayer(player, IDLE, STEP_MS);
  }
}

describe('forward drive', () => {
  it('travels 5-60 units holding forward for 1000 ms', () => {
    const player = createPlayer();
    const steps = Math.round(1000 / STEP_MS);
    for (let i = 0; i < steps; i += 1) {
      updatePlayer(player, FORWARD, STEP_MS);
    }
    const distance = Math.hypot(player.pos.x, player.pos.z);
    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(60);
  });

  it('spawns at the arena center with full shields', () => {
    const player = createPlayer();
    expect(player.pos.x).toBe(0);
    expect(player.pos.z).toBe(0);
    expect(player.shields).toBe(MAX_SHIELDS);
    const snapshot = toPlayerSnapshot(player);
    expect(snapshot.invulnerable).toBe(false);
    expect(snapshot.dashCooldownMs).toBe(0);
  });

  it('resets to origin with full shields and zero timers', () => {
    const player = createPlayer();
    updatePlayer(player, FORWARD, STEP_MS);
    tryDash(player, 0, -1);
    resetPlayer(player);
    expect(player.pos.x).toBe(0);
    expect(player.pos.z).toBe(0);
    expect(player.shields).toBe(MAX_SHIELDS);
    expect(player.iframeMsLeft).toBe(0);
    expect(player.dashCooldownMsLeft).toBe(0);
  });
});

describe('dash i-frames', () => {
  it('is invulnerable with cooldown armed 100 ms after dash', () => {
    const player = createPlayer();
    expect(tryDash(player, 0, -1)).toBe(true);
    stepTimes(player, Math.round(100 / STEP_MS));
    const snapshot = toPlayerSnapshot(player);
    expect(snapshot.invulnerable).toBe(true);
    expect(snapshot.dashCooldownMs).toBeGreaterThan(0);
  });

  it('loses invulnerability 500 ms after dash', () => {
    const player = createPlayer();
    expect(tryDash(player, 0, -1)).toBe(true);
    stepTimes(player, Math.round(500 / STEP_MS));
    const snapshot = toPlayerSnapshot(player);
    expect(snapshot.invulnerable).toBe(false);
  });

  it('iframe window matches the 0.3 s contract', () => {
    const player = createPlayer();
    tryDash(player, 0, -1);
    expect(player.iframeMsLeft).toBe(DASH_IFRAMES_MS);
    expect(player.dashCooldownMsLeft).toBe(DASH_COOLDOWN_MS);
  });

  it('ignores a second dash while cooling down', () => {
    const player = createPlayer();
    expect(tryDash(player, 0, -1)).toBe(true);
    const velX = player.vel.x;
    const velZ = player.vel.z;
    expect(tryDash(player, 0, 1)).toBe(false);
    expect(player.vel.x).toBe(velX);
    expect(player.vel.z).toBe(velZ);
    expect(player.dashCooldownMsLeft).toBe(DASH_COOLDOWN_MS);
  });

  it('dashes along the idle heading when no direction is given', () => {
    const player = createPlayer();
    expect(tryDash(player, 0, 0)).toBe(true);
    expect(player.vel.z).toBeLessThan(0);
  });
});

describe('bounds clamp', () => {
  it.each([
    { x: ARENA_HALF - 0.1, z: 0, vx: 10, vz: 0 },
    { x: -(ARENA_HALF - 0.1), z: 0, vx: -10, vz: 0 },
    { x: 0, z: ARENA_HALF - 0.1, vx: 0, vz: 10 },
    { x: 0, z: -(ARENA_HALF - 0.1), vx: 0, vz: -10 },
  ])('holds wall %j with inward velocity killed', (wall) => {
    const player = createPlayer();
    player.pos.set(wall.x, player.pos.y, wall.z);
    player.vel.set(wall.vx, 0, wall.vz);
    updatePlayer(player, IDLE, STEP_MS);
    expect(Math.abs(player.pos.x)).toBeLessThanOrEqual(ARENA_HALF);
    expect(Math.abs(player.pos.z)).toBeLessThanOrEqual(ARENA_HALF);
    if (wall.vx > 0 || wall.vx < 0) {
      expect(player.vel.x).toBe(0);
    }
    if (wall.vz > 0 || wall.vz < 0) {
      expect(player.vel.z).toBe(0);
    }
  });
});

describe('shields', () => {
  it('three hits exhaust the shield pips', () => {
    const player = createPlayer();
    expect(takeHit(player)).toBe(true);
    expect(takeHit(player)).toBe(true);
    expect(takeHit(player)).toBe(true);
    expect(player.shields).toBe(0);
    expect(takeHit(player)).toBe(false);
  });

  it('hits during i-frames deal no damage', () => {
    const player = createPlayer();
    tryDash(player, 0, -1);
    expect(takeHit(player)).toBe(false);
    expect(player.shields).toBe(MAX_SHIELDS);
  });
});

describe('mesh tilt', () => {
  it('is level at rest and bounded at full speed', () => {
    const player = createPlayer();
    const mesh = createPlayerMesh();
    syncPlayerMesh(mesh, player);
    expect(mesh.rotation.x).toBeCloseTo(0, 10);
    expect(mesh.rotation.z).toBeCloseTo(0, 10);
    expect(mesh.position.x).toBe(player.pos.x);
    expect(mesh.position.z).toBe(player.pos.z);

    player.vel.set(14, 0, 14);
    syncPlayerMesh(mesh, player);
    expect(Math.abs(mesh.rotation.x)).toBeLessThanOrEqual(MAX_TILT_RAD);
    expect(Math.abs(mesh.rotation.z)).toBeLessThanOrEqual(MAX_TILT_RAD);
    expect(Math.abs(mesh.rotation.x)).toBeGreaterThan(0);
    expect(Math.abs(mesh.rotation.z)).toBeGreaterThan(0);

    // Over-speed (dash burst) never exceeds the visual cap.
    player.vel.set(26, 0, 0);
    syncPlayerMesh(mesh, player);
    expect(Math.abs(mesh.rotation.x)).toBeLessThanOrEqual(MAX_TILT_RAD);
    expect(Math.abs(mesh.rotation.z)).toBeLessThanOrEqual(MAX_TILT_RAD);
  });
});
