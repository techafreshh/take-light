// Pooled railgun tracer field: fixed-capacity SoA store (parallel
// position/velocity/TTL arrays) rendered through a single additive
// InstancedMesh plus one reused muzzle-flash Sprite. Zero allocation
// after construction: fire/update/sync only touch preallocated arrays
// and module-scope temps.

import * as THREE from 'three';

// Tuning: 40 u/s * 1.2 s TTL = 48-unit range; 8 shots/s * 1.2 s ~= 10
// alive at steady state, well inside the poolSize <= 128 probe bound.
export const BULLET_SPEED = 40;
export const BULLET_TTL_MS = 1200;
export const BULLET_CAPACITY = 64;
/** Muzzle-flash sprite opacity fades to zero over this window. */
export const MUZZLE_FADE_MS = 60;

export interface BulletField {
  capacity: number;
  alive: number;
  nextSlot: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vz: Float32Array;
  ttlMs: Float32Array;
  mesh: THREE.InstancedMesh;
  muzzle: THREE.Sprite;
}

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

function makeTracerMesh(capacity: number): THREE.InstancedMesh {
  // Long axis along travel (Z): length reads as speed at 60 fps.
  const geometry = new THREE.BoxGeometry(0.12, 0.12, 1.4);
  const material = new THREE.MeshBasicMaterial({
    color: 0x66f6ff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
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

function makeMuzzleSprite(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    color: 0xaef6ff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.2, 1.2, 1);
  sprite.visible = false;
  return sprite;
}

/**
 * Preallocate the full tracer field. Optional scene attaches both
 * handles; headless tests construct without one.
 */
export function createBulletField(scene?: THREE.Scene): BulletField {
  const capacity = BULLET_CAPACITY;
  const field: BulletField = {
    capacity,
    alive: 0,
    nextSlot: 0,
    px: new Float32Array(capacity),
    py: new Float32Array(capacity),
    pz: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    ttlMs: new Float32Array(capacity),
    mesh: makeTracerMesh(capacity),
    muzzle: makeMuzzleSprite(),
  };
  if (scene !== undefined) {
    scene.add(field.mesh);
    scene.add(field.muzzle);
  }
  return field;
}

/** Drop every live tracer and hide the visuals. */
export function clearBullets(field: BulletField): void {
  field.alive = 0;
  field.nextSlot = 0;
  for (let i = 0; i < field.capacity; i += 1) {
    field.mesh.setMatrixAt(i, zeroMatrix);
  }
  field.mesh.instanceMatrix.needsUpdate = true;
  field.mesh.visible = false;
  field.muzzle.visible = false;
  const material = field.muzzle.material as THREE.SpriteMaterial;
  material.opacity = 0;
}

/**
 * Spawn one tracer at origin along dir (XZ normalized internally).
 * Round-robin reuses the oldest alive slot when full; never grows.
 * Returns false only when capacity is zero.
 */
export function fireBullet(
  field: BulletField,
  origin: { x: number; y: number; z: number },
  dir: { x: number; z: number },
): boolean {
  if (field.capacity <= 0) {
    return false;
  }
  let dx = dir.x;
  let dz = dir.z;
  let length = Math.hypot(dx, dz);
  if (!(length > 1e-6)) {
    dx = 0;
    dz = -1;
    length = 1;
  } else {
    dx /= length;
    dz /= length;
  }
  let slot: number;
  if (field.alive < field.capacity) {
    slot = field.alive;
    field.alive += 1;
    field.nextSlot = field.alive % field.capacity;
  } else {
    slot = field.nextSlot;
    field.nextSlot = (field.nextSlot + 1) % field.capacity;
  }
  field.px[slot] = origin.x;
  field.py[slot] = origin.y;
  field.pz[slot] = origin.z;
  field.vx[slot] = dx * BULLET_SPEED;
  field.vz[slot] = dz * BULLET_SPEED;
  field.ttlMs[slot] = BULLET_TTL_MS;
  return true;
}

/** Fixed-step integrate + TTL decay with swap-remove; no allocation. */
export function updateBullets(field: BulletField, dtMs: number): void {
  const dt = Math.max(dtMs, 0) / 1000;
  for (let i = field.alive - 1; i >= 0; i -= 1) {
    field.ttlMs[i] -= dtMs;
    if (field.ttlMs[i] <= 0) {
      const last = field.alive - 1;
      if (i !== last) {
        field.px[i] = field.px[last];
        field.py[i] = field.py[last];
        field.pz[i] = field.pz[last];
        field.vx[i] = field.vx[last];
        field.vz[i] = field.vz[last];
        field.ttlMs[i] = field.ttlMs[last];
      }
      field.alive -= 1;
    } else {
      field.px[i] += field.vx[i] * dt;
      field.pz[i] += field.vz[i] * dt;
    }
  }
}

/**
 * Push alive tracers into the InstancedMesh oriented along velocity;
 * dead slots collapse to zero scale. Reuses module temps only.
 */
export function syncBulletMeshes(field: BulletField): void {
  for (let i = 0; i < field.capacity; i += 1) {
    if (i < field.alive) {
      tmpPos.set(field.px[i], field.py[i], field.pz[i]);
      tmpDir.set(field.vx[i], 0, field.vz[i]);
      if (tmpDir.lengthSq() > 1e-12) {
        tmpDir.normalize();
        // Yaw the +Z tracer axis onto the velocity bearing.
        tmpQuat.setFromAxisAngle(
          tmpUp,
          Math.atan2(tmpDir.x, tmpDir.z),
        );
      } else {
        tmpQuat.identity();
      }
      tmpScale.set(1, 1, 1);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      field.mesh.setMatrixAt(i, tmpMatrix);
    } else {
      field.mesh.setMatrixAt(i, zeroMatrix);
    }
  }
  field.mesh.instanceMatrix.needsUpdate = true;
  field.mesh.visible = field.alive > 0;
}

/** Opacity for a muzzle age: 1 at fire, 0 once past the fade window. */
export function muzzleOpacityForAge(ageMs: number): number {
  if (ageMs < 0) {
    return 1;
  }
  if (ageMs >= MUZZLE_FADE_MS) {
    return 0;
  }
  return 1 - ageMs / MUZZLE_FADE_MS;
}
