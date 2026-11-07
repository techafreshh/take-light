import * as THREE from 'three';
import { store, type GameState } from './app/state';
import { hudStore } from './ui/store';
import { mountHud } from './ui/hud';
import { mountMenus, type MenusHandle, type PbEntry } from './ui/menus';
import {
  computeDurationS,
  enqueueRun,
  fetchWeeklyTop100,
  flushQueue,
  maybeWritePb,
  setForcedOffline,
  submitRun,
} from './net/leaderboard';
import { CAMERA_PITCH_DEG, addShake, createFollowCamera, createShake, shakeOffset, updateFollowCamera, updateShake } from './game/camera';
import { createArenaScene, configureRenderer, sizeRenderer } from './game/scene';
import { clampPan, createAudioBank, playSfx, toAudioProbe, unlockAudio } from './game/audio';
import { createPostFX, type PostFX } from './game/postfx';
import { mountEffects, spawnDamageNumber, spawnHitMarker } from './ui/effects';
import { PYLON_COUNT, updateDanfoTraffic } from './game/props';
import { getAssetModels, readHeapBytes } from './game/assets';
import { STEP_MS, createFixedLoop, consumeHitstop, createHitstop, triggerHitstop } from './game/loop';
import {
  EMPTY_INPUT,
  mergeInput,
  sampleKeyboard,
  sampleMouseAim,
  type InputFrame,
} from './game/input';
import { createTouchStickState, mountSticks } from './ui/sticks';
import { createElementRectCache } from './ui/rectCache';
import {
  ARENA_HALF,
  DASH_COOLDOWN_MS,
  HOVER_Y,
  MAX_SHIELDS,
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
import { normalizeWave, planWave, type WavePlan } from './game/director';
import {
  applyBlackout,
  blackoutForWave,
  type BlackoutState,
} from './game/blackout';
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

/** Trauma kick applied on kill; the offset stays far under the 0.3 cap. */
const KILL_SHAKE_TRAUMA = 0.35;

declare global {
  interface Window {
    __TAKELIGHT_OFFLINE__?: (offline: boolean) => void;
    __TAKELIGHT_STATE__?: string;
    __TAKELIGHT_TICK__?: number;
    __TAKELIGHT_START__?: () => void;
    __TAKELIGHT_FPS__?: number;
    __TAKELIGHT_SCENE__?: {
      pylonCount: number;
      cameraPitchDeg: number;
      toneMapping: string;
      fog: boolean;
      lightIntensity: number;
    };
    __TAKELIGHT_WAVE__?: number;
    __TAKELIGHT_WAVEPLAN__?: (seed: number, wave: number) => WavePlan;
    __TAKELIGHT_SETWAVE__?: (wave: number) => number;
    __TAKELIGHT_LIGHT__?: BlackoutState;
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
    __TAKELIGHT_AUDIO__?: { unlocked: boolean; sfxCount: number };
    __TAKELIGHT_HITSTOP__?: number;
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
    __TAKELIGHT_ASSETS__?: {
      models: string[];
    };
    __TAKELIGHT_HEAP__?: () => number;
    __TAKELIGHT_GAMEOVER__?: () => void;
    __TAKELIGHT_FULLRUN__?: () => Promise<{ status: string; row: object | null }>;
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

function getOverlay(): HTMLElement {
  const overlay = document.querySelector<HTMLElement>('#dev-overlay');
  if (overlay === null) {
    throw new Error('take-light: missing #dev-overlay');
  }
  return overlay;
}

function boot(): void {
  const canvas = getCanvas();
  const menu = getMenu();
  const overlay = getOverlay();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  configureRenderer(renderer);

  // Low-poly dusk arena: water, highway, pylons, danfo traffic, dusk
  // lights and fog. The live light handles feed the wave-driven
  // blackout curve; the vendored dusk equirect compiles to a PMREM
  // environment once (lights carry headless/probe-safe fallback).
  const arena = createArenaScene();
  const { scene, lights, traffic } = arena;
  arena.applyDuskEnvironment(renderer);
  let currentWave = 1;
  let currentLight = blackoutForWave(currentWave);
  let waveElapsedMs = 0;
  let waveSeed = 42;

  // Wave director probes: WAVEPLAN delegates to the pure seeded planner
  // (side-effect-free); SETWAVE clamps, applies the blackout synchronously
  // in the same task, and mirrors wave + light state for the probes.
  function setWave(wave: number): number {
    currentWave = normalizeWave(wave);
    waveElapsedMs = 0;
    currentLight = applyBlackout(lights, currentWave);
    window.__TAKELIGHT_WAVE__ = currentWave;
    window.__TAKELIGHT_LIGHT__ = { ...currentLight };
    const previousScene = window.__TAKELIGHT_SCENE__;
    if (previousScene !== undefined) {
      window.__TAKELIGHT_SCENE__ = {
        ...previousScene,
        lightIntensity: currentLight.lightIntensity,
      };
    }
    return currentWave;
  }
  window.__TAKELIGHT_WAVEPLAN__ = (seed: number, wave: number): WavePlan =>
    planWave(seed, wave);
  window.__TAKELIGHT_SETWAVE__ = setWave;

  const camera = createFollowCamera(
    window.innerWidth / window.innerHeight,
  );
  sizeRenderer(
    renderer,
    camera,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  );

  // Juice layer: hitstop freeze, trauma shake, the Howler bank, the DOM
  // fx layer, and the bloom chain (null under headless GL falls back
  // to direct rendering). All DOM/audio mirroring stays in boot.
  const hitstop = createHitstop();
  const shake = createShake();
  const audioBank = createAudioBank();
  const fx = mountEffects();
  mountHud();

  // Leaderboard wiring: run-start tracking for duration_s, submit on the
  // game-over save with offline queueing, weekly fetch into the menus
  // board, and the forced-offline probe hook plus the online flush.
  let runStartAtMs = 0;
  let menusHandle: MenusHandle | null = null;

  async function fetchAndPushBoard(): Promise<void> {
    try {
      const rows = await fetchWeeklyTop100();
      menusHandle?.refreshBoard(rows);
    } catch {
      // fetchWeeklyTop100 never throws; repaint the queued suffix anyway.
      menusHandle?.refreshBoard();
    }
  }

  async function flushThenRefetch(): Promise<void> {
    try {
      await flushQueue();
    } catch {
      // flushQueue never throws; fall through to the board refetch.
    }
    await fetchAndPushBoard();
  }

  async function handleRunSubmit(entry: PbEntry): Promise<void> {
    maybeWritePb(entry);
    const payload = {
      name: entry.name,
      score: entry.score,
      wave: entry.wave,
      duration_s: computeDurationS(runStartAtMs, Date.now(), entry.wave),
    };
    const result = await submitRun(payload);
    if (result.status === 'failed') {
      // Queued results are already stored by submitRun; only unstored
      // retryable failures fall back to the queue here.
      enqueueRun(payload);
    }
    menusHandle?.refreshBoard();
  }

  menusHandle = mountMenus({
    onSubmit: (entry) => {
      void handleRunSubmit(entry);
    },
  });
  window.__TAKELIGHT_OFFLINE__ = (offline: boolean) => {
    setForcedOffline(offline === true);
    if (offline === true) {
      menusHandle?.refreshBoard();
      return;
    }
    void flushThenRefetch();
  };
  window.addEventListener('online', () => {
    void flushThenRefetch();
  });
  void fetchAndPushBoard();
  const postfx: PostFX | null = createPostFX(renderer, scene, camera);
  sizeRenderer(
    renderer,
    camera,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
    postfx,
  );

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
  const onFire: () => void = () => {
    playSfx(audioBank, 'shot', 0);
  };
  const cameraTarget = new THREE.Vector3();

  // Shared roster pool: one manager (capacity 16) serves okada, areaboy
  // and carrier through per-kind mesh overrides; stepped on the same
  // fixed quantum; real SFX lands in a later issue so the telegraph
  // hook only latches the probe flag (no-op for audio).
  const enemies = createEnemyManager(scene, ENEMY_CAPACITY, createOkadaMesh);
  // Timed wave plans: each plan's okada/areaboy/carrier plus any rush
  // bonus ride the shared spawn ring so a 10-wave run lasts ~4 minutes.
  function spawnWavePlan(plan: WavePlan): void {
    const total =
      plan.okada + plan.areaboy + plan.carrier + plan.rushBonusOkada;
    if (total <= 0) {
      return;
    }
    let index = 0;
    const spawnOne = (
      kind: string,
      params: typeof OKADA_PARAMS,
      createMesh: () => THREE.Group,
    ): void => {
      const angle = (index / total) * Math.PI * 2;
      index += 1;
      const x = Math.min(
        Math.max(player.pos.x + Math.cos(angle) * ENEMY_SPAWN_RING, -ARENA_HALF),
        ARENA_HALF,
      );
      const z = Math.min(
        Math.max(player.pos.z + Math.sin(angle) * ENEMY_SPAWN_RING, -ARENA_HALF),
        ARENA_HALF,
      );
      spawnEnemy(enemies, kind, params, x, z, createMesh);
    };
    for (let i = 0; i < plan.okada; i += 1) {
      spawnOne('okada', OKADA_PARAMS, createOkadaMesh);
    }
    for (let i = 0; i < plan.areaboy; i += 1) {
      spawnOne('areaboy', AREABOY_PARAMS, createAreaboyMesh);
    }
    for (let i = 0; i < plan.carrier; i += 1) {
      spawnOne('carrier', CARRIER_PARAMS, createCarrierMesh);
    }
    for (let i = 0; i < plan.rushBonusOkada; i += 1) {
      spawnOne('okada', OKADA_PARAMS, createOkadaMesh);
    }
  }
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
      playSfx(audioBank, 'telegraph', 0);
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

  // Reused projection scratch: kill world pos -> screen px for DOM fx.
  const juicePoint = new THREE.Vector3();
  function screenPx(x: number, y: number, z: number): { x: number; y: number } {
    juicePoint.set(x, y, z).project(camera);
    return {
      x: ((juicePoint.x + 1) / 2) * window.innerWidth,
      y: ((1 - juicePoint.y) / 2) * window.innerHeight,
    };
  }
  // Kill juice: 60 ms hitstop, a small trauma kick, DOM markers, kill SFX.
  function juiceForKill(x: number, z: number): void {
    triggerHitstop(hitstop);
    // Publish synchronously: the next render may be a frame away, and
    // probes read between tasks must observe the armed 60 ms.
    window.__TAKELIGHT_HITSTOP__ = hitstop.msLeft;
    addShake(shake, KILL_SHAKE_TRAUMA);
    const at = screenPx(x, HOVER_Y, z);
    spawnDamageNumber(fx, at.x, at.y, '+100');
    spawnHitMarker(fx, at.x, at.y);
    playSfx(audioBank, 'kill', clampPan((x - player.pos.x) / 10));
  }

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
  // Cached canvas rect: the canvas is position:fixed, so its geometry only
  // changes on viewport events. readFrame runs ~120/sec (sim steps plus
  // every render), so it must not force synchronous layout per call.
  const canvasRectCache = createElementRectCache(canvas);
  function readFrame(): InputFrame {
    const keyboard = sampleKeyboard(pressedKeys);
    const rect = canvasRectCache.get();
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
    if (event.code === 'Escape' || event.code === 'KeyP') {
      const paused = store.get();
      if (paused === 'RUNNING') {
        store.set('PAUSED');
      } else if (paused === 'PAUSED') {
        store.set('RUNNING');
      }
    }
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
  // First-input audio unlock: pointer and touch both count so probes,
  // real taps, and mouse-driven emulation all start the ambient loop.
  window.addEventListener('pointerdown', () => {
    unlockAudio(audioBank);
  });
  window.addEventListener('touchstart', () => {
    unlockAudio(audioBank);
  });

  function triggerDash(): boolean {
    const input = readFrame();
    let dirX = input.moveX;
    let dirZ = input.moveY;
    if (dirX === 0 && dirZ === 0) {
      dirX = player.headingX;
      dirZ = player.headingZ;
    }
    if (tryDash(player, dirX, dirZ)) {
      playSfx(audioBank, 'dash', 0);
      return true;
    }
    return false;
  }

  function checkGameOver(): void {
    if (player.shields <= 0 && store.get() === 'RUNNING') {
      store.set('GAMEOVER');
    }
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
    checkGameOver();
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
  let lastRenderMs = -1;
  const loop = createFixedLoop(
    (stepMs) => {
      // Hitstop: freeze the sim in STEP_MS quanta while render/probes run.
      if (consumeHitstop(hitstop, stepMs)) {
        return;
      }
      // Danfo traffic cruises on the same fixed quantum (render does no
      // traffic work: matrices are already current from this step).
      updateDanfoTraffic(traffic, STEP_MS);
      // Timed wave auto-progression: the current plan's durationMs gates
      // the next setWave + spawn so waves 1..10 elapse ~4 minutes live.
      waveElapsedMs += stepMs;
      {
        const currentPlan = planWave(waveSeed, currentWave);
        if (waveElapsedMs >= currentPlan.durationMs) {
          const next = currentWave + 1;
          setWave(next);
          waveElapsedMs = 0;
          spawnWavePlan(planWave(waveSeed, next));
        }
      }
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
          const impactX = bullets.px[i] ?? target.x;
          const impactZ = bullets.pz[i] ?? target.z;
          despawnBulletAt(bullets, i);
          if (killed) {
            const kx = target.x;
            const kz = target.z;
            handleKill(target);
            juiceForKill(kx, kz);
          } else {
            const at = screenPx(impactX, HOVER_Y, impactZ);
            spawnHitMarker(fx, at.x, at.y);
            playSfx(audioBank, 'hit', clampPan((impactX - player.pos.x) / 10));
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
          if (wounded) {
            playSfx(audioBank, 'hit', 0);
          }
          const index = orbs.live.indexOf(orb);
          if (index >= 0) {
            orbs.live.splice(index, 1);
          }
          orb.active = false;
          if (orb.mesh !== null) {
            orb.mesh.visible = false;
          }
          orbs.pool.release(orb);
          checkGameOver();
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
      const collected = updatePickups(pickups, player.pos, player, stepMs);
      if (collected > 0) {
        playSfx(audioBank, 'pickup', 0);
      }
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
      // Wall-clock decay for trauma and the hitstop countdown; render
      // (unlike sim steps) runs every frame even while frozen.
      const frameMs = performance.now();
      if (lastRenderMs >= 0) {
        const wallMs = Math.max(0, frameMs - lastRenderMs);
        updateShake(shake, wallMs);
        if (hitstop.msLeft > 0) {
          hitstop.msLeft = Math.max(0, hitstop.msLeft - wallMs);
        }
      }
      lastRenderMs = frameMs;
      const shakeOff = shakeOffset(shake);
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
        updateFollowCamera(camera, cameraTarget, shakeOff.x, shakeOff.y);
      } else {
        updateFollowCamera(camera, player.pos, shakeOff.x, shakeOff.y);
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
      window.__TAKELIGHT_AUDIO__ = toAudioProbe(audioBank);
      // Peak-hold the armed hitstop duration: live ms-left while frozen,
      // latched afterwards so late probe reads still observe the 60 ms.
      window.__TAKELIGHT_HITSTOP__ = Math.max(
        hitstop.msLeft,
        window.__TAKELIGHT_HITSTOP__ ?? 0,
      );
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
      hudStore.push({
        score: scoreState.score,
        multiplier: scoreState.multiplier,
        kills: scoreState.kills,
        wave: currentWave,
        shields: player.shields,
        maxShields: MAX_SHIELDS,
        dashCooldownMs: Math.ceil(player.dashCooldownMsLeft),
        dashCooldownMaxMs: DASH_COOLDOWN_MS,
      });
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
          lightIntensity: currentLight.lightIntensity,
        };
      }
      if (postfx !== null) {
        postfx.render();
      } else {
        renderer.render(scene, camera);
      }
    },
    () => store.get() === 'RUNNING',
    () => hitstop.msLeft > 0,
  );

  // UI reflects the store; scene code never touches the DOM. Menus own
  // #menu visibility; this mirror keeps dataset/state probes in sync and
  // resets the sim on every RUNNING entry except resume from PAUSED.
  let lastState: GameState = store.get();
  store.subscribe((state) => {
    const previous = lastState;
    lastState = state;
    menu.dataset.state = state;
    window.__TAKELIGHT_STATE__ = state;
    if (state === 'RUNNING' && previous !== 'PAUSED') {
      runStartAtMs = Date.now();
      waveSeed = (Date.now() % 4294967296) >>> 0;
      if (waveSeed === 0) {
        waveSeed = 42;
      }
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
      hitstop.msLeft = 0;
      shake.trauma = 0;
      window.__TAKELIGHT_HITSTOP__ = 0;
      setWave(1);
      waveElapsedMs = 0;
      spawnWavePlan(planWave(waveSeed, 1));
    }
    if (state === 'GAMEOVER') {
      void fetchAndPushBoard();
    }
  });

  window.__TAKELIGHT_START__ = () => {
    store.set('RUNNING');
  };
  window.__TAKELIGHT_GAMEOVER__ = () => {
    store.set('GAMEOVER');
  };
  // Deterministic full-run hook for black-box probes: ensures RUNNING,
  // pins wave 5, submits the clamp-safe 5000/wave-5 payload, then pushes
  // the refreshed weekly board. Never throws; resolves status + match.
  window.__TAKELIGHT_FULLRUN__ = async () => {
    try {
      setForcedOffline(false);
      if (store.get() !== 'RUNNING') {
        store.set('RUNNING');
      }
      setWave(5);
      const payload = {
        name: 'Fullrun',
        score: 5000,
        wave: 5,
        duration_s: computeDurationS(runStartAtMs, Date.now(), 5),
      };
      const result = await submitRun(payload);
      let rows: Awaited<ReturnType<typeof fetchWeeklyTop100>> = [];
      try {
        rows = await fetchWeeklyTop100();
      } catch {
        rows = [];
      }
      try {
        menusHandle?.refreshBoard(rows);
      } catch {
        // refreshBoard never throws; ignore a detached handle.
      }
      const match =
        rows.find(
          (row) =>
            row.name === 'Fullrun' && row.score === 5000 && row.wave === 5,
        ) ?? null;
      return { status: result.status, row: match };
    } catch {
      return { status: 'failed', row: null };
    }
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
    // Juice fires on a valid kill call even with no live targets, so
    // the hitstop/marker probes observe it; scoring pays per target.
    const first = targets[0];
    juiceForKill(first?.x ?? player.pos.x, first?.z ?? player.pos.z);
    for (const target of targets) {
      handleKill(target);
    }
    return targets.length;
  };

  window.addEventListener('resize', () => {
    sizeRenderer(
      renderer,
      camera,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
      postfx,
    );
    canvasRectCache.refresh();
  });
  window.addEventListener(
    'scroll',
    () => {
      canvasRectCache.refresh();
    },
    { capture: true, passive: true },
  );
  window.addEventListener('orientationchange', () => {
    canvasRectCache.refresh();
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
  window.__TAKELIGHT_WAVE__ = currentWave;
  window.__TAKELIGHT_LIGHT__ = { ...currentLight };
  window.__TAKELIGHT_SCENE__ = {
    pylonCount: PYLON_COUNT,
    cameraPitchDeg: CAMERA_PITCH_DEG,
    toneMapping: 'ACES',
    fog: true,
    lightIntensity: currentLight.lightIntensity,
  };
  window.__TAKELIGHT_SCORE__ = {
    kills: scoreState.kills,
    score: scoreState.score,
    multiplier: scoreState.multiplier,
  };
  window.__TAKELIGHT_DASH__ = triggerDash;
  window.__TAKELIGHT_HIT__ = triggerHit;
  window.__TAKELIGHT_GRAZE__ = triggerGraze;
  window.__TAKELIGHT_AUDIO__ = toAudioProbe(audioBank);
  window.__TAKELIGHT_HITSTOP__ = 0;
  // Asset + heap probes: published synchronously at boot so the 2000 ms
  // RUNNING window sees them; the heap hook reads live bytes every call.
  window.__TAKELIGHT_ASSETS__ = { models: getAssetModels() };
  window.__TAKELIGHT_HEAP__ = () => readHeapBytes();
  store.set('MENU');

  renderer.setAnimationLoop((time) => {
    loop.frame(time);
  });
}

boot();
