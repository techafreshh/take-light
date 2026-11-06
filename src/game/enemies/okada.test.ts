import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../loop';
import { damageEnemy } from '../combat';
import {
  createEnemyManager,
  spawnEnemy,
  syncEnemyMeshes,
  updateEnemies,
} from '../enemy';
import {
  OKADA_BASE_GLOW,
  OKADA_MAX_HP,
  OKADA_PARAMS,
  OKADA_SCORE,
  OKADA_TELEGRAPH_GLOW,
  OKADA_TELEGRAPH_MS,
  createOkadaMesh,
} from './okada';

describe('okada spawn defaults', () => {
  it('spawns idle with 2 hp at the given position', () => {
    const manager = createEnemyManager(undefined, 16, createOkadaMesh);
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 12, -4);
    expect(enemy.kind).toBe('okada');
    expect(enemy.state).toBe('idle');
    expect(enemy.hp).toBe(2);
    expect(enemy.maxHp).toBe(2);
    expect(OKADA_MAX_HP).toBe(2);
    expect(enemy.x).toBe(12);
    expect(enemy.z).toBe(-4);
  });

  it('uses the shared tuning constants', () => {
    expect(OKADA_PARAMS.maxHp).toBe(OKADA_MAX_HP);
    expect(OKADA_PARAMS.telegraphMs).toBe(OKADA_TELEGRAPH_MS);
    expect(OKADA_PARAMS.hitRadius).toBe(1.1);
    expect(OKADA_PARAMS.chaseSpeed).toBe(6);
    expect(OKADA_PARAMS.diveSpeed).toBe(18);
    expect(OKADA_PARAMS.diveMs).toBe(500);
    expect(OKADA_PARAMS.recoverMs).toBe(600);
  });
});

describe('okada mesh', () => {
  it('contains a box body plus the bright rev line', () => {
    const mesh = createOkadaMesh();
    expect(mesh.children.length).toBeGreaterThanOrEqual(2);
    const bodyMat = mesh.userData.bodyMat as { emissiveIntensity: number };
    const lineMat = mesh.userData.lineMat as { emissiveIntensity: number };
    expect(bodyMat).toBeDefined();
    expect(lineMat).toBeDefined();
    expect(bodyMat.emissiveIntensity).toBe(OKADA_BASE_GLOW);
    expect(OKADA_TELEGRAPH_GLOW).toBe(2.5);
  });

  it('rev line glows past 1.0 once telegraphing', () => {
    const manager = createEnemyManager(undefined, 16, createOkadaMesh);
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    const player = { x: 0, z: 0 };
    for (let i = 0; i < 400 && enemy.state !== 'telegraph'; i += 1) {
      updateEnemies(manager, player, STEP_MS);
    }
    expect(enemy.state).toBe('telegraph');
    syncEnemyMeshes(manager);
    expect(enemy.lineMat?.emissiveIntensity).toBe(OKADA_TELEGRAPH_GLOW);
    expect(enemy.bodyMat?.emissiveIntensity).toBe(OKADA_TELEGRAPH_GLOW);
    expect(enemy.lineMat?.emissiveIntensity ?? 0).toBeGreaterThan(1.0);
  });
});

describe('okada kill', () => {
  it('two railgun hits kill and the bounty is 100', () => {
    const manager = createEnemyManager(undefined, 16, createOkadaMesh);
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    expect(damageEnemy(enemy, 1)).toBe(false);
    expect(damageEnemy(enemy, 1)).toBe(true);
    expect(enemy.state).toBe('dead');
    expect(OKADA_SCORE).toBe(100);
  });

  it('one hit leaves it alive', () => {
    const manager = createEnemyManager(undefined, 16, createOkadaMesh);
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    expect(damageEnemy(enemy, 1)).toBe(false);
    expect(enemy.state).not.toBe('dead');
  });
});
