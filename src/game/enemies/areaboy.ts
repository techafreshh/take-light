// Area Boy keep-distance shooter: strafes at range, charges a >=0.4 s
// telegraph glow plus spin-up, then fires a 3-round tight-cone volley.
// Rides the shared FSM base with diveSpeed 0, so the dive leg becomes a
// firing window that holds position.

import * as THREE from 'three';
import type { EnemyParams } from '../enemy';

/** Railgun hits to kill: exactly 3 at 1 damage each. */
export const AREABOY_MAX_HP = 3;
/** Score bounty paid on the killing blow. */
export const AREABOY_SCORE = 150;
/** Telegraph window: provable >=400 ms margin over frame quantization. */
export const AREABOY_TELEGRAPH_MS = 450;
/** Resting emissive for body and charge line. */
export const AREABOY_BASE_GLOW = 0.55;
/** Charge emissive during telegraph; the >1.0 probe threshold. */
export const AREABOY_TELEGRAPH_GLOW = 2.5;
/** Orbs per volley: exactly 3 in a tight cone. */
export const BURST_SIZE = 3;

export const AREABOY_PARAMS: EnemyParams = {
  chaseSpeed: 4.5,
  diveSpeed: 0,
  triggerRadius: 14,
  chaseTimeoutMs: 900,
  telegraphMs: AREABOY_TELEGRAPH_MS,
  diveMs: 360,
  recoverMs: 4500,
  hitRadius: 1.0,
  maxHp: AREABOY_MAX_HP,
  baseGlow: AREABOY_BASE_GLOW,
  telegraphGlow: AREABOY_TELEGRAPH_GLOW,
  strafeSpeed: 2.5,
  preferRange: 9,
};

/**
 * Slim box body plus a thin bright charge line on top. Both materials
 * are stashed in group.userData so the FSM sync writes emissive
 * intensity with no per-frame lookup or allocation.
 */
export function createAreaboyMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a4a,
    emissive: 0x00e5ff,
    emissiveIntensity: AREABOY_BASE_GLOW,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.1), bodyMat);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a1a,
    emissive: 0x66f6ff,
    emissiveIntensity: AREABOY_BASE_GLOW,
  });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 1.3), lineMat);
  line.position.y = 0.38;
  group.add(body, line);
  group.userData.bodyMat = bodyMat;
  group.userData.lineMat = lineMat;
  group.userData.kindTag = 'areaboy';
  group.visible = false;
  return group;
}
