import { describe, expect, it, vi } from 'vitest';
import { STEP_MS } from '../loop';
import { OKADA_PARAMS } from './okada';
import {
  createEnemyManager,
  spawnEnemy,
  updateEnemies,
} from '../enemy';
import {
  CARRIER_BASE_GLOW,
  CARRIER_MAX_HP,
  CARRIER_PARAMS,
  CARRIER_SCORE,
  CARRIER_TELEGRAPH_GLOW,
  CARRIER_TELEGRAPH_MS,
  SPREAD_COUNT,
  createCarrierMesh,
} from './carrier';
import { createOrbField, fireCarrierSpread, ORB_SPEED } from './orbs';

const PLAYER = { x: 0, z: 0 };

function stepToTelegraph(
  manager: ReturnType<typeof createEnemyManager>,
  player: { x: number; z: number },
  maxSteps = 400,
): number {
  for (let i = 0; i < maxSteps; i += 1) {
    updateEnemies(manager, player, STEP_MS);
    if (manager.live[0]?.state === 'telegraph') {
      return i + 1;
    }
  }
  return -1;
}

describe('carrier spawn defaults', () => {
  it('spawns idle with 6 hp at the given position', () => {
    const manager = createEnemyManager(undefined, 16, createCarrierMesh);
    const enemy = spawnEnemy(manager, 'carrier', CARRIER_PARAMS, 12, -4);
    expect(enemy.kind).toBe('carrier');
    expect(enemy.state).toBe('idle');
    expect(enemy.hp).toBe(6);
    expect(enemy.maxHp).toBe(6);
    expect(CARRIER_MAX_HP).toBe(6);
    expect(enemy.shotsFired).toBe(0);
  });

  it('uses the slow heavy tuning constants', () => {
    expect(CARRIER_PARAMS.maxHp).toBe(CARRIER_MAX_HP);
    expect(CARRIER_PARAMS.telegraphMs).toBe(CARRIER_TELEGRAPH_MS);
    expect(CARRIER_PARAMS.hitRadius).toBe(1.6);
    expect(CARRIER_PARAMS.chaseSpeed).toBe(1.6);
    expect(CARRIER_PARAMS.diveSpeed).toBe(0);
    expect(CARRIER_PARAMS.diveMs).toBe(500);
    expect(CARRIER_PARAMS.recoverMs).toBe(5000);
    expect(CARRIER_SCORE).toBe(250);
    expect(SPREAD_COUNT).toBe(5);
  });
});

describe('carrier mesh', () => {
  it('stashes body and line materials with a kind tag', () => {
    const mesh = createCarrierMesh();
    expect(mesh.children.length).toBeGreaterThanOrEqual(2);
    const bodyMat = mesh.userData.bodyMat as { emissiveIntensity: number };
    const lineMat = mesh.userData.lineMat as { emissiveIntensity: number };
    expect(bodyMat).toBeDefined();
    expect(lineMat).toBeDefined();
    expect(bodyMat.emissiveIntensity).toBe(CARRIER_BASE_GLOW);
    expect(mesh.userData.kindTag).toBe('carrier');
  });
});

describe('carrier telegraph spread', () => {
  it('holds telegraph for exactly 450 ms at rev glow', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'carrier', CARRIER_PARAMS, 5, 0);
    expect(stepToTelegraph(manager, PLAYER)).toBeGreaterThan(0);
    const telegraphSteps = Math.round(CARRIER_TELEGRAPH_MS / STEP_MS);
    expect(telegraphSteps).toBe(27);
    for (let i = 0; i < telegraphSteps - 1; i += 1) {
      expect(enemy.state).toBe('telegraph');
      expect(enemy.glowIntensity).toBe(CARRIER_TELEGRAPH_GLOW);
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('telegraph');
    updateEnemies(manager, PLAYER, STEP_MS);
    expect(enemy.state).toBe('dive');
    expect(enemy.lastTelegraphMs).toBeGreaterThanOrEqual(400);
    expect(enemy.glowIntensity).toBe(CARRIER_BASE_GLOW);
  });

  it('fires exactly one 5-orb fan per cycle through onBurstStart', () => {
    const manager = createEnemyManager();
    spawnEnemy(manager, 'carrier', CARRIER_PARAMS, 5, 0);
    const onBurstStart = vi.fn();
    for (let i = 0; i < 400; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS, { onBurstStart });
      if (onBurstStart.mock.calls.length > 0) {
        break;
      }
    }
    expect(onBurstStart).toHaveBeenCalledTimes(1);
    const field = createOrbField();
    const fired = fireCarrierSpread(field, 0, 0, 0, -1);
    expect(fired).toBe(5);
    expect(field.live.length).toBe(5);
    for (const orb of field.live) {
      expect(Math.hypot(orb.vx, orb.vz)).toBeCloseTo(ORB_SPEED, 10);
    }
  });
});

describe('carrier slow chase', () => {
  it('chases slower than the okada rusher', () => {
    expect(CARRIER_PARAMS.chaseSpeed).toBeLessThan(OKADA_PARAMS.chaseSpeed);
    const manager = createEnemyManager();
    const params = {
      ...CARRIER_PARAMS,
      triggerRadius: 1,
      chaseTimeoutMs: 100000,
    };
    const enemy = spawnEnemy(manager, 'carrier', params, 20, 0);
    for (let i = 0; i < 13; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('chase');
    const before = Math.hypot(enemy.x, enemy.z);
    updateEnemies(manager, PLAYER, STEP_MS);
    const after = Math.hypot(enemy.x, enemy.z);
    const carrierTravel = before - after;
    // Radial progress per step is the chase speed (the tangential orbit
    // is perpendicular, so it holds distance to first order).
    expect(carrierTravel).toBeCloseTo(
      CARRIER_PARAMS.chaseSpeed * (STEP_MS / 1000),
      3,
    );
    expect(carrierTravel).toBeLessThan(OKADA_PARAMS.chaseSpeed * (STEP_MS / 1000));
  });
});
