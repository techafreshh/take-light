import * as THREE from 'three';
import { store } from './app/state';
import { CAMERA_PITCH_DEG, createFollowCamera, updateFollowCamera } from './game/camera';
import { createArenaScene, configureRenderer } from './game/scene';
import { PYLON_COUNT } from './game/props';
import { createFixedLoop } from './game/loop';
import {
  EMPTY_INPUT,
  mergeInput,
  sampleKeyboard,
  sampleMouseAim,
  type InputFrame,
} from './game/input';
import { createTouchStickState, mountSticks } from './ui/sticks';
import {
  ARENA_HALF,
  HOVER_Y,
  createPlayer,
  createPlayerMesh,
  resetPlayer,
  syncPlayerMesh,
  toPlayerSnapshot,
  tryDash,
  updatePlayer,
} from './game/player';
import {
  BULLET_CAPACITY,
  clearBullets,
  createBulletField,
  despawnBulletAt,
  syncBulletMeshes,
} from './game/bullets';
import {
  CAMERA_RECOIL_UNITS,
  MESH_RECOIL_UNITS,
  createWeapon,
  isMuzzleVisible,
  muzzleOpacity,
  recoilStrength,
  resetWeapon,
  updateWeapon,
} from './game/weapon';
import {
  ENEMY_CAPACITY,
  clearEnemies,
  createEnemyManager,
  releaseEnemy,
  spawnEnemy,
  syncEnemyMeshes,
  toEnemySnapshot,
  updateEnemies,
  type Enemy,
  type EnemySnapshot,
} from './game/enemy';
import {
  OKADA_PARAMS,
  OKADA_SCORE,
  createOkadaMesh,
} from './game/enemies/okada';
import {
  AREABOY_PARAMS,
  AREABOY_SCORE,
  BURST_SIZE,
  createAreaboyMesh,
} from './game/enemies/areaboy';
import {
  CARRIER_PARAMS,
  CARRIER_SCORE,
  SPREAD_COUNT,
  createCarrierMesh,
} from './game/enemies/carrier';
import {
  clearOrbs,
  createOrbField,
  fireAreaboyBurst,
  fireCarrierSpread,
  orbHitsPlayer,
  syncOrbMeshes,
  updateOrbs,
} from './game/enemies/orbs';
import {
  clearPickups,
  createPickupField,
  spawnPickup,
  syncPickupMeshes,
  toPickupProbe,
  updatePickups,
} from './game/pickups';
import { bulletHitsEnemy, damageEnemy, isGraze } from './game/combat';
import { takeHit } from './game/player';
import {
  awardKill,
  createScore,
  registerGraze,
  resetScore,
  updateScore,
} from './game/score';

// Boot: renderer on the static canvas, the dusk arena with the hover
// player, the pooled railgun tracers, the 60 Hz fixed-step loop wired to
// the store, resize handling, keyboard drive, and the dev overlay. Game
// code never touches the DOM: all window/DOM mirroring lives here.

/** Okada spawns on a ring this far from the player, clamped to the arena. */
const ENEMY_SPAWN_RING = 12;

