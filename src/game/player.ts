import * as THREE from 'three';
import type { InputFrame } from './input';
import { loadModelAsync } from './assets';

// Kinematic hover player: semi-implicit Euler (accel -> exponential drag ->
// speed clamp -> integrate) on the fixed STEP_MS quantum, hard arena clamp,
// dash burst with 0.3 s i-frames, and velocity-proportional mesh tilt.
// Pure sim: no DOM, no store access here.

// Tuning: ACCEL/DRAG gives terminal ~13.1 u/s and ~9.2 units in 1 s from
// rest, comfortably inside the (5, 60) acceptance band.
export const ACCEL = 42;
export const DRAG = 3.2;
export const MAX_SPEED = 14;
export const DASH_SPEED = 26;
export const DASH_IFRAMES_MS = 300;
export const DASH_COOLDOWN_MS = 1200;
/** Post-hit grace: one volley can cost at most one shield per second. */
export const HURT_IFRAMES_MS = 1000;
export const ARENA_HALF = 26;
export const HOVER_Y = 0.8;
export const MAX_SHIELDS = 3;
export const MAX_TILT_RAD = 0.35;

export interface Player {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Last nonzero input heading (unit-ish x/z), dash fallback when idle. */
  headingX: number;
  headingZ: number;
  iframeMsLeft: number;
  dashCooldownMsLeft: number;
  shields: number;
}

export interface PlayerSnapshot {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  invulnerable: boolean;
  dashCooldownMs: number;
  shields: number;
}

export function createPlayer(): Player {
  return {
    pos: new THREE.Vector3(0, HOVER_Y, 0),
    vel: new THREE.Vector3(0, 0, 0),
    headingX: 0,
    headingZ: -1,
    iframeMsLeft: 0,
    dashCooldownMsLeft: 0,
    shields: MAX_SHIELDS,
  };
}

export function resetPlayer(player: Player): void {
  player.pos.set(0, HOVER_Y, 0);
  player.vel.set(0, 0, 0);
  player.headingX = 0;
  player.headingZ = -1;
  player.iframeMsLeft = 0;
  player.dashCooldownMsLeft = 0;
  player.shields = MAX_SHIELDS;
}

/**
 * Dash burst along (dirX, dirZ). Ignored while the cooldown is armed.
 * Returns true when the dash fired.
 */
export function tryDash(player: Player, dirX: number, dirZ: number): boolean {
  if (player.dashCooldownMsLeft > 0) {
    return false;
  }
  let dx = dirX;
  let dz = dirZ;
  if (dx === 0 && dz === 0) {
    dx = player.headingX;
    dz = player.headingZ;
  }
  const length = Math.hypot(dx, dz);
  if (length <= 0) {
    dx = 0;
    dz = -1;
  } else {
    dx /= length;
    dz /= length;
  }
  player.headingX = dx;
  player.headingZ = dz;
  player.vel.set(dx * DASH_SPEED, 0, dz * DASH_SPEED);
  player.iframeMsLeft = DASH_IFRAMES_MS;
  player.dashCooldownMsLeft = DASH_COOLDOWN_MS;
  return true;
}

/**
 * Combat damage entry point (no callers yet; enemies land in a later issue).
 * Returns false when the hit was absorbed by i-frames or shields are spent.
 */
export function takeHit(player: Player): boolean {
  if (player.iframeMsLeft > 0) {
    return false;
  }
  if (player.shields <= 0) {
    return false;
  }
  player.shields -= 1;
  player.iframeMsLeft = HURT_IFRAMES_MS;
  return true;
}

