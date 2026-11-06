// Railgun autofire controller: rate accumulator, spread, fallback aim,
// touch-only magnetism, muzzle/recoil timers, and the onFire audio hook.
// Pure sim on the fixed STEP_MS quantum; DOM-free, no three.js import.

import { DEAD_ZONE, type InputFrame } from './input';
import type { Player } from './player';
import {
  BULLET_TTL_MS,
  MUZZLE_FADE_MS,
  fireBullet,
  updateBullets,
  type BulletField,
} from './bullets';

/** Exactly 8 shots/s; first trigger fires immediately. */
export const FIRE_INTERVAL_MS = 125;
/** Uniform spread half-angle around the aim bearing. */
export const SPREAD_HALF_RAD = 0.06;
/** Visible flag holds past the 60 ms opacity fade for probe polling. */
export const MUZZLE_VISIBLE_MS = 120;
/** Recoil kick decays to zero over this window. */
export const RECOIL_DURATION_MS = 150;
/** Camera pushed opposite fire by this distance at full strength. */
export const CAMERA_RECOIL_UNITS = 0.35;
/** Player mesh pushed opposite fire by this distance at full strength. */
export const MESH_RECOIL_UNITS = 0.12;
/** Magnetism cone half-angle for touch shots. */
export const MAGNET_CONE_RAD = 0.35;
/** Blend factor toward the cone target for touch shots. */
export const MAGNET_STRENGTH = 0.3;
/** Hard cap on the magnetism bend. */
export const MAGNET_MAX_BEND_RAD = 0.3;

export interface AimDir {
  x: number;
  z: number;
}

export interface WeaponState {
  cooldownMsLeft: number;
  muzzleAgeMs: number;
  recoilAgeMs: number;
  recoilDirX: number;
  recoilDirZ: number;
}

export interface DroneLike {
  x: number;
  z: number;
}

export type DroneTarget =
  | DroneLike
  | { pos: DroneLike | { x: number; z: number } };

export type FireHook = () => void;

const NOOP: FireHook = () => {};

/** Ready-to-fire with muzzle hidden and recoil decayed. */
export function createWeapon(): WeaponState {
  return {
    cooldownMsLeft: 0,
    muzzleAgeMs: MUZZLE_VISIBLE_MS,
    recoilAgeMs: RECOIL_DURATION_MS,
    recoilDirX: 0,
    recoilDirZ: -1,
  };
}

/** Reset between runs: same shape as a fresh weapon. */
export function resetWeapon(state: WeaponState): void {
  state.cooldownMsLeft = 0;
  state.muzzleAgeMs = MUZZLE_VISIBLE_MS;
  state.recoilAgeMs = RECOIL_DURATION_MS;
  state.recoilDirX = 0;
  state.recoilDirZ = -1;
}

/**
 * Screen aim to world XZ: aimY down-positive maps to +Z, matching the
 * updatePlayer convention (moveY -1 drives world -Z). Inside the dead
 * zone the shot falls back to the player heading (default world -Z).
 */
export function resolveAimDir(input: InputFrame, player: Player): AimDir {
  const length = Math.hypot(input.aimX, input.aimY);
  if (!(length >= DEAD_ZONE) || !Number.isFinite(length)) {
    let hx = player.headingX;
    let hz = player.headingZ;
    const headingLength = Math.hypot(hx, hz);
    if (!(headingLength > 1e-6)) {
      hx = 0;
      hz = -1;
    } else {
      hx /= headingLength;
      hz /= headingLength;
    }
    return { x: hx, z: hz };
  }
  return { x: input.aimX / length, z: input.aimY / length };
}

function droneXZ(drone: DroneTarget): { x: number; z: number } | null {
  if (drone === null || typeof drone !== 'object') {
    return null;
  }
  const withPos = drone as { pos?: unknown };
  const source =
    withPos.pos !== undefined && withPos.pos !== null &&
      typeof withPos.pos === 'object'
      ? (withPos.pos as { x?: unknown; z?: unknown })
      : (drone as { x?: unknown; z?: unknown });
  const x = (source as { x: unknown }).x;
  const z = (source as { z: unknown }).z;
  if (typeof x !== 'number' || typeof z !== 'number') {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return null;
  }
  return { x, z };
}

function originXZ(origin: { x: number; z: number }): {
  x: number;
  z: number;
} {
  return { x: origin.x, z: origin.z };
}

/**
 * Touch-only aim assist: desktop and empty lists are identity. Otherwise
 * bends toward the most-aligned drone inside the cone by MAGNET_STRENGTH
 * (a 30 % blend, always under the 0.3 rad cap for a 0.35 rad cone).
 */
