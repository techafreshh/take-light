// Shared enemy FSM base: idle -> chase -> telegraph -> dive -> recover
// (-> chase), with telegraph as a first-class timed state (glow plus an
// onTelegraph sound hook). Data-plus-pure-functions like the rest of the
// sim: per-kind EnemyParams tables drive one updateEnemies stepper on the
// fixed STEP_MS quantum; main.ts owns pooling meshes, spawning, collision
// wiring, and all window probe mirrors.

import * as THREE from 'three';
import { ARENA_HALF, HOVER_Y } from './player';
import { ObjectPool } from './pool';

export type EnemyState =
  | 'idle'
  | 'chase'
  | 'telegraph'
  | 'dive'
  | 'recover'
  | 'dead';

/** Per-kind tuning: speeds in units/s, all windows in ms, glow unitless. */
export interface EnemyParams {
  chaseSpeed: number;
  diveSpeed: number;
  triggerRadius: number;
  chaseTimeoutMs: number;
  telegraphMs: number;
  diveMs: number;
  recoverMs: number;
  hitRadius: number;
  maxHp: number;
  baseGlow: number;
  telegraphGlow: number;
  /** Tangential orbit speed for keep-distance shooters; unset = rush. */
  strafeSpeed?: number;
  /** Preferred range for keep-distance shooters; unset = rush. */
  preferRange?: number;
}

export interface Enemy {
  id: number;
  kind: string;
  state: EnemyState;
  /** Time in the current state. */
  stateMs: number;
  /** Time in the current chase leg; telegraph fires at the timeout. */
  chaseMs: number;
  /** Time in the current telegraph (0 outside telegraph). */
  telegraphMs: number;
  /** Completed telegraph duration, latched on telegraph exit. */
  lastTelegraphMs: number;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  /** Player position captured at telegraph enter; the dive aims here. */
  targetX: number;
  targetZ: number;
  /** Locked dive bearing through the captured target (overshoots it). */
  diveDirX: number;
  diveDirZ: number;
  glowIntensity: number;
  params: EnemyParams;
  /** Total orbs fired by this enemy; volley sources increment on burst. */
  shotsFired: number;
  active: boolean;
  mesh: THREE.Group | null;
  bodyMat: THREE.MeshStandardMaterial | null;
  lineMat: THREE.MeshStandardMaterial | null;
}

export interface EnemyHooks {
  onTelegraph?: (enemy: Enemy) => void;
  onDeath?: (enemy: Enemy) => void;
  /** Fired once at telegraph exit where the dive bearing locks. */
  onBurstStart?: (enemy: Enemy) => void;
}

export interface EnemySnapshot {
  kind: string;
  state: EnemyState;
  stateMs: number;
  telegraphMs: number;
  glowIntensity: number;
  hp: number;
  x: number;
  z: number;
  burstCount: number;
}

export interface EnemyManager {
  pool: ObjectPool<Enemy>;
  live: Enemy[];
  nextId: number;
  scene?: THREE.Scene;
}

export type EnemyMeshFactory = () => THREE.Group;

/** Preallocated slots per run; probes spawn at most a handful. */
export const ENEMY_CAPACITY = 16;
/** Fresh spawns hold still this long before acquiring the player. */
export const IDLE_MS = 200;
/** Default telegraph window; per-kind params.telegraphMs rules per enemy. */
export const TELEGRAPH_MS = 450;

function clampArena(value: number): number {
  if (value < -ARENA_HALF) {
    return -ARENA_HALF;
  }
  if (value > ARENA_HALF) {
    return ARENA_HALF;
  }
  return value;
}

/**
 * Threshold compare with the loop.ts epsilon guard: accumulated STEP_MS
 * sums land within 1e-9 of exact multiples, so strict >= flakes by one
 * step at 200/500/600 ms boundaries. Never shifts a full step early.
 */
function reached(ms: number, thresholdMs: number): boolean {
  return ms + 1e-9 >= thresholdMs;
}

