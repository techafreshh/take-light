// Pooled slow enemy orbs: ObjectPool-backed slots with a shared sphere
// geometry and per-slot emissive materials. Volleys fire instantaneously
// at dive-enter (Area Boy 3-orb tight cone, Carrier 5-orb fan); the sim
// steps them on the fixed STEP_MS quantum with TTL swap-remove.

import * as THREE from 'three';
import { HOVER_Y } from '../player';
import { ObjectPool } from '../pool';

/** Slow orb speed: 6 units/s, readable next to the 40 u/s railgun. */
export const ORB_SPEED = 6;
/** Orbs retire this long after firing. */
export const ORB_TTL_MS = 6000;
/** Pool cap: simultaneous volleys stay well inside. */
export const ORB_CAPACITY = 32;
/** Area Boy cone half-spread around the locked bearing. */
export const AREABOY_CONE_RAD = 0.08;
/** Carrier fan half-spread around the locked bearing. */
export const CARRIER_FAN_RAD = 0.35;
/** Flat-plane hit disc for orb-vs-player checks. */
export const ORB_HIT_RADIUS = 0.6;

export interface Orb {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  ttlMs: number;
  mesh: THREE.Mesh | null;
  mat: THREE.MeshStandardMaterial | null;
}

export interface OrbField {
  pool: ObjectPool<Orb>;
  live: Orb[];
  scene?: THREE.Scene;
}

let sharedOrbGeometry: THREE.SphereGeometry | null = null;

function orbGeometry(): THREE.SphereGeometry {
  if (sharedOrbGeometry === null) {
    sharedOrbGeometry = new THREE.SphereGeometry(0.22, 10, 8);
  }
  return sharedOrbGeometry;
}

function makeOrbSlot(): Orb {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a0a2a,
    emissive: 0xff2d78,
    emissiveIntensity: 1.6,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(orbGeometry(), mat);
  mesh.visible = false;
  return { active: false, x: 0, z: 0, vx: 0, vz: 0, ttlMs: 0, mesh, mat };
}

/** Rotate an XZ bearing by the given radians (Y-rotation). */
function rotateBearing(x: number, z: number, rad: number): {
  x: number;
  z: number;
} {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/**
 * Preallocate the full orb field. The optional scene attaches slot
 * meshes for the game; headless tests skip it.
 */
export function createOrbField(
  scene?: THREE.Scene,
  capacity: number = ORB_CAPACITY,
): OrbField {
  const pool = new ObjectPool<Orb>(() => makeOrbSlot(), capacity);
  const field: OrbField = { pool, live: [], scene };
  if (scene !== undefined) {
    // Attach lazily on fire so headless pools stay scene-free; slots
    // created here have meshes but no parent until first use.
    void field;
  }
  return field;
}

function attachIfNeeded(field: OrbField, orb: Orb): void {
  if (field.scene === undefined || orb.mesh === null) {
    return;
  }
  if (orb.mesh.parent !== field.scene) {
    field.scene.add(orb.mesh);
  }
}

/**
 * Spawn one orb at (x, z) along (dirX, dirZ) at ORB_SPEED. Recycles the
 * oldest live orb when exhausted; the pool never grows. Returns the slot.
 */
export function fireOrb(
  field: OrbField,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
): Orb {
  let dx = dirX;
  let dz = dirZ;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-6)) {
    dx = 0;
    dz = -1;
  } else {
    dx /= length;
    dz /= length;
  }
  const orb = field.pool.acquire();
  orb.active = true;
  orb.x = x;
  orb.z = z;
  orb.vx = dx * ORB_SPEED;
  orb.vz = dz * ORB_SPEED;
  orb.ttlMs = ORB_TTL_MS;
  attachIfNeeded(field, orb);
  if (orb.mesh !== null) {
    orb.mesh.visible = true;
    orb.mesh.position.set(orb.x, HOVER_Y, orb.z);
  }
  if (!field.live.includes(orb)) {
    field.live.push(orb);
  }
  return orb;
}

/** Area Boy volley: 3 rounds in a +/-0.08 rad cone around the bearing. */
export function fireAreaboyBurst(
  field: OrbField,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
): number {
  const offsets = [-AREABOY_CONE_RAD, 0, AREABOY_CONE_RAD];
  for (const offset of offsets) {
    const rotated = rotateBearing(dirX, dirZ, offset);
    fireOrb(field, x, z, rotated.x, rotated.z);
  }
  return offsets.length;
}

/** Carrier volley: 5 rounds in a +/-0.35 rad fan around the bearing. */
export function fireCarrierSpread(
  field: OrbField,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
): number {
  const offsets = [
    -CARRIER_FAN_RAD,
    -CARRIER_FAN_RAD / 2,
    0,
    CARRIER_FAN_RAD / 2,
    CARRIER_FAN_RAD,
  ];
  for (const offset of offsets) {
    const rotated = rotateBearing(dirX, dirZ, offset);
    fireOrb(field, x, z, rotated.x, rotated.z);
  }
  return offsets.length;
}

function releaseOrbAt(field: OrbField, index: number): void {
  const orb = field.live[index];
  if (orb === undefined) {
    return;
  }
  field.live.splice(index, 1);
  orb.active = false;
  orb.ttlMs = 0;
  if (orb.mesh !== null) {
    orb.mesh.visible = false;
  }
  field.pool.release(orb);
}

function releaseOrb(field: OrbField, orb: Orb): void {
  releaseOrbAt(field, field.live.indexOf(orb));
}

/**
 * Fixed-step integrate with in-place retire; expired orbs release.
 * Reverse-index loop with order-preserving splice (the updateBullets
 * idiom, minus swap-remove so survivor order never changes); no copy.
 */
export function updateOrbs(field: OrbField, dtMs: number): void {
  const step = Math.max(dtMs, 0);
  const dt = step / 1000;
  for (let i = field.live.length - 1; i >= 0; i -= 1) {
    const orb = field.live[i];
    if (orb === undefined || !orb.active) {
      continue;
    }
    orb.ttlMs -= step;
    if (orb.ttlMs <= 0) {
      releaseOrbAt(field, i);
      continue;
    }
    orb.x += orb.vx * dt;
    orb.z += orb.vz * dt;
  }
}

/** Push live orbs into their preallocated meshes; zero allocation. */
export function syncOrbMeshes(field: OrbField): void {
  for (const orb of field.live) {
    if (orb.mesh === null) {
      continue;
    }
    if (!orb.active) {
      orb.mesh.visible = false;
      continue;
    }
    orb.mesh.visible = true;
    orb.mesh.position.set(orb.x, HOVER_Y, orb.z);
  }
}

/** Between runs: every slot back to the pool, meshes hidden. */
export function clearOrbs(field: OrbField): void {
  const live = field.live.slice();
  for (const orb of live) {
    releaseOrb(field, orb);
  }
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
