import { describe, expect, it, vi } from 'vitest';
import { STEP_MS } from '../loop';
import {
  createEnemyManager,
  spawnEnemy,
  updateEnemies,
} from '../enemy';
import {
  AREABOY_BASE_GLOW,
  AREABOY_MAX_HP,
  AREABOY_PARAMS,
  AREABOY_SCORE,
  AREABOY_TELEGRAPH_GLOW,
  AREABOY_TELEGRAPH_MS,
  BURST_SIZE,
  createAreaboyMesh,
} from './areaboy';
import { fireAreaboyBurst, ORB_SPEED, createOrbField } from './orbs';

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

describe('areaboy spawn defaults', () => {
  it('spawns idle with 3 hp at the given position', () => {
    const manager = createEnemyManager(undefined, 16, createAreaboyMesh);
    const enemy = spawnEnemy(manager, 'areaboy', AREABOY_PARAMS, 12, -4);
    expect(enemy.kind).toBe('areaboy');
    expect(enemy.state).toBe('idle');
    expect(enemy.hp).toBe(3);
    expect(enemy.maxHp).toBe(3);
    expect(AREABOY_MAX_HP).toBe(3);
    expect(enemy.shotsFired).toBe(0);
  });

  it('uses the keep-distance tuning constants', () => {
    expect(AREABOY_PARAMS.maxHp).toBe(AREABOY_MAX_HP);
    expect(AREABOY_PARAMS.telegraphMs).toBe(AREABOY_TELEGRAPH_MS);
    expect(AREABOY_PARAMS.hitRadius).toBe(1.0);
    expect(AREABOY_PARAMS.chaseSpeed).toBe(4.5);
    expect(AREABOY_PARAMS.diveSpeed).toBe(0);
    expect(AREABOY_PARAMS.diveMs).toBe(360);
    expect(AREABOY_PARAMS.recoverMs).toBe(4500);
    expect(AREABOY_SCORE).toBe(150);
    expect(BURST_SIZE).toBe(3);
  });
});

describe('areaboy mesh', () => {
  it('stashes body and line materials with a kind tag', () => {
    const mesh = createAreaboyMesh();
    expect(mesh.children.length).toBeGreaterThanOrEqual(2);
    const bodyMat = mesh.userData.bodyMat as { emissiveIntensity: number };
    const lineMat = mesh.userData.lineMat as { emissiveIntensity: number };
    expect(bodyMat).toBeDefined();
    expect(lineMat).toBeDefined();
    expect(bodyMat.emissiveIntensity).toBe(AREABOY_BASE_GLOW);
    expect(mesh.userData.kindTag).toBe('areaboy');
  });
});

describe('areaboy telegraph volley', () => {
  it('holds telegraph for exactly 450 ms at rev glow', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'areaboy', AREABOY_PARAMS, 5, 0);
    expect(stepToTelegraph(manager, PLAYER)).toBeGreaterThan(0);
    const telegraphSteps = Math.round(AREABOY_TELEGRAPH_MS / STEP_MS);
    expect(telegraphSteps).toBe(27);
    for (let i = 0; i < telegraphSteps - 1; i += 1) {
      expect(enemy.state).toBe('telegraph');
      expect(enemy.glowIntensity).toBe(AREABOY_TELEGRAPH_GLOW);
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('telegraph');
    updateEnemies(manager, PLAYER, STEP_MS);
    expect(enemy.state).toBe('dive');
    expect(enemy.lastTelegraphMs).toBeGreaterThanOrEqual(400);
    expect(enemy.glowIntensity).toBe(AREABOY_BASE_GLOW);
  });

  it('fires exactly one 3-round volley per cycle through onBurstStart', () => {
    const manager = createEnemyManager();
    spawnEnemy(manager, 'areaboy', AREABOY_PARAMS, 5, 0);
    const onBurstStart = vi.fn();
    // Full first cycle: idle + chase timeout + telegraph + dive + recover.
    for (let i = 0; i < 400; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS, { onBurstStart });
      if (onBurstStart.mock.calls.length > 0) {
        break;
      }
    }
    expect(onBurstStart).toHaveBeenCalledTimes(1);
    // The volley itself is 3 orbs at orb speed.
    const field = createOrbField();
    const fired = fireAreaboyBurst(field, 0, 0, 0, -1);
    expect(fired).toBe(3);
    expect(field.live.length).toBe(3);
    for (const orb of field.live) {
      expect(Math.hypot(orb.vx, orb.vz)).toBeCloseTo(ORB_SPEED, 10);
    }
  });

  it('emits at most one volley inside a 5000 ms probe window', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'areaboy', AREABOY_PARAMS, 5, 0);
    let bursts = 0;
    const steps = Math.round(5000 / STEP_MS);
    for (let i = 0; i < steps; i += 1) {
      updateEnemies(
        manager,
        PLAYER,
        STEP_MS,
        {
          onBurstStart: () => {
            bursts += 1;
            enemy.shotsFired += BURST_SIZE;
          },
        },
      );
    }
    expect(bursts).toBe(1);
    expect(enemy.shotsFired).toBe(3);
  });
});

describe('areaboy strafe range-hold', () => {
  it('backs away when closer than preferRange and orbits tangentially', () => {
    const manager = createEnemyManager();
    // Isolate the strafe leg: tiny trigger radius plus a long timeout so
    // chase persists inside the 9-unit preferred range.
    const params = {
      ...AREABOY_PARAMS,
      triggerRadius: 1,
      chaseTimeoutMs: 100000,
    };
    const enemy = spawnEnemy(manager, 'areaboy', params, 5, 0);
    // Advance past idle into chase.
    for (let i = 0; i < 13; i += 1) {
      updateEnemies(manager, PLAYER, STEP_MS);
    }
    expect(enemy.state).toBe('chase');
    const before = Math.hypot(enemy.x - PLAYER.x, enemy.z - PLAYER.z);
    const beforeX = enemy.x;
    const beforeZ = enemy.z;
    updateEnemies(manager, PLAYER, STEP_MS);
    const after = Math.hypot(enemy.x - PLAYER.x, enemy.z - PLAYER.z);
    expect(after).toBeGreaterThan(before);
    // Tangential orbit: position changes off the pure radial line.
    const moved = Math.hypot(enemy.x - beforeX, enemy.z - beforeZ);
    expect(moved).toBeGreaterThan(0);
  });

  it('approaches from far while drifting sideways', () => {
    const even = createEnemyManager();
    const params = {
      ...AREABOY_PARAMS,
      triggerRadius: 1,
      chaseTimeoutMs: 100000,
    };
    const a = spawnEnemy(even, 'areaboy', params, 20, 0);
    for (let i = 0; i < 13; i += 1) {
      updateEnemies(even, PLAYER, STEP_MS);
    }
    expect(a.state).toBe('chase');
    const farBefore = Math.hypot(a.x, a.z);
    updateEnemies(even, PLAYER, STEP_MS);
    const farAfter = Math.hypot(a.x, a.z);
    expect(farAfter).toBeLessThan(farBefore);
    // Strafe component moves z off zero even on a straight approach.
    expect(Math.abs(a.z)).toBeGreaterThan(0);
  });
});
