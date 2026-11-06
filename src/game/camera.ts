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
): void {
  camera.position.set(target.x, target.y + CAMERA_UP, target.z + CAMERA_BACK);
  camera.lookAt(target);
}
