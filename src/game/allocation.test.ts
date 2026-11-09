// Fight-window allocation audit: 8+ live enemies with shooter volleys,
// orb/pickup churn, and danfo advance over 600 fixed steps. Pools stay
// fixed, live lists stay bounded, and SoA array refs never churn — the
// traffic.test.ts zero-allocation style.

import { describe, expect, it } from 'vitest';
import { STEP_MS } from './loop';
import {
  ENEMY_CAPACITY,
  createEnemyManager,
  spawnEnemy,
  updateEnemies,
  type EnemyHooks,
} from './enemy';
import { OKADA_PARAMS } from './enemies/okada';
import { AREABOY_PARAMS } from './enemies/areaboy';
import { CARRIER_PARAMS } from './enemies/carrier';
import {
  ORB_CAPACITY,
  createOrbField,
  fireAreaboyBurst,
  fireCarrierSpread,
  updateOrbs,
} from './enemies/orbs';
import {
  PICKUP_CAPACITY,
  createPickupField,
  spawnPickup,
  updatePickups,
} from './pickups';
import {
  DANFO_COUNT,
  DANFO_WRAP_Z,
  advanceDanfoTraffic,
  createDanfoTraffic,
  syncTrafficMeshes,
} from './props';

const PLAYER_POS = { x: 0, z: 0 };

/** Spawn a Wave-2-like swarm: okada rush plus areaboy/carrier shooters. */
function spawnSwarm(manager: ReturnType<typeof createEnemyManager>): void {
  spawnEnemy(manager, 'okada', OKADA_PARAMS, 10, -8);
  spawnEnemy(manager, 'okada', OKADA_PARAMS, -10, -8);
  spawnEnemy(manager, 'okada', OKADA_PARAMS, 10, 8);
  spawnEnemy(manager, 'okada', OKADA_PARAMS, -10, 8);
  spawnEnemy(manager, 'areaboy', AREABOY_PARAMS, 6, -12);
  spawnEnemy(manager, 'areaboy', AREABOY_PARAMS, -6, 12);
  spawnEnemy(manager, 'carrier', CARRIER_PARAMS, 0, -14);
  spawnEnemy(manager, 'carrier', CARRIER_PARAMS, 0, 14);
}

describe('fight-window allocation audit', () => {
  it('holds pools fixed, lists bounded, and refs stable over 600 steps', () => {
    const enemies = createEnemyManager();
    const orbs = createOrbField();
    const pickups = createPickupField();
    const traffic = createDanfoTraffic();
    spawnSwarm(enemies);
    expect(enemies.live.length).toBeGreaterThanOrEqual(8);

    // Volley churn up front plus per-telegraph bursts through the hooks,
    // mirroring the main.ts onBurstStart wiring.
    fireAreaboyBurst(orbs, 6, -12, 0, 1);
    fireCarrierSpread(orbs, 0, -14, 0, 1);
    spawnPickup(pickups, 1, 1);
    spawnPickup(pickups, -20, -20);
    spawnPickup(pickups, 20, 20);
    const hooks: EnemyHooks = {
      onBurstStart: (enemy) => {
        if (enemy.kind === 'areaboy') {
          fireAreaboyBurst(orbs, enemy.x, enemy.z, 0, 1);
        } else if (enemy.kind === 'carrier') {
          fireCarrierSpread(orbs, enemy.x, enemy.z, 0, 1);
        }
      },
    };

    const enemyLiveRef = enemies.live;
    const orbLiveRef = orbs.live;
    const pickupLiveRef = pickups.live;
    const trafficXRef = traffic.x;
    const trafficZRef = traffic.z;
    const trafficSpeedRef = traffic.speed;
    const matrixLength = traffic.mesh.instanceMatrix.array.length;

    const player = { shields: 3 };
    for (let i = 0; i < 600; i += 1) {
      updateEnemies(enemies, PLAYER_POS, STEP_MS, hooks);
      updateOrbs(orbs, STEP_MS);
      updatePickups(pickups, PLAYER_POS, player, STEP_MS);
      advanceDanfoTraffic(traffic, STEP_MS);
    }
    syncTrafficMeshes(traffic);

    // Pool sizes fixed: the pool never grows past its boot capacity.
    expect(enemies.pool.size).toBe(ENEMY_CAPACITY);
    expect(orbs.pool.size).toBe(ORB_CAPACITY);
    expect(pickups.pool.size).toBe(PICKUP_CAPACITY);
    expect(enemies.pool.activeCount + enemies.pool.freeCount).toBe(
      ENEMY_CAPACITY,
    );
    expect(orbs.pool.activeCount + orbs.pool.freeCount).toBe(ORB_CAPACITY);
    expect(pickups.pool.activeCount + pickups.pool.freeCount).toBe(
      PICKUP_CAPACITY,
    );

    // Live lists bounded by their caps after sustained volley churn.
    expect(enemies.live.length).toBeLessThanOrEqual(ENEMY_CAPACITY);
    expect(orbs.live.length).toBeLessThanOrEqual(ORB_CAPACITY);
    expect(pickups.live.length).toBeLessThanOrEqual(PICKUP_CAPACITY);

    // Array refs stable: no per-step list or buffer reallocation.
    expect(enemies.live).toBe(enemyLiveRef);
    expect(orbs.live).toBe(orbLiveRef);
    expect(pickups.live).toBe(pickupLiveRef);
    expect(traffic.x).toBe(trafficXRef);
    expect(traffic.z).toBe(trafficZRef);
    expect(traffic.speed).toBe(trafficSpeedRef);
    expect(traffic.mesh.instanceMatrix.array.length).toBe(matrixLength);
    expect(traffic.count).toBe(DANFO_COUNT);
    for (let i = 0; i < traffic.count; i += 1) {
      expect(Math.abs(traffic.z[i])).toBeLessThanOrEqual(DANFO_WRAP_Z);
    }
  });
});
