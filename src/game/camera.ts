import * as THREE from 'three';

// Tilted follow camera: fixed offset above and behind the target whose
// pitch is exactly ~50 degrees by construction (atan2(UP, BACK)).

export const CAMERA_PITCH_DEG = 50;
export const CAMERA_UP = 14.3;
export const CAMERA_BACK = 12.0;

/** Pitch of an (up, back) follow offset in degrees. */
export function pitchDegForOffset(up: number, back: number): number {
  return (Math.atan2(up, back) * 180) / Math.PI;
}

/** Maximum trauma: shake offset magnitude caps at this, in world units. */
export const SHAKE_MAX_OFFSET = 0.3;

/** Trauma decay per millisecond back toward zero. */
export const SHAKE_DECAY_PER_MS = 1 / 400;

export interface ShakeState {
  trauma: number;
}

/** Fresh shake state with no trauma. */
export function createShake(): ShakeState {
  return { trauma: 0 };
}

/** Add trauma, clamped to [0, 1]. */
export function addShake(state: ShakeState, amount: number): void {
  state.trauma = Math.min(1, Math.max(0, state.trauma + amount));
}

/** Linear trauma decay over wall-clock milliseconds. */
export function updateShake(state: ShakeState, dtMs: number): void {
  if (dtMs <= 0) {
    return;
  }
  state.trauma = Math.max(0, state.trauma - SHAKE_DECAY_PER_MS * dtMs);
}

/**
 * Current shake offset in world units. Trauma scales the cap
 * quadratically so small kicks stay subtle; bounded to SHAKE_MAX_OFFSET.
 */
export function shakeOffset(state: ShakeState): { x: number; y: number } {
  const scaled = state.trauma * state.trauma * SHAKE_MAX_OFFSET;
  // Deterministic pseudo-random direction from trauma so probes and
  // unit tests see a stable, bounded value without Math.random.
  const angle = state.trauma * Math.PI * 2 * 7;
  return { x: Math.cos(angle) * scaled, y: Math.sin(angle) * scaled };
}

export function createFollowCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
  camera.position.set(0, CAMERA_UP, CAMERA_BACK);
  camera.lookAt(0, 0, 0);
  return camera;
}

/** Re-apply the fixed offset above the target and look at it. */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  shakeX = 0,
  shakeY = 0,
): void {
  camera.position.set(
    target.x + shakeX,
    target.y + CAMERA_UP + shakeY,
    target.z + CAMERA_BACK,
  );
  camera.lookAt(target);
}