export function updatePlayer(
  player: Player,
  input: InputFrame,
  dtMs: number,
): void {
  const dt = Math.max(dtMs, 0) / 1000;

  // Remember the last nonzero heading for idle dashes.
  // Screen space: moveY -1 is up-screen = forward (world -Z).
  if (input.moveX !== 0 || input.moveY !== 0) {
    const headingLength = Math.hypot(input.moveX, input.moveY);
    player.headingX = input.moveX / headingLength;
    player.headingZ = input.moveY / headingLength;
  }

  // Semi-implicit Euler: accelerate along the input vector
  // (screen space maps directly: moveY -1 drives world -Z).
  player.vel.x += input.moveX * ACCEL * dt;
  player.vel.z += input.moveY * ACCEL * dt;

  // ... exponential drag ...
  const dragFactor = Math.exp(-DRAG * dt);
  player.vel.x *= dragFactor;
  player.vel.z *= dragFactor;

  // ... speed clamp (relaxed to DASH_SPEED while dash i-frames are armed
  // so the burst travels its full distance; drag decays it back under
  // MAX_SPEED before the window expires, so the resume never snaps) ...
  const cap = player.iframeMsLeft > 0 ? DASH_SPEED : MAX_SPEED;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed > cap && speed > 0) {
    const scale = cap / speed;
    player.vel.x *= scale;
    player.vel.z *= scale;
  }

  // ... integrate ...
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y = HOVER_Y;

  // ... hard bounds clamp with inward-velocity zeroing (no wall stick).
  if (player.pos.x < -ARENA_HALF) {
    player.pos.x = -ARENA_HALF;
    if (player.vel.x < 0) {
      player.vel.x = 0;
    }
  } else if (player.pos.x > ARENA_HALF) {
    player.pos.x = ARENA_HALF;
    if (player.vel.x > 0) {
      player.vel.x = 0;
    }
  }
  if (player.pos.z < -ARENA_HALF) {
    player.pos.z = -ARENA_HALF;
    if (player.vel.z < 0) {
      player.vel.z = 0;
    }
  } else if (player.pos.z > ARENA_HALF) {
    player.pos.z = ARENA_HALF;
    if (player.vel.z > 0) {
      player.vel.z = 0;
    }
  }

  // ... countdown iframe + cooldown timers.
  if (player.iframeMsLeft > 0) {
    player.iframeMsLeft = Math.max(0, player.iframeMsLeft - dtMs);
  }
  if (player.dashCooldownMsLeft > 0) {
    player.dashCooldownMsLeft = Math.max(0, player.dashCooldownMsLeft - dtMs);
  }
}

/** Probe/store snapshot: integer-ms cooldown rounded up, derived i-frames. */
export function toPlayerSnapshot(player: Player): PlayerSnapshot {
  return {
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    vel: { x: player.vel.x, y: player.vel.y, z: player.vel.z },
    invulnerable: player.iframeMsLeft > 0,
    dashCooldownMs: Math.ceil(player.dashCooldownMsLeft),
    shields: player.shields,
  };
}

/**
 * Group holding the exact legacy capsule as a fallback child, with the
 * vendored player+jetpack GLB attached asynchronously on success. The
 * group origin sits at hover height (positioned by syncPlayerMesh), so
 * the loaded model is offset down by its ~0.45 model-space base.
 */
export function createPlayerMesh(): THREE.Group {
  const geometry = new THREE.CapsuleGeometry(0.5, 1.0, 4, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8f7bff,
    emissive: 0x00e5ff,
    emissiveIntensity: 0.55,
    flatShading: true,
  });
  const fallback = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(fallback);
  group.position.set(0, HOVER_Y, 0);
  // Fire-and-forget swap: failure keeps the fallback visible.
  void loadModelAsync('player-jetpack').then((loaded) => {
    if (loaded === null) {
      return;
    }
    loaded.position.set(0, -0.45, 0);
    group.add(loaded);
    fallback.visible = false;
  });
  return group;
}

/** Visual-only tilt: lean into velocity, clamped to +/-0.35 rad, level rest. */
export function syncPlayerMesh(mesh: THREE.Object3D, player: Player): void {
  mesh.position.copy(player.pos);
  const tiltPerSpeed = MAX_TILT_RAD / MAX_SPEED;
  const tiltX = THREE.MathUtils.clamp(
    player.vel.z * tiltPerSpeed,
    -MAX_TILT_RAD,
    MAX_TILT_RAD,
  );
  const tiltZ = THREE.MathUtils.clamp(
    -player.vel.x * tiltPerSpeed,
    -MAX_TILT_RAD,
    MAX_TILT_RAD,
  );
  mesh.rotation.set(tiltX, 0, tiltZ);
}
