// Blackout-exempt telegraph markers: one pooled InstancedMesh ring drawn
// flat under every telegraphing enemy. The material is unlit
// MeshBasicMaterial (bullets.ts tracer / props.ts lane-marking precedent),
// so applyBlackout never touches it and the marker survives the wave-10
// light x0.28 / emissive x0.35 curve. Shape (ring vs. tracer streak) reads
// in a frozen screenshot; the ~6 Hz scale pulse reads live. Zero
// allocation after construction: preallocated capacity, module-scope
// temps, zero-scale matrix hides dead slots.

import * as THREE from 'three';
import { ENEMY_CAPACITY, type EnemyManager } from './enemy';

/** Ring inner radius in world units (flat on the ground plane). */
export const TELEGRAPH_RING_INNER = 0.9;
/** Ring outer radius in world units (flat on the ground plane). */
export const TELEGRAPH_RING_OUTER = 1.35;
/** Scale-pulse frequency in Hz; shape reads frozen, pulse reads live. */
export const TELEGRAPH_PULSE_HZ = 6;
/** Pulse depth around the base scale of 1. */
export const TELEGRAPH_PULSE_DEPTH = 0.25;
/** Ground-plane height; above lane dashes (0.03), below hover bodies. */
export const TELEGRAPH_RING_Y = 0.06;

export interface TelegraphField {
  capacity: number;
  mesh: THREE.InstancedMesh;
}

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Pure pulse scale for a telegraph age: base 1 plus a sine term at
 * TELEGRAPH_PULSE_HZ. Deterministic and allocation-free.
 */
export function telegraphPulse(stateMs: number): number {
  if (!Number.isFinite(stateMs)) {
    return 1;
  }
  const t = Math.max(0, stateMs) / 1000;
  return 1 + TELEGRAPH_PULSE_DEPTH * Math.sin(t * Math.PI * 2 * TELEGRAPH_PULSE_HZ);
}

function makeRingMesh(capacity: number): THREE.InstancedMesh {
  const geometry = new THREE.RingGeometry(
    TELEGRAPH_RING_INNER,
    TELEGRAPH_RING_OUTER,
    40,
  );
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xff5a1a).multiplyScalar(2),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let i = 0; i < capacity; i += 1) {
    mesh.setMatrixAt(i, zeroMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = false;
  return mesh;
}

/**
 * Preallocate the full marker field. Optional scene attaches the mesh;
 * headless tests construct without one.
 */
export function createTelegraphField(
  scene?: THREE.Scene,
  capacity: number = ENEMY_CAPACITY,
): TelegraphField {
  const field: TelegraphField = {
    capacity,
    mesh: makeRingMesh(capacity),
  };
  if (scene !== undefined) {
    scene.add(field.mesh);
  }
  return field;
}

/** Hide every marker slot. */
export function clearTelegraphMarkers(field: TelegraphField): void {
  for (let i = 0; i < field.capacity; i += 1) {
    field.mesh.setMatrixAt(i, zeroMatrix);
  }
  field.mesh.instanceMatrix.needsUpdate = true;
  field.mesh.visible = false;
}

/**
 * Mirror the telegraphing enemies into the ring mesh: slot i tracks
 * live[i] while it telegraphs, pulsing with its stateMs; every other
 * slot collapses to zero scale. Reuses module temps only.
 */
export function syncTelegraphMarkers(
  field: TelegraphField,
  manager: EnemyManager,
): void {
  let any = false;
  for (let i = 0; i < field.capacity; i += 1) {
    const enemy = manager.live[i];
    if (
      enemy !== undefined &&
      enemy.active &&
      enemy.state === 'telegraph'
    ) {
      const pulse = telegraphPulse(enemy.stateMs);
      tmpPos.set(enemy.x, TELEGRAPH_RING_Y, enemy.z);
      tmpQuat.identity();
      tmpScale.set(pulse, 1, pulse);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      field.mesh.setMatrixAt(i, tmpMatrix);
      any = true;
    } else {
      field.mesh.setMatrixAt(i, zeroMatrix);
    }
  }
  field.mesh.instanceMatrix.needsUpdate = true;
  field.mesh.visible = any;
}