export function applyAimMagnetism(
  dirX: number,
  dirZ: number,
  origin: { x: number; z: number },
  drones: readonly DroneTarget[],
  isMobile: boolean,
): AimDir {
  const dirLength = Math.hypot(dirX, dirZ);
  if (!isMobile || drones.length === 0 || !(dirLength > 1e-6)) {
    return { x: dirX, z: dirZ };
  }
  const nx = dirX / dirLength;
  const nz = dirZ / dirLength;
  const o = originXZ(origin);
  let bestX = 0;
  let bestZ = 0;
  let bestAngle = Number.POSITIVE_INFINITY;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const drone of drones) {
    const target = droneXZ(drone);
    if (target === null) {
      continue;
    }
    const dx = target.x - o.x;
    const dz = target.z - o.z;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 1e-6)) {
      continue;
    }
    const tx = dx / dist;
    const tz = dz / dist;
    const dot = Math.min(1, Math.max(-1, nx * tx + nz * tz));
    const angle = Math.acos(dot);
    if (angle <= MAGNET_CONE_RAD && angle < bestAngle - 1e-9) {
      bestAngle = angle;
      bestDist = dist;
      bestX = tx;
      bestZ = tz;
    } else if (
      angle <= MAGNET_CONE_RAD &&
      Math.abs(angle - bestAngle) < 1e-9 &&
      dist < bestDist
    ) {
      bestDist = dist;
      bestX = tx;
      bestZ = tz;
    }
  }
  if (!Number.isFinite(bestAngle)) {
    return { x: dirX, z: dirZ };
  }
  // Blend toward the cone target; for a <=0.35 rad cone at 0.3 strength
  // the bend stays under MAGNET_MAX_BEND_RAD by construction.
  const bx = nx * (1 - MAGNET_STRENGTH) + bestX * MAGNET_STRENGTH;
  const bz = nz * (1 - MAGNET_STRENGTH) + bestZ * MAGNET_STRENGTH;
  const blended = Math.hypot(bx, bz);
  if (!(blended > 1e-6)) {
    return { x: dirX, z: dirZ };
  }
  const dotAfter = Math.min(
    1,
    Math.max(-1, (nx * bx + nz * bz) / blended),
  );
  const bend = Math.acos(dotAfter);
  if (bend > MAGNET_MAX_BEND_RAD) {
    const t = MAGNET_MAX_BEND_RAD / bend;
    const cx = nx + (bx / blended - nx) * t;
    const cz = nz + (bz / blended - nz) * t;
    const cl = Math.hypot(cx, cz);
    return { x: cx / cl, z: cz / cl };
  }
  return { x: bx / blended, z: bz / blended };
}

function spreadDir(x: number, z: number, offsetRad: number): AimDir {
  const cos = Math.cos(offsetRad);
  const sin = Math.sin(offsetRad);
  // Y-rotation of the (x, z) bearing.
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/** Muzzle flash reads true for MUZZLE_VISIBLE_MS after each shot. */
export function isMuzzleVisible(state: WeaponState): boolean {
  return state.muzzleAgeMs < MUZZLE_VISIBLE_MS;
}

/** Sprite opacity from the muzzle age (fades over MUZZLE_FADE_MS). */
export function muzzleOpacity(state: WeaponState): number {
  if (state.muzzleAgeMs < 0) {
    return 1;
  }
  if (state.muzzleAgeMs >= MUZZLE_FADE_MS) {
    return 0;
  }
  return 1 - state.muzzleAgeMs / MUZZLE_FADE_MS;
}

/** 0 when decayed, 1 at the instant of fire. */
export function recoilStrength(state: WeaponState): number {
  if (state.recoilAgeMs >= RECOIL_DURATION_MS) {
    return 0;
  }
  if (state.recoilAgeMs <= 0) {
    return 1;
  }
  return 1 - state.recoilAgeMs / RECOIL_DURATION_MS;
}

export function bulletTtlMs(): number {
  return BULLET_TTL_MS;
}

function fireOriginFor(player: Player, dir: AimDir): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: player.pos.x + dir.x * 1.1,
    y: player.pos.y,
    z: player.pos.z + dir.z * 1.1,
  };
}

/**
 * Autofire controller on the fixed quantum: immediate first shot, then
 * FIRE_INTERVAL_MS gating; spread + touch magnetism per shot; muzzle and
 * recoil timers restart on fire; bullets always integrate. Zero
 * allocation in this path (no closures, no per-shot objects beyond the
 * two small aim structs, which callers may treat as stack values).
 */
export function updateWeapon(
  state: WeaponState,
  field: BulletField,
  input: InputFrame,
  player: Player,
  dtMs: number,
  drones: readonly DroneTarget[] = [],
  onFire: FireHook = NOOP,
  isMobile = false,
): void {
  const step = Math.max(dtMs, 0);
  if (state.cooldownMsLeft > 0) {
    state.cooldownMsLeft -= step;
  }
  if (input.firing && state.cooldownMsLeft <= 0) {
    const aim = resolveAimDir(input, player);
    const assisted = applyAimMagnetism(
      aim.x,
      aim.z,
      player.pos,
      drones,
      isMobile,
    );
    const offset = (Math.random() * 2 - 1) * SPREAD_HALF_RAD;
    const dir = spreadDir(assisted.x, assisted.z, offset);
    // Fire from the barrel tip; fireBullet normalizes the bearing.
    const origin = fireOriginFor(player, dir);
    fireBullet(field, origin, dir);
    state.cooldownMsLeft = FIRE_INTERVAL_MS;
    state.muzzleAgeMs = 0;
    state.recoilAgeMs = 0;
    state.recoilDirX = dir.x;
    state.recoilDirZ = dir.z;
    onFire();
  } else {
    state.muzzleAgeMs += step;
    state.recoilAgeMs += step;
  }
  updateBullets(field, step);
}