/** Telegraph glows hot; every other state rests at the base emissive. */
export function glowIntensityFor(
  state: EnemyState,
  params: EnemyParams,
): number {
  return state === 'telegraph' ? params.telegraphGlow : params.baseGlow;
}

/** Minimal fallback mesh for headless tests; the game passes Okada's. */
function defaultEnemyMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x232838,
    emissive: 0xff6a00,
    emissiveIntensity: 0.55,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1.2), bodyMat);
  group.add(body);
  group.userData.bodyMat = bodyMat;
  group.userData.lineMat = bodyMat;
  group.visible = false;
  return group;
}

function materialsFrom(group: THREE.Group): {
  body: THREE.MeshStandardMaterial | null;
  line: THREE.MeshStandardMaterial | null;
} {
  const data = group.userData as {
    bodyMat?: unknown;
    lineMat?: unknown;
  };
  const body =
    data.bodyMat instanceof THREE.MeshStandardMaterial ? data.bodyMat : null;
  const line =
    data.lineMat instanceof THREE.MeshStandardMaterial ? data.lineMat : null;
  if (body !== null) {
    return { body, line };
  }
  for (const child of group.children) {
    if (child instanceof THREE.Mesh) {
      const material = child.material as unknown;
      if (material instanceof THREE.MeshStandardMaterial) {
        return { body: material, line: material };
      }
    }
  }
  return { body: null, line: null };
}

/**
 * Preallocate the full enemy pool. Meshes are hidden until spawn; the
 * optional scene attaches them for the game, headless tests skip it.
 */
export function createEnemyManager(
  scene?: THREE.Scene,
  capacity: number = ENEMY_CAPACITY,
  createMesh: EnemyMeshFactory = defaultEnemyMesh,
): EnemyManager {
  const pool = new ObjectPool<Enemy>(() => {
    const mesh = createMesh();
    const { body, line } = materialsFrom(mesh);
    mesh.visible = false;
    if (scene !== undefined) {
      scene.add(mesh);
    }
    return {
      id: -1,
      kind: '',
      state: 'dead' as EnemyState,
      stateMs: 0,
      chaseMs: 0,
      telegraphMs: 0,
      lastTelegraphMs: 0,
      hp: 0,
      maxHp: 1,
      x: 0,
      z: 0,
      targetX: 0,
      targetZ: 0,
      diveDirX: 0,
      diveDirZ: -1,
      glowIntensity: 0,
      params: undefined as unknown as EnemyParams,
      shotsFired: 0,
      active: false,
      mesh,
      bodyMat: body,
      lineMat: line,
    };
  }, capacity);
  return { pool, live: [], nextId: 0, scene };
}

/**
 * Fill one slot (recycling the oldest live enemy when exhausted, like the
 * pool's acquire contract). Always starts idle at base glow. The optional
 * mesh factory swaps the slot mesh only on kind change (tag-guarded via
 * mesh.userData.kindTag, scene detach/attach through the manager scene)
 * so the hot loop never allocates.
 */
export function spawnEnemy(
  manager: EnemyManager,
  kind: string,
  params: EnemyParams,
  x: number,
  z: number,
  createMesh?: EnemyMeshFactory,
): Enemy {
  const slot = manager.pool.acquire();
  if (createMesh !== undefined) {
    const tag = (slot.mesh?.userData as { kindTag?: unknown } | undefined)
      ?.kindTag;
    if (tag !== kind) {
      if (slot.mesh !== null && manager.scene !== undefined) {
        manager.scene.remove(slot.mesh);
      }
      const mesh = createMesh();
      (mesh.userData as { kindTag?: unknown }).kindTag = kind;
      if (manager.scene !== undefined) {
        manager.scene.add(mesh);
      }
      const { body, line } = materialsFrom(mesh);
      slot.mesh = mesh;
      slot.bodyMat = body;
      slot.lineMat = line;
    }
  }
  slot.id = manager.nextId;
  manager.nextId += 1;
  slot.kind = kind;
  slot.params = params;
  slot.state = 'idle';
  slot.stateMs = 0;
  slot.chaseMs = 0;
  slot.telegraphMs = 0;
  slot.lastTelegraphMs = 0;
  slot.hp = params.maxHp;
  slot.maxHp = params.maxHp;
  slot.shotsFired = 0;
  slot.x = clampArena(x);
  slot.z = clampArena(z);
  slot.targetX = slot.x;
  slot.targetZ = slot.z;
  slot.diveDirX = 0;
  slot.diveDirZ = -1;
  slot.glowIntensity = params.baseGlow;
  slot.active = true;
  if (slot.mesh !== null) {
    slot.mesh.visible = true;
    slot.mesh.position.set(slot.x, HOVER_Y, slot.z);
  }
  if (slot.bodyMat !== null) {
    slot.bodyMat.emissiveIntensity = params.baseGlow;
  }
  if (slot.lineMat !== null) {
    slot.lineMat.emissiveIntensity = params.baseGlow;
  }
  if (!manager.live.includes(slot)) {
    manager.live.push(slot);
  }
  return slot;
}

