// Minimal flat-plane combat stub: XZ hit checks plus the shared
// damage/kill helper. No orbs, no graze, no scoring math — those belong
// to a later issue. Y is always ignored: sim and bullets fly at HOVER_Y.

import type { Enemy } from './enemy';

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
