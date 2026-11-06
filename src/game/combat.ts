// Flat-plane combat geometry: XZ hit checks, orb-vs-player discs, graze
// band, plus the shared damage/kill helper. Scoring math lives in
// score.ts. Y is always ignored: sim and bullets fly at HOVER_Y.

import type { Enemy } from './enemy';

/** Near-miss outer edge: graze band is (hitRadius, GRAZE_RADIUS]. */
export const GRAZE_RADIUS = 1.5;
/** Flat-plane hit disc for orb-vs-player checks (mirrors orb tuning). */
export const ORB_HIT_RADIUS = 0.6;

/** Squared flat-plane distance; the only geometry the sim uses. */
export function flatDistSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Strict XZ disc check; Y never enters. Boundary counts as a hit. */
export function bulletHitsEnemy(
  bulletX: number,
  bulletZ: number,
  enemyX: number,
  enemyZ: number,
  radius: number,
): boolean {
  const r = Math.max(radius, 0);
  return flatDistSq(bulletX, bulletZ, enemyX, enemyZ) <= r * r;
}

/**
 * Deal damage; hp floors at 0 and the killing blow parks the enemy in
 * 'dead' at base glow. Returns true only on the killing blow (already
 * dead enemies report false, so kills can never double-count).
 */
export function damageEnemy(enemy: Enemy, amount: number): boolean {
  if (!enemy.active || enemy.state === 'dead') {
    return false;
  }
  enemy.hp = Math.max(0, enemy.hp - Math.max(amount, 0));
  if (enemy.hp <= 0) {
    enemy.state = 'dead';
    enemy.stateMs = 0;
    enemy.telegraphMs = 0;
    enemy.glowIntensity = enemy.params.baseGlow;
    return true;
  }
  return false;
}

/** Strict XZ disc check for one orb against the player. */
export function orbHitsPlayer(
  orbX: number,
  orbZ: number,
  playerX: number,
  playerZ: number,
  radius: number = ORB_HIT_RADIUS,
): boolean {
  const r = Math.max(radius, 0);
  const dx = orbX - playerX;
  const dz = orbZ - playerZ;
  return dx * dx + dz * dz <= r * r;
}

/**
 * Near-miss check: true exactly when hitRadius < dist <= GRAZE_RADIUS.
 * True hits never count as grazes; beyond the outer edge is a clean miss.
 */
export function isGraze(
  orbX: number,
  orbZ: number,
  playerX: number,
  playerZ: number,
  hitRadius: number = ORB_HIT_RADIUS,
): boolean {
  const distSq = flatDistSq(orbX, orbZ, playerX, playerZ);
  const inner = Math.max(hitRadius, 0);
  return distSq > inner * inner && distSq <= GRAZE_RADIUS * GRAZE_RADIUS;
}

/** First alive enemy whose disc contains (x, z); dead slots are skipped. */
export function tryHitEnemy(
  enemies: readonly Enemy[],
  x: number,
  z: number,
  radius: number,
): Enemy | null {
  for (const enemy of enemies) {
    if (!enemy.active || enemy.state === 'dead') {
      continue;
    }
    if (bulletHitsEnemy(x, z, enemy.x, enemy.z, radius)) {
      return enemy;
    }
  }
  return null;
}