/** Hide the corpse and hand the slot back; dead enemies leave live. */
export function releaseEnemy(manager: EnemyManager, enemy: Enemy): void {
  const index = manager.live.indexOf(enemy);
  if (index >= 0) {
    manager.live.splice(index, 1);
  }
  enemy.active = false;
  enemy.state = 'dead';
  enemy.stateMs = 0;
  if (enemy.mesh !== null) {
    enemy.mesh.visible = false;
  }
  manager.pool.release(enemy);
}

/** Between runs: every slot back to the pool, meshes hidden. */
export function clearEnemies(manager: EnemyManager): void {
  const live = manager.live.slice();
  for (const enemy of live) {
    releaseEnemy(manager, enemy);
  }
}

function enterChase(enemy: Enemy): void {
  enemy.state = 'chase';
  enemy.stateMs = 0;
  enemy.chaseMs = 0;
  enemy.glowIntensity = enemy.params.baseGlow;
}

function enterTelegraph(
  enemy: Enemy,
  playerPos: { x: number; z: number },
  onTelegraph: ((enemy: Enemy) => void) | undefined,
): void {
  enemy.targetX = playerPos.x;
  enemy.targetZ = playerPos.z;
  enemy.state = 'telegraph';
  enemy.stateMs = 0;
  enemy.telegraphMs = 0;
  enemy.glowIntensity = enemy.params.telegraphGlow;
  if (onTelegraph !== undefined) {
    onTelegraph(enemy);
  }
}

/**
 * Fixed-quantum FSM stepper. Telegraph fires from chase on proximity
 * (flat-plane dist <= triggerRadius) or, regardless of range, once
 * chaseMs passes chaseTimeoutMs — so a telegraph always lands quickly
 * after spawn. The dive locks its bearing through the captured target
 * and overshoots it; the player may move freely mid-telegraph.
 */
