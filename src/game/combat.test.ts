import { describe, expect, it } from 'vitest';
import { bulletHitsEnemy, damageEnemy, flatDistSq, tryHitEnemy } from './combat';
import { OKADA_PARAMS } from './enemies/okada';
import { createEnemyManager, spawnEnemy } from './enemy';

const RADIUS = OKADA_PARAMS.hitRadius;

describe('flat-plane hit geometry', () => {
  it('hits inside the 1.1 disc', () => {
    expect(bulletHitsEnemy(0, 0, 0, 0, RADIUS)).toBe(true);
    expect(bulletHitsEnemy(1.0, 0, 0, 0, RADIUS)).toBe(true);
    expect(bulletHitsEnemy(0.7, 0.7, 0, 0, RADIUS)).toBe(true);
  });

  it('misses outside the disc', () => {
    expect(bulletHitsEnemy(1.2, 0, 0, 0, RADIUS)).toBe(false);
    expect(bulletHitsEnemy(0, 5, 0, 0, RADIUS)).toBe(false);
  });

  it('counts the exact boundary as a hit', () => {
    expect(bulletHitsEnemy(3 + RADIUS, -2, 3, -2, RADIUS)).toBe(true);
    expect(flatDistSq(0, 0, 3, 4)).toBe(25);
  });

  it('is pure XZ: no Y enters the check', () => {
    // The hit signature takes only x/z pairs, so tracers and enemies
    // meet on the flat plane regardless of mesh height.
    const hit: (bx: number, bz: number, ex: number, ez: number) => boolean =
      (bx, bz, ex, ez) => bulletHitsEnemy(bx, bz, ex, ez, RADIUS);
    expect(hit(2, 2, 2, 2)).toBe(true);
    expect(hit(2, 4, 2, 2)).toBe(false);
  });
});

describe('damage and lookup helpers', () => {
  it('damageEnemy drops hp and kills at zero', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 0, 0);
    expect(damageEnemy(enemy, 1)).toBe(false);
    expect(enemy.hp).toBe(OKADA_PARAMS.maxHp - 1);
    expect(damageEnemy(enemy, 1)).toBe(true);
    expect(enemy.hp).toBe(0);
  });

  it('tryHitEnemy returns the first alive enemy in radius', () => {
    const manager = createEnemyManager();
    const first = spawnEnemy(manager, 'okada', OKADA_PARAMS, 0, 0);
    const second = spawnEnemy(manager, 'okada', OKADA_PARAMS, 0.5, 0);
    expect(tryHitEnemy(manager.live, 0, 0, RADIUS)).toBe(first);
    expect(tryHitEnemy(manager.live, 9, 9, RADIUS)).toBeNull();
    void second;
  });

  it('tryHitEnemy skips dead slots', () => {
    const manager = createEnemyManager();
    const corpse = spawnEnemy(manager, 'okada', OKADA_PARAMS, 0, 0);
    expect(damageEnemy(corpse, OKADA_PARAMS.maxHp)).toBe(true);
    const runner = spawnEnemy(manager, 'okada', OKADA_PARAMS, 0.5, 0);
    expect(tryHitEnemy(manager.live, 0, 0, RADIUS)).toBe(runner);
  });
});