declare global {
  interface Window {
    __TAKELIGHT_STATE__?: string;
    __TAKELIGHT_TICK__?: number;
    __TAKELIGHT_START__?: () => void;
    __TAKELIGHT_FPS__?: number;
    __TAKELIGHT_SCENE__?: {
      pylonCount: number;
      cameraPitchDeg: number;
      toneMapping: string;
      fog: boolean;
    };
    __TAKELIGHT_PLAYER__?: {
      pos: { x: number; y: number; z: number };
      vel: { x: number; y: number; z: number };
      invulnerable: boolean;
      dashCooldownMs: number;
      shields: number;
    };
    __TAKELIGHT_DASH__?: () => boolean;
    __TAKELIGHT_INPUT__?: InputFrame;
    __TAKELIGHT_BULLETS__?: {
      active: number;
      poolSize: number;
      muzzleVisible: boolean;
    };
    __TAKELIGHT_FORCE_FIRE__?: boolean;
    __TAKELIGHT_SET_FIRING__?: (on: boolean) => void;
    __TAKELIGHT_SPAWN__?: (kind: string) => number;
    __TAKELIGHT_KILL__?: (kind: string) => number;
    __TAKELIGHT_ENEMIES__?: {
      active: number;
      sawTelegraph: boolean;
      lastTelegraphMs: number;
      kills: number;
      list: EnemySnapshot[];
      types: string[];
      burstCount: number;
    };
    __TAKELIGHT_PICKUPS__?: {
      active: number;
      list: { kind: string; x: number; z: number }[];
    };
    __TAKELIGHT_SCORE__?: {
      kills: number;
      score: number;
      multiplier: number;
    };
    __TAKELIGHT_HIT__?: () => number;
    __TAKELIGHT_GRAZE__?: () => number;
  }
}

function getCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (canvas === null) {
    throw new Error('take-light: missing canvas#game-canvas');
  }
  return canvas;
}

function getMenu(): HTMLElement {
  const menu = document.querySelector<HTMLElement>('#menu');
  if (menu === null) {
    throw new Error('take-light: missing #menu overlay');
  }
  return menu;
}

function getStartButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('#start-btn');
  if (button === null) {
    throw new Error('take-light: missing button#start-btn');
  }
  return button;
}

function getOverlay(): HTMLElement {
  const overlay = document.querySelector<HTMLElement>('#dev-overlay');
  if (overlay === null) {
    throw new Error('take-light: missing #dev-overlay');
  }
  return overlay;
}

function sizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function boot(): void {
  const canvas = getCanvas();
  const menu = getMenu();
  const startButton = getStartButton();
  const overlay = getOverlay();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  configureRenderer(renderer);

  // Low-poly dusk arena: water, highway, pylons, dusk lights and fog.
  const { scene } = createArenaScene();

  const camera = createFollowCamera(
    window.innerWidth / window.innerHeight,
  );
  sizeRenderer(renderer, camera);

  // Kinematic hover player owned here; the sim core stays DOM-free.
  const player = createPlayer();
  const playerMesh = createPlayerMesh();
  scene.add(playerMesh);
  syncPlayerMesh(playerMesh, player);
  updateFollowCamera(camera, player.pos);

  // Pooled railgun tracers: one InstancedMesh plus a reused muzzle
  // sprite, and the autofire controller with a no-op audio hook (real
  // SFX lands in a later issue).
  const bullets = createBulletField();
  scene.add(bullets.mesh);
  scene.add(bullets.muzzle);
  const weapon = createWeapon();
  const onFire: () => void = () => {};
  const cameraTarget = new THREE.Vector3();

  // Shared roster pool: one manager (capacity 16) serves okada, areaboy
  // and carrier through per-kind mesh overrides; stepped on the same
  // fixed quantum; real SFX lands in a later issue so the telegraph
  // hook only latches the probe flag (no-op for audio).
  const enemies = createEnemyManager(scene, ENEMY_CAPACITY, createOkadaMesh);
  const orbs = createOrbField(scene);
  const pickups = createPickupField(scene);
  const scoreState = createScore();
  let sawTelegraph = false;
  // Live graze auto-detect throttle: at most one registration per window.
  let grazeCooldownMsLeft = 0;
  let lastTelegraphMs = 0;
  function bountyFor(kind: string): number {
    if (kind === 'areaboy') {
      return AREABOY_SCORE;
    }
    if (kind === 'carrier') {
      return CARRIER_SCORE;
    }
    return OKADA_SCORE;
  }
  function handleKill(enemy: Enemy): void {
    awardKill(scoreState, bountyFor(enemy.kind));
    if (enemy.kind === 'carrier') {
      spawnPickup(pickups, enemy.x, enemy.z, 'shield');
    }
    releaseEnemy(enemies, enemy);
  }
  const enemyHooks = {
    onTelegraph: () => {
      sawTelegraph = true;
    },
    onBurstStart: (enemy: Enemy) => {
      if (enemy.kind === 'areaboy') {
        fireAreaboyBurst(orbs, enemy.x, enemy.z, enemy.diveDirX, enemy.diveDirZ);
        enemy.shotsFired += BURST_SIZE;
      } else if (enemy.kind === 'carrier') {
        fireCarrierSpread(orbs, enemy.x, enemy.z, enemy.diveDirX, enemy.diveDirZ);
        enemy.shotsFired += SPREAD_COUNT;
      }
    },
  };

  // Desktop drive: held codes plus hold-fire (button 0) and the last
  // cursor position, sampled fresh every sim step and every render.
  const pressedKeys = new Set<string>();
  let mouseDown = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let hasMousePos = false;
  let prevDashHeld = false;
  // Probe drive: external writes to __TAKELIGHT_INPUT__.firing or the
  // force-fire flag latch in until the probe writes the opposite value,
  // so self-publishes never stick after release.
  let lastPublishedFiring = false;
  let latchedFiring = false;
  // Touch drive: twin sticks + dash button mutate this frame in place.
  const touch = createTouchStickState();
  mountSticks(touch);
  function readFrame(): InputFrame {
    const keyboard = sampleKeyboard(pressedKeys);
    const rect = canvas.getBoundingClientRect();
    const mouseAim = hasMousePos
      ? sampleMouseAim(lastMouseX, lastMouseY, rect)
      : { x: 0, y: 0 };
    const merged = mergeInput(keyboard, mouseAim, mouseDown, touch);
    const force = window.__TAKELIGHT_FORCE_FIRE__ === true;
    const external = window.__TAKELIGHT_INPUT__?.firing;
    if (typeof external === 'boolean' && external !== lastPublishedFiring) {
      latchedFiring = external;
    }
    const firing = merged.firing || force || latchedFiring;
    return { ...merged, firing };
  }
  window.addEventListener('keydown', (event) => {
    if (
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown' ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight'
    ) {
      event.preventDefault();
    }
    pressedKeys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    pressedKeys.delete(event.code);
  });
  window.addEventListener('mousemove', (event) => {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    hasMousePos = true;
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      mouseDown = false;
    }
  });
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    mouseDown = false;
    prevDashHeld = false;
  });

  function triggerDash(): boolean {
    const input = readFrame();
    let dirX = input.moveX;
    let dirZ = input.moveY;
    if (dirX === 0 && dirZ === 0) {
      dirX = player.headingX;
      dirZ = player.headingZ;
    }
    return tryDash(player, dirX, dirZ);
  }

  // Debug/acceptance hooks: damage goes only through takeHit so dash
  // i-frames keep negating it; graze goes only through registerGraze.
  // Both no-op when not RUNNING and refresh their probe immediately.
  function triggerHit(): number {
    if (store.get() !== 'RUNNING') {
      return player.shields;
    }
    takeHit(player);
    window.__TAKELIGHT_PLAYER__ = toPlayerSnapshot(player);
    return player.shields;
  }

  function triggerGraze(): number {
    if (store.get() !== 'RUNNING') {
      return scoreState.multiplier;
    }
    registerGraze(scoreState);
    window.__TAKELIGHT_SCORE__ = {
      kills: scoreState.kills,
      score: scoreState.score,
      multiplier: scoreState.multiplier,
    };
    return scoreState.multiplier;
  }

  // Fixed-step sim with variable-rate render every animation frame.
  let lastOverlayMs = -250;
  const loop = createFixedLoop(
    (stepMs) => {
      const input = readFrame();
      if (input.dash && !prevDashHeld) {
        let dirX = input.moveX;
        let dirZ = input.moveY;
        if (dirX === 0 && dirZ === 0) {
          dirX = player.headingX;
          dirZ = player.headingZ;
        }
        tryDash(player, dirX, dirZ);
      }
      prevDashHeld = input.dash;
      updatePlayer(player, input, stepMs);
      updateEnemies(enemies, player.pos, stepMs, enemyHooks);
      // Railgun hits on the flat plane: per-enemy hit radii, retire the
      // tracer on any hit, and on the killing blow pay out score and
      // free the slot (carrier deaths also drop a shield pickup).
      for (let i = bullets.alive - 1; i >= 0; i -= 1) {
        let target: Enemy | null = null;
        for (const enemy of enemies.live) {
          if (!enemy.active || enemy.state === 'dead') {
            continue;
          }
          if (
            bulletHitsEnemy(
              bullets.px[i],
              bullets.pz[i],
              enemy.x,
              enemy.z,
              enemy.params.hitRadius,
            )
          ) {
            target = enemy;
            break;
          }
        }
        if (target !== null) {
          const killed = damageEnemy(target, 1);
          despawnBulletAt(bullets, i);
          if (killed) {
            handleKill(target);
          }
        }
      }
      updateWeapon(
        weapon,
        bullets,
        input,
        player,
        stepMs,
        enemies.live,
        onFire,
      );
      updateOrbs(orbs, stepMs);
      // Multiplier decay ticks once per sim step; only grazes refresh it.
      updateScore(scoreState, stepMs);
      if (grazeCooldownMsLeft > 0) {
        grazeCooldownMsLeft = Math.max(0, grazeCooldownMsLeft - stepMs);
      }
      // Slow orbs wound on the flat plane; spent orbs retire on hit.
      for (let i = orbs.live.length - 1; i >= 0; i -= 1) {
        const orb = orbs.live[i];
        if (orb === undefined || !orb.active) {
          continue;
        }
        if (orbHitsPlayer(orb.x, orb.z, player.pos.x, player.pos.z)) {
          const wounded = takeHit(player);
          void wounded;
          const index = orbs.live.indexOf(orb);
          if (index >= 0) {
            orbs.live.splice(index, 1);
          }
          orb.active = false;
          if (orb.mesh !== null) {
            orb.mesh.visible = false;
          }
          orbs.pool.release(orb);
        }
      }
      // Live graze auto-detect: one registration per 300 ms max while any
      // live orb sits in the near-miss band. Damage stays via takeHit.
      if (grazeCooldownMsLeft <= 0) {
        for (const orb of orbs.live) {
          if (
            orb !== undefined &&
            orb.active &&
            isGraze(orb.x, orb.z, player.pos.x, player.pos.z)
          ) {
            registerGraze(scoreState);
            grazeCooldownMsLeft = 300;
            break;
          }
        }
      }
      updatePickups(pickups, player.pos, player, stepMs);
      for (const enemy of enemies.live) {
        if (enemy.state === 'telegraph') {
          sawTelegraph = true;
        }
        if (enemy.lastTelegraphMs > lastTelegraphMs) {
          lastTelegraphMs = enemy.lastTelegraphMs;
        }
      }
    },
    () => {
      syncPlayerMesh(playerMesh, player);
      // Decaying recoil kick opposite fire on top of the tilt.
      const kick = recoilStrength(weapon);
      if (kick > 0) {
        playerMesh.position.x -= weapon.recoilDirX * MESH_RECOIL_UNITS * kick;
        playerMesh.position.z -= weapon.recoilDirZ * MESH_RECOIL_UNITS * kick;
        cameraTarget.set(
          player.pos.x - weapon.recoilDirX * CAMERA_RECOIL_UNITS * kick,
          player.pos.y,
          player.pos.z - weapon.recoilDirZ * CAMERA_RECOIL_UNITS * kick,
        );
        updateFollowCamera(camera, cameraTarget);
      } else {
        updateFollowCamera(camera, player.pos);
      }
      syncBulletMeshes(bullets);
      syncEnemyMeshes(enemies);
      syncOrbMeshes(orbs);
      syncPickupMeshes(pickups);
      // Shooter spin-up: live telegraphers yaw with time in state.
      for (const enemy of enemies.live) {
        if (
          enemy.active &&
          enemy.state === 'telegraph' &&
          enemy.mesh !== null &&
          (enemy.kind === 'areaboy' || enemy.kind === 'carrier')
        ) {
          enemy.mesh.rotation.y = enemy.stateMs * 0.012;
        }
      }
      // Muzzle flash at the barrel tip, fading over 60 ms.
      if (isMuzzleVisible(weapon)) {
        bullets.muzzle.position.set(
          player.pos.x + weapon.recoilDirX * 1.1,
          HOVER_Y + 0.2,
          player.pos.z + weapon.recoilDirZ * 1.1,
        );
        const material = bullets.muzzle.material as THREE.SpriteMaterial;
        material.opacity = muzzleOpacity(weapon);
        bullets.muzzle.visible = true;
      } else {
        bullets.muzzle.visible = false;
      }
      window.__TAKELIGHT_TICK__ = loop.getTick();
      // Probe contracts refreshed every frame, never throttled.
      const currentFrame = readFrame();
      window.__TAKELIGHT_INPUT__ = { ...currentFrame };
      lastPublishedFiring = currentFrame.firing;
      window.__TAKELIGHT_PLAYER__ = toPlayerSnapshot(player);
      window.__TAKELIGHT_BULLETS__ = {
        active: bullets.alive,
        poolSize: BULLET_CAPACITY,
        muzzleVisible: isMuzzleVisible(weapon),
      };
      window.__TAKELIGHT_ENEMIES__ = {
        active: enemies.live.length,
        sawTelegraph,
        lastTelegraphMs,
        kills: scoreState.kills,
        list: enemies.live.map(toEnemySnapshot),
        types: Array.from(new Set(enemies.live.map((enemy) => enemy.kind))).sort(),
        burstCount: enemies.live.reduce(
          (sum, enemy) => sum + (enemy.kind === 'areaboy' ? enemy.shotsFired : 0),
          0,
        ),
      };
      window.__TAKELIGHT_PICKUPS__ = toPickupProbe(pickups);
      window.__TAKELIGHT_SCORE__ = {
        kills: scoreState.kills,
        score: scoreState.score,
        multiplier: scoreState.multiplier,
      };
      window.__TAKELIGHT_DASH__ = triggerDash;
      window.__TAKELIGHT_HIT__ = triggerHit;
      window.__TAKELIGHT_GRAZE__ = triggerGraze;
      const now = performance.now();
      if (now - lastOverlayMs >= 250) {
        lastOverlayMs = now;
        overlay.textContent =
          `fps: ${loop.getFps()} tick: ${loop.getTick()} ` +
          `dash: ${Math.ceil(player.dashCooldownMsLeft)}ms ` +
          `shields: ${player.shields}`;
        window.__TAKELIGHT_FPS__ = loop.getFps();
        window.__TAKELIGHT_SCENE__ = {
          pylonCount: PYLON_COUNT,
          cameraPitchDeg: CAMERA_PITCH_DEG,
          toneMapping: 'ACES',
          fog: true,
        };
      }
      renderer.render(scene, camera);
    },
    () => store.get() === 'RUNNING',
  );

  // UI reflects the store; scene code never touches the DOM.
  store.subscribe((state) => {
    menu.dataset.state = state;
    menu.style.display = state === 'MENU' ? 'flex' : 'none';
    window.__TAKELIGHT_STATE__ = state;
    if (state === 'RUNNING') {
      loop.resetTick();
      window.__TAKELIGHT_TICK__ = 0;
      resetPlayer(player);
      clearBullets(bullets);
      resetWeapon(weapon);
      clearEnemies(enemies);
      clearOrbs(orbs);
      clearPickups(pickups);
      resetScore(scoreState);
      grazeCooldownMsLeft = 0;
      sawTelegraph = false;
      lastTelegraphMs = 0;
      prevDashHeld = false;
    }
  });

  startButton.addEventListener('click', () => {
    store.set('RUNNING');
    startButton.blur();
  });
  window.__TAKELIGHT_START__ = () => {
    store.set('RUNNING');
  };
  window.__TAKELIGHT_SET_FIRING__ = (on: boolean) => {
    window.__TAKELIGHT_FORCE_FIRE__ = on === true;
  };
  window.__TAKELIGHT_SPAWN__ = (kind: string): number => {
    if (store.get() !== 'RUNNING') {
      return -1;
    }
    const angle =
      kind === 'areaboy'
        ? (2 * Math.PI) / 3
        : kind === 'carrier'
          ? (4 * Math.PI) / 3
          : kind === 'okada'
            ? 0
            : null;
    if (angle === null) {
      return -1;
    }
    const params =
      kind === 'areaboy'
        ? AREABOY_PARAMS
        : kind === 'carrier'
          ? CARRIER_PARAMS
          : OKADA_PARAMS;
    const createMesh =
      kind === 'areaboy'
        ? createAreaboyMesh
        : kind === 'carrier'
          ? createCarrierMesh
          : createOkadaMesh;
    const x = Math.min(
      Math.max(player.pos.x + Math.cos(angle) * ENEMY_SPAWN_RING, -ARENA_HALF),
      ARENA_HALF,
    );
    const z = Math.min(
      Math.max(player.pos.z + Math.sin(angle) * ENEMY_SPAWN_RING, -ARENA_HALF),
      ARENA_HALF,
    );
    return spawnEnemy(enemies, kind, params, x, z, createMesh).id;
  };
  window.__TAKELIGHT_KILL__ = (kind: string): number => {
    if (store.get() !== 'RUNNING') {
      return 0;
    }
    if (kind !== 'okada' && kind !== 'areaboy' && kind !== 'carrier') {
      return 0;
    }
    const targets = enemies.live.filter((enemy) => enemy.kind === kind);
    for (const target of targets) {
      handleKill(target);
    }
    return targets.length;
  };

  window.addEventListener('resize', () => {
    sizeRenderer(renderer, camera);
  });

  window.__TAKELIGHT_STATE__ = 'MENU';
  window.__TAKELIGHT_TICK__ = 0;
  window.__TAKELIGHT_PLAYER__ = toPlayerSnapshot(player);
  window.__TAKELIGHT_INPUT__ = { ...EMPTY_INPUT };
  lastPublishedFiring = false;
  latchedFiring = false;
  window.__TAKELIGHT_FORCE_FIRE__ = false;
  window.__TAKELIGHT_BULLETS__ = {
    active: 0,
    poolSize: BULLET_CAPACITY,
    muzzleVisible: false,
  };
  window.__TAKELIGHT_ENEMIES__ = {
    active: 0,
    sawTelegraph: false,
    lastTelegraphMs: 0,
    kills: 0,
    list: [],
    types: [],
    burstCount: 0,
  };
  window.__TAKELIGHT_PICKUPS__ = { active: 0, list: [] };
  window.__TAKELIGHT_SCORE__ = {
    kills: scoreState.kills,
    score: scoreState.score,
    multiplier: scoreState.multiplier,
  };
  window.__TAKELIGHT_DASH__ = triggerDash;
  window.__TAKELIGHT_HIT__ = triggerHit;
  window.__TAKELIGHT_GRAZE__ = triggerGraze;
  store.set('MENU');

  renderer.setAnimationLoop((time) => {
    loop.frame(time);
  });
}

boot();