export function updateEnemies(
  manager: EnemyManager,
  playerPos: { x: number; z: number },
  dtMs: number,
  hooks: EnemyHooks = {},
): void {
  const step = Math.max(dtMs, 0);
  const dt = step / 1000;
  for (const enemy of manager.live) {
    if (!enemy.active || enemy.state === 'dead') {
      continue;
    }
    const params = enemy.params;
    enemy.stateMs += step;
    switch (enemy.state) {
      case 'idle': {
        enemy.glowIntensity = params.baseGlow;
        if (reached(enemy.stateMs, IDLE_MS)) {
          enterChase(enemy);
        }
        break;
      }
      case 'chase': {
        enemy.chaseMs += step;
        const dx = playerPos.x - enemy.x;
        const dz = playerPos.z - enemy.z;
        const dist = Math.hypot(dx, dz);
        const useStrafe =
          params.strafeSpeed !== undefined ||
          params.preferRange !== undefined;
        if (!useStrafe) {
          if (dist > 1e-6) {
            const travel = params.chaseSpeed * dt;
            enemy.x = clampArena(enemy.x + (dx / dist) * travel);
            enemy.z = clampArena(enemy.z + (dz / dist) * travel);
          }
        } else if (dist > 1e-6) {
          const nx = dx / dist;
          const nz = dz / dist;
          let radial = params.chaseSpeed * dt;
          if (params.preferRange !== undefined) {
            if (dist < params.preferRange) {
              radial = -params.chaseSpeed * dt;
            }
          }
          let mx = nx * radial;
          let mz = nz * radial;
          if (
            params.strafeSpeed !== undefined &&
            params.strafeSpeed > 0
          ) {
            const sign = enemy.id % 2 === 0 ? 1 : -1;
            const orbit = params.strafeSpeed * dt * sign;
            mx += -nz * orbit;
            mz += nx * orbit;
          }
          enemy.x = clampArena(enemy.x + mx);
          enemy.z = clampArena(enemy.z + mz);
        }
        const flat = Math.hypot(playerPos.x - enemy.x, playerPos.z - enemy.z);
        if (
          flat <= params.triggerRadius ||
          reached(enemy.chaseMs, params.chaseTimeoutMs)
        ) {
          enterTelegraph(enemy, playerPos, hooks.onTelegraph);
        } else {
          enemy.glowIntensity = params.baseGlow;
        }
        break;
      }
      case 'telegraph': {
        enemy.telegraphMs += step;
        enemy.glowIntensity = params.telegraphGlow;
        if (reached(enemy.stateMs, params.telegraphMs)) {
          enemy.lastTelegraphMs = enemy.telegraphMs;
          const dx = enemy.targetX - enemy.x;
          const dz = enemy.targetZ - enemy.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 1e-6) {
            enemy.diveDirX = dx / dist;
            enemy.diveDirZ = dz / dist;
          } else {
            enemy.diveDirX = 0;
            enemy.diveDirZ = -1;
          }
          enemy.state = 'dive';
          enemy.stateMs = 0;
          enemy.telegraphMs = 0;
          enemy.glowIntensity = params.baseGlow;
          if (hooks.onBurstStart !== undefined) {
            hooks.onBurstStart(enemy);
          }
        }
        break;
      }
      case 'dive': {
        enemy.x = clampArena(enemy.x + enemy.diveDirX * params.diveSpeed * dt);
        enemy.z = clampArena(enemy.z + enemy.diveDirZ * params.diveSpeed * dt);
        enemy.glowIntensity = params.baseGlow;
        if (reached(enemy.stateMs, params.diveMs)) {
          enemy.state = 'recover';
          enemy.stateMs = 0;
        }
        break;
      }
      case 'recover': {
        enemy.glowIntensity = params.baseGlow;
        if (reached(enemy.stateMs, params.recoverMs)) {
          enterChase(enemy);
        }
        break;
      }
    }
  }
}

/** Push live slots into their preallocated groups; zero allocation. */
export function syncEnemyMeshes(manager: EnemyManager): void {
  for (const enemy of manager.live) {
    if (enemy.mesh === null) {
      continue;
    }
    if (!enemy.active || enemy.state === 'dead') {
      enemy.mesh.visible = false;
      continue;
    }
    enemy.mesh.visible = true;
    enemy.mesh.position.set(enemy.x, HOVER_Y, enemy.z);
    if (enemy.bodyMat !== null) {
      enemy.bodyMat.emissiveIntensity = enemy.glowIntensity;
    }
    if (enemy.lineMat !== null) {
      enemy.lineMat.emissiveIntensity = enemy.glowIntensity;
    }
  }
}

/** Probe/store snapshot for one enemy. */
export function toEnemySnapshot(enemy: Enemy): EnemySnapshot {
  return {
    kind: enemy.kind,
    state: enemy.state,
    stateMs: enemy.stateMs,
    telegraphMs: enemy.telegraphMs,
    glowIntensity: enemy.glowIntensity,
    hp: enemy.hp,
    x: enemy.x,
    z: enemy.z,
    burstCount: enemy.shotsFired,
  };
}
