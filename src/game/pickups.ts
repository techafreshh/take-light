// Pooled shield pickups: ObjectPool of max 8 slots with a shared
// octahedron geometry and per-slot emissive materials. Carrier deaths
// spawn one; collection grants +1 shield capped at MAX_SHIELDS on the
// flat plane. Pickups persist until collected or the run resets.

import * as THREE from 'three';
import { HOVER_Y, MAX_SHIELDS } from './player';
import { ObjectPool } from './pool';

/** Pool cap: one per carrier death, probes spawn at most a handful. */
export const PICKUP_CAPACITY = 8;
/** Flat-plane collect disc around the player. */
export const PICKUP_COLLECT_RADIUS = 1.4;

export type PickupKind = 'shield';

export interface Pickup {
  active: boolean;
  kind: PickupKind;
  x: number;
  z: number;
  bobMs: number;
  mesh: THREE.Mesh | null;
  mat: THREE.MeshStandardMaterial | null;
}

export interface PickupField {
  pool: ObjectPool<Pickup>;
  live: Pickup[];
  scene?: THREE.Scene;
}

export interface PickupSnapshot {
  kind: PickupKind;
  x: number;
  z: number;
}

let sharedPickupGeometry: THREE.OctahedronGeometry | null = null;

function pickupGeometry(): THREE.OctahedronGeometry {
  if (sharedPickupGeometry === null) {
    sharedPickupGeometry = new THREE.OctahedronGeometry(0.45);
  }
  return sharedPickupGeometry;
}

function makePickupSlot(): Pickup {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a2a1a,
    emissive: 0x00ff88,
    emissiveIntensity: 1.4,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(pickupGeometry(), mat);
  mesh.visible = false;
  return { active: false, kind: 'shield', x: 0, z: 0, bobMs: 0, mesh, mat };
}

/**
 * Preallocate the full pickup field. The optional scene attaches slot
 * meshes for the game; headless tests skip it.
 */
export function createPickupField(
  scene?: THREE.Scene,
  capacity: number = PICKUP_CAPACITY,
): PickupField {
  const pool = new ObjectPool<Pickup>(() => makePickupSlot(), capacity);
  return { pool, live: [], scene };
}

function attachIfNeeded(field: PickupField, pickup: Pickup): void {
  if (field.scene === undefined || pickup.mesh === null) {
    return;
  }
  if (pickup.mesh.parent !== field.scene) {
    field.scene.add(pickup.mesh);
  }
}

/**
 * Spawn one shield pickup at (x, z). Recycles the oldest live pickup
 * when exhausted; the pool never grows. Returns the slot.
 */
export function spawnPickup(
  field: PickupField,
  x: number,
  z: number,
  kind: PickupKind = 'shield',
): Pickup {
  const pickup = field.pool.acquire();
  pickup.active = true;
  pickup.kind = kind;
  pickup.x = x;
  pickup.z = z;
  pickup.bobMs = 0;
  attachIfNeeded(field, pickup);
  if (pickup.mesh !== null) {
    pickup.mesh.visible = true;
    pickup.mesh.position.set(pickup.x, HOVER_Y, pickup.z);
  }
  if (!field.live.includes(pickup)) {
    field.live.push(pickup);
  }
  return pickup;
}

function releasePickupAt(field: PickupField, index: number): void {
  const pickup = field.live[index];
  if (pickup === undefined) {
    return;
  }
  field.live.splice(index, 1);
  pickup.active = false;
  if (pickup.mesh !== null) {
    pickup.mesh.visible = false;
  }
  field.pool.release(pickup);
}

function releasePickup(field: PickupField, pickup: Pickup): void {
  releasePickupAt(field, field.live.indexOf(pickup));
}

/**
 * Fixed-step bob timer plus flat-plane collection: inside
 * PICKUP_COLLECT_RADIUS the player gains +1 shield capped at
 * MAX_SHIELDS and the pickup retires. Returns collected count.
 */
export function updatePickups(
  field: PickupField,
  playerPos: { x: number; z: number },
  player: { shields: number },
  dtMs: number,
): number {
  const step = Math.max(dtMs, 0);
  let collected = 0;
  for (let i = field.live.length - 1; i >= 0; i -= 1) {
    const pickup = field.live[i];
    if (pickup === undefined || !pickup.active) {
      continue;
    }
    pickup.bobMs += step;
    const dx = pickup.x - playerPos.x;
    const dz = pickup.z - playerPos.z;
    const inside =
      dx * dx + dz * dz <=
      PICKUP_COLLECT_RADIUS * PICKUP_COLLECT_RADIUS;
    if (inside) {
      if (player.shields < MAX_SHIELDS) {
        player.shields = Math.min(MAX_SHIELDS, player.shields + 1);
      }
      releasePickupAt(field, i);
      collected += 1;
    }
  }
  return collected;
}

/** Push live pickups into their meshes with a bob; zero allocation. */
export function syncPickupMeshes(field: PickupField): void {
  for (const pickup of field.live) {
    if (pickup.mesh === null) {
      continue;
    }
    if (!pickup.active) {
      pickup.mesh.visible = false;
      continue;
    }
    pickup.mesh.visible = true;
    const bob = Math.sin(pickup.bobMs / 300) * 0.15;
    pickup.mesh.position.set(pickup.x, HOVER_Y + bob, pickup.z);
    pickup.mesh.rotation.y += 0.03;
  }
}

/** Between runs: every slot back to the pool, meshes hidden. */
export function clearPickups(field: PickupField): void {
  const live = field.live.slice();
  for (const pickup of live) {
    releasePickup(field, pickup);
  }
}

/** Probe snapshot for the pickup mirror. */
export function toPickupProbe(field: PickupField): {
  active: number;
  list: PickupSnapshot[];
} {
  return {
    active: field.live.length,
    list: field.live.map((pickup) => ({
      kind: pickup.kind,
      x: pickup.x,
      z: pickup.z,
    })),
  };
}
