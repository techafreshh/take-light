// Danfo Carrier heavy: slow chaser firing a 5-orb slow spread and
// dropping a shield-restore pickup on death. Rides the shared FSM base
// with diveSpeed 0, so the dive leg becomes a firing window that holds
// position while the fan leaves the muzzle.

import * as THREE from 'three';
import type { EnemyParams } from '../enemy';

/** Railgun hits to kill: exactly 6 at 1 damage each. */
export const CARRIER_MAX_HP = 6;
/** Score bounty paid on the killing blow. */
export const CARRIER_SCORE = 250;
/** Telegraph window: provable >=400 ms margin over frame quantization. */
export const CARRIER_TELEGRAPH_MS = 450;
/** Resting emissive for body and charge line. */
export const CARRIER_BASE_GLOW = 0.55;
/** Charge emissive during telegraph; the >1.0 probe threshold. */
export const CARRIER_TELEGRAPH_GLOW = 2.5;
/** Orbs per volley: exactly 5 in a wide fan. */
export const SPREAD_COUNT = 5;

export const CARRIER_PARAMS: EnemyParams = {
  chaseSpeed: 1.6,
  diveSpeed: 0,
  triggerRadius: 12,
  chaseTimeoutMs: 900,
  telegraphMs: CARRIER_TELEGRAPH_MS,
  diveMs: 500,
  recoverMs: 5000,
  hitRadius: 1.6,
  maxHp: CARRIER_MAX_HP,
  baseGlow: CARRIER_BASE_GLOW,
  telegraphGlow: CARRIER_TELEGRAPH_GLOW,
  strafeSpeed: 0.8,
  preferRange: 7,
};

/**
 * Heavy box body (larger than the rusher) plus a wide charge bar on
 * top. Both materials are stashed in group.userData so the FSM sync
 * writes emissive intensity with no per-frame lookup or allocation.
 */
export function createCarrierMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x3a2430,
    emissive: 0xff2d78,
    emissiveIntensity: CARRIER_BASE_GLOW,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.9), bodyMat);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a0a,
    emissive: 0xffb300,
    emissiveIntensity: CARRIER_BASE_GLOW,
  });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 2.0), lineMat);
  line.position.y = 0.6;
  group.add(body, line);
  group.userData.bodyMat = bodyMat;
  group.userData.lineMat = lineMat;
  group.userData.kindTag = 'carrier';
  group.visible = false;
  return group;
}
