import { describe, expect, it, vi } from 'vitest';
import { STEP_MS } from './loop';
import { damageEnemy } from './combat';
import {
  IDLE_MS,
  createEnemyManager,
  spawnEnemy,
  updateEnemies,
} from './enemy';
import {
  OKADA_BASE_GLOW,
  OKADA_PARAMS,
  OKADA_TELEGRAPH_GLOW,
  OKADA_TELEGRAPH_MS,
} from './enemies/okada';

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

describe('idle -> chase', () => {
  it('holds idle for 200 ms then chases', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 20, 0);
    expect(enemy.state).toBe('idle');
    const idleSteps = Math.round(IDLE_MS / STEP_MS);
    for (let i = 0; i < idleSteps - 1; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
      expect(enemy.state).toBe('idle');
    }
    updateEnemies(manager, PLAYER, STEP_MS);
    expect(enemy.state).toBe('chase');
  });

  it('walks 200 ms of idle on the fixed quantum', () => {
    expect(IDLE_MS).toBe(200);
  });
});

describe('chase -> telegraph', () => {
  it('telegraphs on proximity inside the trigger radius', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    const steps = stepToTelegraph(manager, PLAYER);
    expect(steps).toBeGreaterThan(0);
    // 12 idle steps + 1 chase step: proximity fires at once.
    expect(steps).toBeLessThanOrEqual(Math.round(IDLE_MS / STEP_MS) + 1);
    expect(enemy.targetX).toBeCloseTo(PLAYER.x, 10);
    expect(enemy.targetZ).toBeCloseTo(PLAYER.z, 10);
  });

  it('telegraphs on the 900 ms timeout even out of range', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 20, 0);
    const steps = stepToTelegraph(manager, PLAYER);
    expect(steps).toBeGreaterThan(0);
    // Chase started after idle; timeout fires at chaseMs ~= 900
    // (within the 1e-9 float guard of the accumulated STEP_MS sum).
    expect(enemy.chaseMs).toBeGreaterThanOrEqual(900 - 1e-6);
    const dist = Math.hypot(enemy.x - PLAYER.x, enemy.z - PLAYER.z);
    expect(dist).toBeGreaterThan(OKADA_PARAMS.triggerRadius);
  });

  it('fires the onTelegraph hook once per telegraph', () => {
    const manager = createEnemyManager();
    spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    const onTelegraph = vi.fn();
    for (let i = 0; i < 60; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS, { onTelegraph });
    }
    expect(onTelegraph).toHaveBeenCalledTimes(1);
  });
});

describe('telegraph -> dive -> recover -> chase', () => {
  it('holds telegraph for exactly 450 ms at rev glow', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    expect(stepToTelegraph(manager, PLAYER)).toBeGreaterThan(0);
    const telegraphSteps = Math.round(OKADA_TELEGRAPH_MS / STEP_MS);
    expect(telegraphSteps).toBe(27);
    for (let i = 0; i < telegraphSteps - 1; i += 1) {
      expect(enemy.state).toBe('telegraph');
      expect(enemy.glowIntensity).toBe(OKADA_TELEGRAPH_GLOW);
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('telegraph');
    updateEnemies(manager, PLAYER, STEP_MS);
    expect(enemy.state).toBe('dive');
    expect(enemy.lastTelegraphMs).toBeGreaterThanOrEqual(400);
    expect(enemy.glowIntensity).toBe(OKADA_BASE_GLOW);
  });

  it('rests at base glow outside telegraph', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 20, 0);
    for (let i = 0; i < 30; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
      if (enemy.state !== 'telegraph') {
        expect(enemy.glowIntensity).toBe(OKADA_BASE_GLOW);
      }
    }
  });

  it('rev glow exceeds the 1.0 probe threshold', () => {
    expect(OKADA_TELEGRAPH_GLOW).toBeGreaterThan(1.0);
    expect(OKADA_BASE_GLOW).toBeLessThan(1.0);
  });

  it('diver keeps course at the captured target after the player moves', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 8, 0);
    expect(stepToTelegraph(manager, PLAYER)).toBeGreaterThan(0);
    const capturedX = enemy.targetX;
    const capturedZ = enemy.targetZ;
    const moved = { x: -18, z: 14 };
    for (let i = 0; i < Math.round(OKADA_TELEGRAPH_MS / STEP_MS); i += 1) {
      updateEnemies(manager, moved, STEP_MS);
    }
    expect(enemy.state).toBe('dive');
    const startX = enemy.x;
    const startZ = enemy.z;
    for (let i = 0; i < 10; i += 1) {
      updateEnemies(manager, moved, STEP_MS);
    }
    const mx = enemy.x - startX;
    const mz = enemy.z - startZ;
    const wx = capturedX - startX;
    const wz = capturedZ - startZ;
    const dot =
      (mx * wx + mz * wz) /
      (Math.hypot(mx, mz) * Math.hypot(wx, wz));
    expect(dot).toBeGreaterThan(0.99);
  });

  it('recover returns to chase', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 8, 0);
    expect(stepToTelegraph(manager, PLAYER)).toBeGreaterThan(0);
    for (let i = 0; i < 60 && enemy.state !== 'dive'; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('dive');
    const diveSteps = Math.round(OKADA_PARAMS.diveMs / STEP_MS);
    for (let i = 0; i < diveSteps; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('recover');
    const recoverSteps = Math.round(OKADA_PARAMS.recoverMs / STEP_MS);
    for (let i = 0; i < recoverSteps; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('chase');
  });
});

describe('damage', () => {
  it('damageEnemy kills at 0 hp and parks the corpse', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    expect(damageEnemy(enemy, 1)).toBe(false);
    expect(enemy.hp).toBe(1);
    expect(enemy.state).not.toBe('dead');
    expect(damageEnemy(enemy, 1)).toBe(true);
    expect(enemy.hp).toBe(0);
    expect(enemy.state).toBe('dead');
  });

  it('never double-counts the killing blow', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    expect(damageEnemy(enemy, 2)).toBe(true);
    expect(damageEnemy(enemy, 1)).toBe(false);
  });
});
