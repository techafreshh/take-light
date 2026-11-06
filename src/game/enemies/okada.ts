// Okada fast rusher: the first concrete enemy on the shared FSM base.
// A dark box body with a bright rev line on top; telegraph runs hot at
// 2.5 emissive, everything else rests at 0.55. Dies to 2 railgun hits.

import * as THREE from 'three';
import type { EnemyParams } from '../enemy';

/** Railgun hits to kill: exactly 2 at 1 damage each. */
export const OKADA_MAX_HP = 2;
/** Score bounty paid on the killing blow. */
export const OKADA_SCORE = 100;
/** Telegraph window: provable >=400 ms margin over frame quantization. */
export const OKADA_TELEGRAPH_MS = 450;
/** Resting emissive for body and rev line. */
export const OKADA_BASE_GLOW = 0.55;
/** Rev-line emissive during telegraph; the >1.0 probe threshold. */
export const OKADA_TELEGRAPH_GLOW = 2.5;

export const OKADA_PARAMS: EnemyParams = {
  chaseSpeed: 6,
  diveSpeed: 18,
  triggerRadius: 10,
  chaseTimeoutMs: 900,
  telegraphMs: OKADA_TELEGRAPH_MS,
  diveMs: 500,
  recoverMs: 600,
  hitRadius: 1.1,
  maxHp: OKADA_MAX_HP,
  baseGlow: OKADA_BASE_GLOW,
  telegraphGlow: OKADA_TELEGRAPH_GLOW,
};

/**
 * Box body plus a thin bright rev line on top. Both materials are
 * stashed in group.userData so the FSM sync writes emissive intensity
 * with no per-frame lookup or allocation.
 */
export function createOkadaMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x232838,
    emissive: 0xff6a00,
    emissiveIntensity: OKADA_BASE_GLOW,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.3), bodyMat);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    emissive: 0xff2d00,
    emissiveIntensity: OKADA_BASE_GLOW,
  });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 1.5), lineMat);
  line.position.y = 0.44;
  group.add(body, line);
  group.userData.bodyMat = bodyMat;
  group.userData.lineMat = lineMat;
  group.userData.kindTag = 'okada';
  group.visible = false;
  return group;
}
